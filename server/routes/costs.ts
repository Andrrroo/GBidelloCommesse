import { Router } from 'express';
import { randomUUID } from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { costiViviStorage, costiGeneraliStorage, collaboratoriStorage } from '../storage.js';
import { insertCostoVivoSchema, insertCostoGeneraleSchema } from '@shared/schema';
import type { CostoGenerale } from '@shared/schema';
import { logActivity } from '../lib/activity-logger.js';
import { logger } from '../lib/logger.js';
import { parseBustaPagaPdf } from '../lib/payroll-pdf-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsPdfDir = path.join(__dirname, '..', '..', 'uploads', 'pdf');
if (!fs.existsSync(uploadsPdfDir)) {
  fs.mkdirSync(uploadsPdfDir, { recursive: true });
}

// Multer in-memory per l'upload multi-PDF: il buffer ci serve per il parser
// e solo DOPO lo scriviamo su disco (se il parse va a buon fine).
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 50 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Solo file PDF sono consentiti'));
  },
});

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

    // Abbonamenti ricorrenti: al primo salvataggio genero un `ricorrenzaId`
    // (UUID) che lega tutte le occorrenze future prodotte dall'auto-gen.
    // Se il client passa già un ricorrenzaId, rispetto il suo (utile se un
    // client smart volesse "agganciare" nuove occorrenze a una ricorrenza
    // esistente — non usato oggi dalla UI).
    if (data.categoria === 'abbonamento' && data.periodicita && !data.ricorrenzaId) {
      data.ricorrenzaId = randomUUID();
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

// Upload multi-PDF buste paga — flusso a 2 fasi:
//   1) POST .../upload-buste-paga      → parsea ogni PDF, salva su disco,
//      suggerisce il match con un dipendente per CF, NON modifica i costi.
//      Ritorna `previews[]` (admin può poi correggere campi in UI).
//   2) POST .../upload-buste-paga/commit → riceve gli items finalizzati e
//      crea/aggiorna i costi stipendi. L'admin può confermare o correggere.

// Guardia comune: solo admin, regex su fileUrl per evitare path traversal.
const UPLOADED_PDF_URL_REGEX = /^\/uploads\/pdf\/[A-Za-z0-9._-]+\.pdf$/;

costsRouter.post(
  '/api/costi-generali/upload-buste-paga',
  memoryUpload.array('files', 50),
  async (req, res) => {
    if (!isAdminReq(req)) {
      return res.status(403).json({ error: 'Solo gli amministratori possono caricare buste paga' });
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) return res.status(400).json({ error: 'Nessun file caricato' });

    const collaboratori = await collaboratoriStorage.readAll();
    const cfIndex = new Map<string, typeof collaboratori[number]>();
    for (const c of collaboratori) {
      if (c.codiceFiscale) cfIndex.set(c.codiceFiscale.toUpperCase(), c);
    }

    const previews: Array<{
      fileUrl: string;
      filename: string;
      // Dati estratti dal parser — editabili dall'admin in UI.
      codiceFiscale: string;
      periodo: string;
      meseLabel: string;
      nettoInBusta: number;
      nomePdf: string | null;
      // Match automatico via CF; null se da scegliere manualmente.
      collaboratoreId: string | null;
      collaboratoreNome: string | null;
      // Warning/info non bloccanti (es. "match non trovato, scegli manualmente").
      warning: string | null;
    }> = [];
    const failed: Array<{ filename: string; reason: string }> = [];

    for (const file of files) {
      try {
        const parsed = await parseBustaPagaPdf(file.buffer);
        const cf = parsed.codiceFiscale.toUpperCase();

        // Salvo comunque il file: il commit userà lo stesso fileUrl. Se
        // l'admin annulla, resta come file orfano (cleanup futuro via script).
        const uniqueName = `${Date.now()}-${randomUUID().slice(0, 8)}.pdf`;
        const diskPath = path.join(uploadsPdfDir, uniqueName);
        await fs.promises.writeFile(diskPath, file.buffer);
        const fileUrl = `/uploads/pdf/${uniqueName}`;

        const collab = cfIndex.get(cf);
        let collaboratoreId: string | null = null;
        let collaboratoreNome: string | null = null;
        let warning: string | null = null;
        if (!collab) {
          warning = `Nessun dipendente con codice fiscale ${cf}. Seleziona manualmente.`;
        } else if (!collab.active) {
          warning = `${collab.nome} ${collab.cognome} è disattivato.`;
          collaboratoreId = collab.id;
          collaboratoreNome = `${collab.nome} ${collab.cognome}`.trim();
        } else if (!collab.isDipendente) {
          warning = `${collab.nome} ${collab.cognome} non è marcato come dipendente.`;
          collaboratoreId = collab.id;
          collaboratoreNome = `${collab.nome} ${collab.cognome}`.trim();
        } else {
          collaboratoreId = collab.id;
          collaboratoreNome = `${collab.nome} ${collab.cognome}`.trim();
        }

        previews.push({
          fileUrl,
          filename: file.originalname,
          codiceFiscale: cf,
          periodo: parsed.periodo,
          meseLabel: parsed.meseLabel,
          nettoInBusta: parsed.nettoInBusta,
          nomePdf: parsed.nomePdf ?? null,
          collaboratoreId,
          collaboratoreNome,
          warning,
        });
      } catch (err: any) {
        failed.push({ filename: file.originalname, reason: err?.message || 'Errore parsing PDF' });
      }
    }

    res.json({ previews, failed });
  }
);

// Commit dopo review. Riceve l'array finalizzato dall'admin (fileUrl +
// collaboratoreId + periodo + nettoInBusta) e crea/aggiorna i costi.
costsRouter.post('/api/costi-generali/upload-buste-paga/commit', async (req, res) => {
  try {
    if (!isAdminReq(req)) {
      return res.status(403).json({ error: 'Solo gli amministratori possono confermare le buste paga' });
    }
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Nessuna busta paga da confermare' });
    }

    const collaboratori = await collaboratoriStorage.readAll();
    const costi = await costiGeneraliStorage.readAll();
    const todayIso = new Date().toISOString().slice(0, 10);

    const processed: Array<{ collaboratoreId: string; fornitore: string; periodo: string; importo: number; action: 'updated' | 'created'; costoId: string }> = [];
    const failed: Array<{ fileUrl: string; reason: string }> = [];

    const MESI_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const meseLabel = (periodo: string) => {
      const [y, m] = periodo.split('-').map(Number);
      return `${MESI_IT[m - 1]} ${y}`;
    };

    for (const raw of items) {
      try {
        const fileUrl = String(raw?.fileUrl || '');
        const collaboratoreId = String(raw?.collaboratoreId || '');
        const periodo = String(raw?.periodo || '');
        const nettoInBusta = Number(raw?.nettoInBusta);

        if (!UPLOADED_PDF_URL_REGEX.test(fileUrl)) throw new Error('fileUrl non valido');
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) throw new Error('periodo non valido (YYYY-MM)');
        if (!isFinite(nettoInBusta) || nettoInBusta <= 0) throw new Error('nettoInBusta non valido');
        if (!collaboratoreId) throw new Error('collaboratoreId mancante');

        const collab = collaboratori.find(c => c.id === collaboratoreId);
        if (!collab) throw new Error('dipendente non trovato');
        if (!collab.active || !collab.isDipendente) throw new Error('il collaboratore non è un dipendente attivo');

        // Verifico che il file esista su disco (evita orfani forgiati).
        const diskPath = path.join(uploadsPdfDir, path.basename(fileUrl));
        if (!fs.existsSync(diskPath)) throw new Error('file PDF non più disponibile');

        const existing = costi.find(
          c => c.categoria === 'stipendi' && c.collaboratoreId === collab.id && c.periodo === periodo
        );
        const fornitoreName = `${collab.nome} ${collab.cognome}`.trim();

        if (existing) {
          const updated = await costiGeneraliStorage.update(existing.id, {
            importo: nettoInBusta,
            allegato: fileUrl,
            pagato: true,
            dataPagamento: todayIso,
          });
          if (!updated) throw new Error('aggiornamento costo fallito');
          processed.push({
            collaboratoreId: collab.id,
            fornitore: updated.fornitore,
            periodo,
            importo: nettoInBusta,
            action: 'updated',
            costoId: updated.id,
          });
        } else {
          const nuovo: CostoGenerale = {
            id: randomUUID(),
            categoria: 'stipendi',
            fornitore: fornitoreName,
            descrizione: `Busta paga ${meseLabel(periodo)}`,
            data: todayIso,
            dataScadenza: todayIso,
            importo: nettoInBusta,
            pagato: true,
            dataPagamento: todayIso,
            allegato: fileUrl,
            collaboratoreId: collab.id,
            periodo,
          };
          await costiGeneraliStorage.create(nuovo);
          costi.push(nuovo);
          processed.push({
            collaboratoreId: collab.id,
            fornitore: fornitoreName,
            periodo,
            importo: nettoInBusta,
            action: 'created',
            costoId: nuovo.id,
          });
        }
      } catch (err: any) {
        failed.push({ fileUrl: String(raw?.fileUrl || ''), reason: err?.message || 'errore commit' });
      }
    }

    if (processed.length > 0) {
      await logActivity(req, {
        action: 'create',
        entityType: 'costo_generale',
        entityId: `upload-buste-paga-${Date.now()}`,
        details: `Upload buste paga confermato: ${processed.length} create/aggiornate, ${failed.length} fallite`,
      });
    }

    res.json({ processed, failed });
  } catch (err) {
    logger.error('Commit buste paga fallito', { err });
    res.status(500).json({ error: 'Errore durante il commit' });
  }
});

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
