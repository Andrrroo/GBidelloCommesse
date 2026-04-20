import { Router } from 'express';
import { randomUUID } from 'crypto';
import {
  projectsStorage, fattureEmesseStorage, fattureIngressoStorage,
  fattureConsulentiStorage, costiViviStorage, prestazioniStorage,
  scadenzeStorage, comunicazioniStorage, projectTagsStorage, projectResourcesStorage,
  activityLogsStorage, fileRoutingsStorage
} from '../storage.js';
import { insertProjectSchema, categoriaLavoroRefinement, projectPrestazioniSchema } from '@shared/schema';
import type { InsertProject } from '@shared/schema';
import { logger } from '../lib/logger.js';
import { apiLimiter } from '../middleware/rate-limit.js';
import { logActivity } from '../lib/activity-logger.js';

export const projectsRouter = Router();

/**
 * Genera un codice univoco con prefisso CLIENTE-CITTA-YY e progressivo NN.
 * Puro (no side effects): nessun record riservato qui — è solo un'anteprima
 * per il frontend. L'unicità reale è garantita al POST /api/projects,
 * che rigenera il progressivo se una corsa concorrente l'ha già usato.
 */
function buildProjectCode(
  existing: { code: string }[],
  client: string,
  city: string,
  year: number
): string {
  const clientAbbr = client.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 4);
  const cityAbbr = city.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 3);
  const yearStr = String(year % 100).padStart(2, '0');
  const prefix = `${clientAbbr}-${cityAbbr}-${yearStr}`;

  const usedProgressives = new Set<number>();
  for (const p of existing) {
    if (!p.code.startsWith(prefix)) continue;
    // Il formato codice è PREFIX + NN (due cifre attaccate all'anno YY,
    // senza trattino): es prefix="SEWE-CAR-25" + "01" = "SEWE-CAR-2501".
    const suffix = p.code.slice(prefix.length);
    if (/^\d{2}$/.test(suffix)) usedProgressives.add(parseInt(suffix, 10));
  }
  let progressive = 1;
  while (usedProgressives.has(progressive)) progressive++;
  return `${prefix}${String(progressive).padStart(2, '0')}`;
}

projectsRouter.post('/api/generate-code', apiLimiter, async (req, res) => {
  try {
    const { client, city, year } = req.body;
    if (!client || !city || year === undefined) {
      return res.status(400).json({ error: 'Client, city and year are required' });
    }

    const allProjects = await projectsStorage.readAll();
    const code = buildProjectCode(allProjects, client, city, Number(year));
    res.json({ code });
  } catch (error) {
    logger.error('Code generation error', { err: error });
    res.status(500).json({ error: 'Failed to generate project code' });
  }
});

