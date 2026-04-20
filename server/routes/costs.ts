import { Router } from 'express';
import { randomUUID } from 'crypto';
import { costiViviStorage, costiGeneraliStorage } from '../storage.js';
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
  try { res.json(await costiGeneraliStorage.readAll()); }
  catch { res.status(500).json({ error: 'Failed to fetch costi generali' }); }
});
costsRouter.get('/api/costi-generali/:id', async (req, res) => {
  try {
    const c = await costiGeneraliStorage.findById(req.params.id);
    c ? res.json(c) : res.status(404).json({ error: 'Costo not found' });
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch costo' }); }
});
costsRouter.post('/api/costi-generali', async (req, res) => {
  try {
    const result = insertCostoGeneraleSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const costo = { id: randomUUID(), ...result.data };
    await costiGeneraliStorage.create(costo);

    await logActivity(req, {
      action: 'create',
      entityType: 'costo_generale',
      entityId: costo.id,
      details: `${result.data.categoria} · ${result.data.fornitore} · ${formatEuro(result.data.importo)}`,
    });

    res.status(201).json(costo);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to create costo' }); }
});

async function handleUpdateCostoGenerale(req: import('express').Request, res: import('express').Response) {
  try {
    const result = insertCostoGeneraleSchema.partial().safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const updated = await costiGeneraliStorage.update(req.params.id, result.data);
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
