import { Router } from 'express';
import { randomUUID } from 'crypto';
import { costiViviStorage, costiGeneraliStorage, collaboratoriStorage } from '../storage.js';
import { insertCostoVivoSchema, insertCostoGeneraleSchema } from '@shared/schema';
import { logActivity } from '../lib/activity-logger.js';
import { logger } from '../lib/logger.js';

export const costsRouter = Router();

function formatEuroFromCents(cents: number): string {
  return (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}
function formatEuro(amount: number): string {
  return amount.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

// I costi "stipendi" sono informazione di payroll: non devono essere visibili
// né modificabili da non-admin. Filtro/guard applicati a tutte le route REST
// su /api/costi-generali oltre al sanitize già fatto su /api/collaboratori.
function isAdminReq(req: import('express').Request): boolean {
  return req.session?.user?.role === 'amministratore';
}

// --- Costi Vivi ---
costsRouter.get('/api/costi-vivi', async (req, res) => {
  try { res.json(await costiViviStorage.readAll()); }
  catch { res.status(500).json({ error: 'Failed to fetch costi vivi' }); }
});
costsRouter.get('/api/costi-vivi/:id', async (req, res) => {
  try {
    const c = await costiViviStorage.findById(req.params.id);
    c ? res.json(c) : res.status(404).json({ error: 'Costo not found' });
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch costo' }); }
});
costsRouter.get('/api/costi-vivi/project/:projectId', async (req, res) => {
  try { res.json(await costiViviStorage.findByField('projectId', req.params.projectId)); }
  catch { res.status(500).json({ error: 'Failed to fetch costi for project' }); }
});
costsRouter.post('/api/costi-vivi', async (req, res) => {
  try {
    const result = insertCostoVivoSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const costo = { id: randomUUID(), ...result.data };
    await costiViviStorage.create(costo);

    await logActivity(req, {
      action: 'create',
      entityType: 'costo_vivo',
      entityId: costo.id,
      details: `${result.data.tipologia} · ${formatEuroFromCents(result.data.importo)} · ${result.data.descrizione}`,
    });

    res.status(201).json(costo);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to create costo' }); }
});
costsRouter.put('/api/costi-vivi/:id', async (req, res) => {
  try {
    const result = insertCostoVivoSchema.partial().safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const updated = await costiViviStorage.update(req.params.id, result.data);
    if (!updated) return res.status(404).json({ error: 'Costo not found' });

    await logActivity(req, {
      action: 'update',
      entityType: 'costo_vivo',
      entityId: updated.id,
      details: `${updated.descrizione} (campi: ${Object.keys(result.data).join(', ')})`,
    });

    res.json(updated);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to update costo' }); }
});
costsRouter.delete('/api/costi-vivi/:id', async (req, res) => {
  try {
    const costo = await costiViviStorage.findById(req.params.id);
    const deleted = await costiViviStorage.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Costo not found' });

    if (costo) {
      await logActivity(req, {
        action: 'delete',
        entityType: 'costo_vivo',
        entityId: costo.id,
        details: `${costo.tipologia} · ${formatEuroFromCents(costo.importo)} · ${costo.descrizione}`,
      });
    }
    res.status(204).send();
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to delete costo' }); }
});

// --- Costi Generali ---
costsRouter.get('/api/costi-generali', async (req, res) => {
  try {
    const all = await costiGeneraliStorage.readAll();
    const visible = isAdminReq(req) ? all : all.filter(c => c.categoria !== 'stipendi');
    res.json(visible);
  } catch { res.status(500).json({ error: 'Failed to fetch costi generali' }); }
});
costsRouter.get('/api/costi-generali/:id', async (req, res) => {
  try {
    const c = await costiGeneraliStorage.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Costo not found' });
    // Stipendi non visibili a non-admin: 404 (non esporre l'esistenza).
    if (c.categoria === 'stipendi' && !isAdminReq(req)) return res.status(404).json({ error: 'Costo not found' });
    res.json(c);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch costo' }); }
});
costsRouter.post('/api/costi-generali', async (req, res) => {
  try {
    const result = insertCostoGeneraleSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    // Creazione stipendi riservata agli admin (payroll).
    if (result.data.categoria === 'stipendi' && !isAdminReq(req)) {
      return res.status(403).json({ error: 'Solo gli amministratori possono creare costi di categoria stipendi' });
    }

    // Per la categoria stipendi, importo/fornitore sono derivati dal
    // collaboratore referenziato. L'eventuale valore inviato dal client è
    // ignorato: lo stipendio si modifica solo dall'anagrafica collaboratori.
    const data = { ...result.data };
    if (data.categoria === 'stipendi') {
      if (!data.collaboratoreId) {
        return res.status(400).json({ error: 'collaboratoreId obbligatorio per la categoria stipendi' });
      }
      const collab = await collaboratoriStorage.findById(data.collaboratoreId);
      if (!collab || !collab.active || !collab.isDipendente || typeof collab.stipendioMensile !== 'number' || collab.stipendioMensile <= 0) {
        return res.status(400).json({ error: 'Dipendente non valido o senza stipendio configurato' });
      }
      data.importo = collab.stipendioMensile;
      data.fornitore = `${collab.nome} ${collab.cognome}`.trim();
    }

    const costo = { id: randomUUID(), ...data };
    await costiGeneraliStorage.create(costo);

    await logActivity(req, {
      action: 'create',
      entityType: 'costo_generale',
      entityId: costo.id,
      details: `${data.categoria} · ${data.fornitore} · ${formatEuro(data.importo)}`,
    });

    res.status(201).json(costo);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to create costo' }); }
});

// Generazione buste paga: non c'è più un endpoint batch manuale. Il bootstrap
// parte da `ensurePayrollBootstrap` in `lib/payroll-auto-gen.ts` quando il
// Collaboratore viene salvato dipendente+stipendio; il cron `runPayrollAutoGen`
// crea ricorsivamente le buste paga dei mesi successivi.

async function handleUpdateCostoGenerale(req: import('express').Request, res: import('express').Response) {
  try {
    const result = insertCostoGeneraleSchema.partial().safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });

    const existing = await costiGeneraliStorage.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Costo not found' });

    // Guard stipendi per non-admin: nessuna modifica a record esistenti di
    // categoria stipendi, né cambio di categoria verso stipendi.
    if (!isAdminReq(req)) {
      if (existing.categoria === 'stipendi') return res.status(404).json({ error: 'Costo not found' });
      if (result.data.categoria === 'stipendi') {
        return res.status(403).json({ error: 'Solo gli amministratori possono assegnare la categoria stipendi' });
      }
    }

    // Se il record è stipendi, importo/fornitore/collaboratoreId sono immutabili
    // dal form costi generali: lo stipendio si modifica solo dall'anagrafica
    // collaboratori (e si ri-materializza nei batch futuri). Non permettiamo
    // neppure di cambiare categoria di un costo stipendi in qualcos'altro:
    // manterrebbe il link al dipendente con una categoria incongruente.
    let patch = result.data;
    if (existing.categoria === 'stipendi') {
      if (patch.categoria !== undefined && patch.categoria !== 'stipendi') {
        return res.status(400).json({ error: 'Non è possibile cambiare categoria a un record stipendi' });
      }
      const { importo, fornitore, collaboratoreId, periodo, ...rest } = patch;
      patch = rest;
    }

    const updated = await costiGeneraliStorage.update(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: 'Costo not found' });

    // Se è stato toccato `pagato` lo trattiamo come payment event
    const isPaymentEvent = 'pagato' in (result.data as Record<string, unknown>);
    await logActivity(req, {
      action: isPaymentEvent ? 'payment' : 'update',
      entityType: 'costo_generale',
      entityId: updated.id,
      details: isPaymentEvent
        ? `${updated.fornitore} · ${formatEuro(updated.importo)} · ${updated.pagato ? 'pagato' : 'non pagato'}`
        : `${updated.fornitore} · ${formatEuro(updated.importo)} (campi: ${Object.keys(result.data).join(', ')})`,
    });

    res.json(updated);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to update costo' }); }
}
costsRouter.put('/api/costi-generali/:id', handleUpdateCostoGenerale);
costsRouter.patch('/api/costi-generali/:id', handleUpdateCostoGenerale);

costsRouter.delete('/api/costi-generali/:id', async (req, res) => {
  try {
    const costo = await costiGeneraliStorage.findById(req.params.id);
    // Stipendi non eliminabili da non-admin (e invisibili → 404).
    if (costo && costo.categoria === 'stipendi' && !isAdminReq(req)) {
      return res.status(404).json({ error: 'Costo not found' });
    }
    const deleted = await costiGeneraliStorage.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Costo not found' });

    if (costo) {
      await logActivity(req, {
        action: 'delete',
        entityType: 'costo_generale',
        entityId: costo.id,
        details: `${costo.categoria} · ${costo.fornitore} · ${formatEuro(costo.importo)}`,
      });
    }
    res.status(204).send();
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to delete costo' }); }
});

// Profili Costo rimossi: unificati nell'anagrafica Collaboratori
// (Collaboratore ha già ruolo + costoOrario, che coprono lo stesso caso d'uso).