projectsRouter.get('/api/projects', async (req, res) => {
  try {
    const projects = await projectsStorage.readAll();
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

projectsRouter.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await projectsStorage.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

projectsRouter.post('/api/projects', async (req, res) => {
  try {
    const validationResult = insertProjectSchema.superRefine(categoriaLavoroRefinement).safeParse(req.body);
    if (!validationResult.success) {
      const errors = validationResult.error.flatten();
      return res.status(400).json({ error: 'Validation error', details: errors.fieldErrors });
    }

    // Unicità del code garantita sotto lock dello storage projects.
    // Se il code fornito dal frontend è già stato preso da una richiesta
    // concorrente tra /generate-code e POST, ricalcoliamo un nuovo
    // progressivo libero dal prefisso CLIENTE-CITTA-YY.
    const project = await projectsStorage.withLock(async () => {
      const all = await projectsStorage.readAll();
      let finalCode = validationResult.data.code;
      if (all.some(p => p.code === finalCode)) {
        finalCode = buildProjectCode(
          all,
          validationResult.data.client,
          validationResult.data.city,
          validationResult.data.year
        );
      }
      // createdAt: usa quello fornito dal client se presente (per caricare
      // commesse passate con la data corretta), altrimenti il timestamp attuale.
      const providedCreatedAt = validationResult.data.createdAt;
      const newProject = {
        id: randomUUID(),
        ...validationResult.data,
        code: finalCode,
        createdAt: providedCreatedAt || new Date().toISOString(),
      };
      all.push(newProject);
      await projectsStorage.writeAll(all);
      return newProject;
    });

    await logActivity(req, {
      action: 'create',
      entityType: 'project',
      entityId: project.id,
      details: `${project.code} — ${project.client} · ${project.object}`,
    });

    res.status(201).json(project);
  } catch (error) {
    logger.error('Project creation error', { err: error });
    res.status(500).json({ error: 'Failed to create project' });
  }
});

projectsRouter.put('/api/projects/:id', async (req, res) => {
  try {
    const result = insertProjectSchema.partial().safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });

    // Refinement condizionale: se dopo il merge la commessa diventa "Lavoro Professionale"
    // (manutenzione === false) deve avere categoriaLavoro valorizzata.
    const existing = await projectsStorage.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const merged = { ...existing, ...result.data };
    if (!merged.manutenzione && !merged.categoriaLavoro) {
      return res.status(400).json({
        error: 'Validation error',
        details: { categoriaLavoro: ['La categoria è obbligatoria per Lavoro Professionale'] },
      });
    }

    const updated = await projectsStorage.update(req.params.id, result.data);
    if (!updated) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Descrivi cosa è cambiato: se è cambiato lo status lo dichiariamo
    // esplicitamente (cambio frequente e significativo), altrimenti elenchiamo
    // i campi modificati.
    const changedKeys = Object.keys(result.data);
    const statusChange = result.data.status && result.data.status !== existing.status
      ? `status: ${existing.status} → ${result.data.status}`
      : null;
    const detailsParts = [
      updated.code,
      statusChange ?? `campi modificati: ${changedKeys.join(', ')}`,
    ];
    await logActivity(req, {
      action: 'update',
      entityType: 'project',
      entityId: updated.id,
      details: detailsParts.join(' — '),
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

projectsRouter.put('/api/projects/:id/prestazioni', async (req, res) => {
  try {
    const parsed = projectPrestazioniSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const project = await projectsStorage.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const currentMetadata = project.metadata || {};
    const updated = await projectsStorage.update(req.params.id, {
      metadata: { ...currentMetadata, ...parsed.data }
    });

    await logActivity(req, {
      action: 'update',
      entityType: 'project',
      entityId: req.params.id,
      details: `${project.code} — prestazioni/DM143 aggiornate`,
    });

    res.json(updated);
  } catch (error) {
    logger.error('Prestazioni update error', { err: error });
    res.status(500).json({ error: 'Failed to update prestazioni' });
  }
});

projectsRouter.delete('/api/projects/:id', async (req, res) => {
  try {
    const projectId = req.params.id;
    const project = await projectsStorage.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Cascade delete: elimina tutte le entita' associate al progetto
    const [fi, fe, fc, cv, pr, sc, co, res2] = await Promise.all([
      fattureIngressoStorage.findByField('projectId', projectId),
      fattureEmesseStorage.findByField('projectId', projectId),
      fattureConsulentiStorage.findByField('projectId', projectId),
      costiViviStorage.findByField('projectId', projectId),
      prestazioniStorage.findByField('projectId', projectId),
      scadenzeStorage.findByField('projectId', projectId),
      comunicazioniStorage.findByField('projectId', projectId),
      projectResourcesStorage.findByField('projectId', projectId),
    ]);

    for (const item of fi) await fattureIngressoStorage.delete(item.id);
    for (const item of fe) await fattureEmesseStorage.delete(item.id);
    for (const item of fc) await fattureConsulentiStorage.delete(item.id);
    for (const item of cv) await costiViviStorage.delete(item.id);
    for (const item of pr) await prestazioniStorage.delete(item.id);
    for (const item of sc) await scadenzeStorage.delete(item.id);
    for (const item of co) await comunicazioniStorage.delete(item.id);
    for (const item of res2) await projectResourcesStorage.delete(item.id);

    const tags = await projectTagsStorage.readAll();
    for (const tag of tags.filter(t => t.projectId === projectId)) {
      await projectTagsStorage.delete(tag.id);
    }

    // Activity logs e file routings collegati al progetto
    const allLogs = await activityLogsStorage.readAll();
    for (const log of allLogs.filter(l => l.entityId === projectId)) {
      await activityLogsStorage.delete(log.id);
    }
    const allRoutings = await fileRoutingsStorage.readAll();
    for (const routing of allRoutings.filter(r => r.projectId === projectId)) {
      await fileRoutingsStorage.delete(routing.id);
    }

    await projectsStorage.delete(projectId);

    await logActivity(req, {
      action: 'delete',
      entityType: 'project',
      entityId: projectId,
      details: `${project.code} — ${project.client} (eliminata con ${fi.length + fe.length + fc.length} fatture, ${cv.length} costi vivi, ${pr.length} prestazioni)`,
    });

    res.status(204).send();
  } catch (error) {
    logger.error('Project deletion error', { err: error });
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

projectsRouter.get('/api/projects/:id/summary', async (req, res) => {
  try {
    const projectId = req.params.id;
    const fattureEmesse = await fattureEmesseStorage.findByField('projectId', projectId);
    const totaleEmesso = fattureEmesse.reduce((acc, f) => acc + f.importoTotale, 0);
    const totaleIncassato = fattureEmesse.filter(f => f.incassata).reduce((acc, f) => acc + f.importoTotale, 0);

    const fattureIngresso = await fattureIngressoStorage.findByField('projectId', projectId);
    const totaleFattureIngresso = fattureIngresso.reduce((acc, f) => acc + f.importo, 0) / 100; // importi salvati in centesimi

    const fattureConsulenti = await fattureConsulentiStorage.findByField('projectId', projectId);
    const totaleFattureConsulenti = fattureConsulenti.reduce((acc, f) => acc + f.importo, 0);

    const costiVivi = await costiViviStorage.findByField('projectId', projectId);
    const totaleCostiVivi = costiVivi.reduce((acc, c) => acc + c.importo, 0) / 100; // importi salvati in centesimi

    // Manodopera: calcolata dalle risorse progetto (oreLavorate * costoOrario in centesimi → euro)
    const resources = await projectResourcesStorage.findByField('projectId', projectId);
    const totalePrestazioni = resources.reduce((acc, r) => acc + ((r.oreLavorate || 0) * (r.costoOrario || 0)), 0) / 100;

    const totaleCosti = totaleFattureIngresso + totaleFattureConsulenti + totaleCostiVivi + totalePrestazioni;
    const margine = totaleEmesso - totaleCosti;
    const marginePercentuale = totaleEmesso > 0 ? (margine / totaleEmesso) * 100 : 0;

    // Timeline: tutti gli eventi finanziari ordinati per data
    const timeline = [
      ...fattureEmesse.map(f => ({ data: f.dataEmissione, tipo: 'emessa' as const, importo: f.importoTotale, incassata: f.incassata, descrizione: f.descrizione })),
      ...fattureIngresso.map(f => ({ data: f.dataEmissione, tipo: 'ingresso' as const, importo: f.importo / 100, pagata: f.pagata, descrizione: f.descrizione })),
      ...fattureConsulenti.map(f => ({ data: f.dataEmissione, tipo: 'consulente' as const, importo: f.importo, pagata: f.pagata, descrizione: f.descrizione })),
      ...costiVivi.map(c => ({ data: c.data, tipo: 'costo_vivo' as const, importo: c.importo / 100, descrizione: c.descrizione })),
    ].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

    // Breakdown per il pie chart "Entrate per fattura / Uscite per fornitore":
    // stesso pattern della dashboard home ma scoped sulla singola commessa.
    // Entrate: una voce per fattura emessa (#numero — descrizione troncata).
    const entrateBreakdown = fattureEmesse
      .filter(f => f.importoTotale > 0)
      .map(f => {
        const num = f.numeroFattura ? `#${f.numeroFattura}` : '';
        const desc = f.descrizione ? (f.descrizione.length > 40 ? f.descrizione.slice(0, 39) + '…' : f.descrizione) : '';
        const name = [num, desc].filter(Boolean).join(' · ') || f.cliente || 'Fattura senza riferimento';
        return { name, value: f.importoTotale };
      });

    // Uscite aggregate per fornitore/consulente/tipologia/risorsa.
    const usciteMap = new Map<string, number>();
    const bump = (key: string, value: number) => {
      if (value > 0) usciteMap.set(key, (usciteMap.get(key) || 0) + value);
    };
    for (const f of fattureIngresso) bump(f.fornitore || 'Fornitore non specificato', f.importo / 100);
    for (const f of fattureConsulenti) bump(`${f.consulente || 'Consulente non specificato'} (Consulente)`, f.importo);
    for (const c of costiVivi) bump(`${c.tipologia || 'altro'} (Costo vivo)`, c.importo / 100);
    for (const r of resources) {
      const manodopera = ((r.oreLavorate || 0) * (r.costoOrario || 0)) / 100;
      if (manodopera > 0) bump(`${r.userName || 'Risorsa'} (Manodopera)`, manodopera);
    }
    const usciteBreakdown = Array.from(usciteMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Riepilogo completo per tutti gli utenti autenticati (i collaboratori
    // gestiscono fatture/costi/commesse quindi hanno accesso al bilancio
    // economico della singola commessa).
    res.json({
      fattureEmesse: { count: fattureEmesse.length, totale: totaleEmesso, incassato: totaleIncassato },
      costi: {
        fattureIngresso: { count: fattureIngresso.length, totale: totaleFattureIngresso },
        fattureConsulenti: { count: fattureConsulenti.length, totale: totaleFattureConsulenti },
        costiVivi: { count: costiVivi.length, totale: totaleCostiVivi },
        prestazioni: { count: resources.length, totale: totalePrestazioni },
        totale: totaleCosti
      },
      margine,
      marginePercentuale,
      timeline,
      entrateBreakdown,
      usciteBreakdown,
    });
  } catch (error) {
    logger.error('Project summary error', { err: error });
    res.status(500).json({ error: 'Failed to fetch project summary' });
  }
});
