import { Router } from 'express';
import { randomUUID } from 'crypto';
import { prestazioniStorage, scadenzeStorage, comunicazioniStorage, projectResourcesStorage, usersStorage, dipendentiStorage, activityLogsStorage } from '../storage.js';
import { insertPrestazioneSchema, insertScadenzaSchema, insertComunicazioneSchema } from '@shared/schema';
import { logActivity } from '../lib/activity-logger.js';
import { logger } from '../lib/logger.js';

// Ricalcola oreLavorate per una risorsa progetto in base alle prestazioni
// matcher: cerca la risorsa per dipendenteId (se disponibile) o userName
async function syncOreLavorate(projectId: string, userId: string, userName?: string) {
  const prestazioni = await prestazioniStorage.readAll();
  const totaleOre = prestazioni
    .filter(p => p.projectId === projectId && p.userId === userId)
    .reduce((acc, p) => acc + p.oreLavoro, 0);

  const risorse = await projectResourcesStorage.readAll();
  // Match per userName (la prestazione ha userName dello user del sistema, la risorsa ha userName del collaboratore)
  // oppure tentativo con userId (se una risorsa fosse collegata a uno user)
  const risorsa = risorse.find(r =>
    r.projectId === projectId && (
      (userName && r.userName === userName) ||
      r.dipendenteId === userId
    )
  );
  if (risorsa) {
    await projectResourcesStorage.update(risorsa.id, { oreLavorate: totaleOre });
  }
}

export const operationsRouter = Router();

// Rimuove costoOrario dalla risposta per non-admin (pattern identico a
// sanitizeResource / sanitize collaboratori). La prestazione è leggibile
// a tutti ma il costo orario è informazione stipendiale sensibile.
function sanitizePrestazione(p: any, isAdmin: boolean) {
  if (isAdmin) return p;
  const { costoOrario, ...rest } = p;
  return rest;
}

// --- Prestazioni ---
operationsRouter.get('/api/prestazioni', async (req, res) => {
  try {
    const isAdmin = req.session?.user?.role === 'amministratore';
    const all = await prestazioniStorage.readAll();
    res.json(all.map(p => sanitizePrestazione(p, isAdmin)));
  }
  catch { res.status(500).json({ error: 'Failed to fetch prestazioni' }); }
});
operationsRouter.get('/api/prestazioni/:id', async (req, res) => {
  try {
    const isAdmin = req.session?.user?.role === 'amministratore';
    const p = await prestazioniStorage.findById(req.params.id);
    p ? res.json(sanitizePrestazione(p, isAdmin)) : res.status(404).json({ error: 'Prestazione not found' });
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch prestazione' }); }
});
operationsRouter.get('/api/prestazioni/project/:projectId', async (req, res) => {
  try {
    const isAdmin = req.session?.user?.role === 'amministratore';
    const all = await prestazioniStorage.findByField('projectId', req.params.projectId);
    res.json(all.map(p => sanitizePrestazione(p, isAdmin)));
  }
  catch { res.status(500).json({ error: 'Failed to fetch prestazioni for project' }); }
});
operationsRouter.post('/api/prestazioni', async (req, res) => {
  try {
    const result = insertPrestazioneSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });

    // Auto-compila costoOrario dal collaboratore associato all'utente
    // se non fornito o zero.
    let costoOrario = result.data.costoOrario;
    if (!costoOrario || costoOrario <= 0) {
      const user = await usersStorage.findById(result.data.userId);
      if (user?.dipendenteId) {
        const collab = await dipendentiStorage.findById(user.dipendenteId);
        if (collab) costoOrario = collab.costoOrario;
      }
    }

    const item = { id: randomUUID(), ...result.data, costoOrario };
    await prestazioniStorage.create(item);

    // Fix 1: Aggiorna oreLavorate nella risorsa progetto
    await syncOreLavorate(result.data.projectId, result.data.userId, result.data.userName);

    await logActivity(req, {
      action: 'create',
      entityType: 'prestazione',
      entityId: item.id,
      details: `${result.data.oreLavoro}h · ${result.data.userName} · ${result.data.descrizione || 'senza descrizione'}`,
    });

    res.status(201).json(item);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to create prestazione' }); }
});
operationsRouter.put('/api/prestazioni/:id', async (req, res) => {
  try {
    const result = insertPrestazioneSchema.partial().safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const updated = await prestazioniStorage.update(req.params.id, result.data);
    if (!updated) return res.status(404).json({ error: 'Prestazione not found' });

    // Fix 1: Aggiorna oreLavorate nella risorsa progetto
    await syncOreLavorate(updated.projectId, updated.userId, updated.userName);

    await logActivity(req, {
      action: 'update',
      entityType: 'prestazione',
      entityId: updated.id,
      details: `${updated.oreLavoro}h · ${updated.userName} (campi: ${Object.keys(result.data).join(', ')})`,
    });

    res.json(updated);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to update prestazione' }); }
});
operationsRouter.delete('/api/prestazioni/:id', async (req, res) => {
  try {
    // Leggi la prestazione prima di eliminarla per avere projectId e userId
    const prestazione = await prestazioniStorage.findById(req.params.id);
    const deleted = await prestazioniStorage.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Prestazione not found' });

    // Fix 1: Aggiorna oreLavorate nella risorsa progetto
    if (prestazione) {
      await syncOreLavorate(prestazione.projectId, prestazione.userId, prestazione.userName);

      await logActivity(req, {
        action: 'delete',
        entityType: 'prestazione',
        entityId: prestazione.id,
        details: `${prestazione.oreLavoro}h · ${prestazione.userName}`,
      });
    }

    res.status(204).send();
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to delete prestazione' }); }
});

// --- Scadenze ---
operationsRouter.get('/api/scadenze', async (req, res) => {
  try { res.json(await scadenzeStorage.readAll()); }
  catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch scadenze' }); }
});
operationsRouter.get('/api/scadenze/:id', async (req, res) => {
  try {
    const s = await scadenzeStorage.findById(req.params.id);
    s ? res.json(s) : res.status(404).json({ error: 'Scadenza not found' });
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch scadenza' }); }
});
operationsRouter.get('/api/scadenze/project/:projectId', async (req, res) => {
  try { res.json(await scadenzeStorage.findByField('projectId', req.params.projectId)); }
  catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch scadenze for project' }); }
});
operationsRouter.post('/api/scadenze', async (req, res) => {
  try {
    const result = insertScadenzaSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const item = { id: randomUUID(), ...result.data };
    await scadenzeStorage.create(item);

    await logActivity(req, {
      action: 'create',
      entityType: 'scadenza',
      entityId: item.id,
      details: `${result.data.titolo || 'Scadenza'} · ${result.data.data || ''}`,
    });

    res.status(201).json(item);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to create scadenza' }); }
});
operationsRouter.put('/api/scadenze/:id', async (req, res) => {
  try {
    const result = insertScadenzaSchema.partial().safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const updated = await scadenzeStorage.update(req.params.id, result.data);
    if (!updated) return res.status(404).json({ error: 'Scadenza not found' });

    await logActivity(req, {
      action: 'update',
      entityType: 'scadenza',
      entityId: updated.id,
      details: `${updated.titolo || 'Scadenza'} (campi: ${Object.keys(result.data).join(', ')})`,
    });

    res.json(updated);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to update scadenza' }); }
});
operationsRouter.delete('/api/scadenze/:id', async (req, res) => {
  try {
    const scadenza = await scadenzeStorage.findById(req.params.id);
    const deleted = await scadenzeStorage.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Scadenza not found' });

    if (scadenza) {
      await logActivity(req, {
        action: 'delete',
        entityType: 'scadenza',
        entityId: scadenza.id,
        details: `${scadenza.titolo || 'Scadenza'}`,
      });
    }
    res.status(204).send();
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to delete scadenza' }); }
});

// --- Comunicazioni ---
operationsRouter.get('/api/comunicazioni', async (req, res) => {
  try { res.json(await comunicazioniStorage.readAll()); }
  catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch comunicazioni' }); }
});
operationsRouter.get('/api/comunicazioni/:id', async (req, res) => {
  try {
    const c = await comunicazioniStorage.findById(req.params.id);
    c ? res.json(c) : res.status(404).json({ error: 'Comunicazione not found' });
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch comunicazione' }); }
});
operationsRouter.get('/api/comunicazioni/project/:projectId', async (req, res) => {
  try { res.json(await comunicazioniStorage.findByField('projectId', req.params.projectId)); }
  catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch comunicazioni for project' }); }
});
operationsRouter.post('/api/comunicazioni', async (req, res) => {
  try {
    const result = insertComunicazioneSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const item = { id: randomUUID(), ...result.data };
    await comunicazioniStorage.create(item);

    // Fix 3: Auto-crea activity log per la comunicazione
    if (req.session?.user) {
      await activityLogsStorage.create({
        id: randomUUID(),
        userId: req.session.user.id,
        userName: req.session.user.nome,
        action: 'create',
        entityType: 'comunicazione',
        entityId: item.id,
        details: `Nuova ${result.data.tipo}: ${result.data.oggetto}`,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json(item);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to create comunicazione' }); }
});
operationsRouter.put('/api/comunicazioni/:id', async (req, res) => {
  try {
    const result = insertComunicazioneSchema.partial().safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const updated = await comunicazioniStorage.update(req.params.id, result.data);
    if (!updated) return res.status(404).json({ error: 'Comunicazione not found' });
    await logActivity(req, {
      action: 'update',
      entityType: 'comunicazione',
      entityId: updated.id,
      details: `${updated.tipo}: ${updated.oggetto}`,
    });
    res.json(updated);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to update comunicazione' }); }
});
operationsRouter.delete('/api/comunicazioni/:id', async (req, res) => {
  try {
    const com = await comunicazioniStorage.findById(req.params.id);
    const deleted = await comunicazioniStorage.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Comunicazione not found' });
    if (com) {
      await logActivity(req, {
        action: 'delete',
        entityType: 'comunicazione',
        entityId: com.id,
        details: `${com.tipo}: ${com.oggetto}`,
      });
    }
    res.status(204).send();
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to delete comunicazione' }); }
});

// ============================================================================
// Alias inglesi (usati dal frontend)
// ============================================================================

// --- /api/deadlines → /api/scadenze ---
operationsRouter.get('/api/deadlines', async (req, res) => {
  try { res.json(await scadenzeStorage.readAll()); }
  catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch deadlines' }); }
});
operationsRouter.post('/api/deadlines', async (req, res) => {
  try {
    const result = insertScadenzaSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const item = { id: randomUUID(), ...result.data };
    await scadenzeStorage.create(item);
    await logActivity(req, {
      action: 'create',
      entityType: 'scadenza',
      entityId: item.id,
      details: `${result.data.titolo || 'Scadenza'} · ${result.data.data || ''}`,
    });
    res.status(201).json(item);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to create deadline' }); }
});
operationsRouter.patch('/api/deadlines/:id', async (req, res) => {
  try {
    const result = insertScadenzaSchema.partial().safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const updated = await scadenzeStorage.update(req.params.id, result.data);
    if (!updated) return res.status(404).json({ error: 'Deadline not found' });
    await logActivity(req, {
      action: 'update',
      entityType: 'scadenza',
      entityId: updated.id,
      details: `${updated.titolo || 'Scadenza'} (campi: ${Object.keys(result.data).join(', ')})`,
    });
    res.json(updated);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to update deadline' }); }
});
operationsRouter.delete('/api/deadlines/:id', async (req, res) => {
  try {
    const scadenza = await scadenzeStorage.findById(req.params.id);
    const deleted = await scadenzeStorage.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Deadline not found' });
    if (scadenza) {
      await logActivity(req, {
        action: 'delete',
        entityType: 'scadenza',
        entityId: scadenza.id,
        details: scadenza.titolo || 'Scadenza',
      });
    }
    res.status(204).send();
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to delete deadline' }); }
});

// --- /api/communications → /api/comunicazioni ---
operationsRouter.get('/api/communications', async (req, res) => {
  try { res.json(await comunicazioniStorage.readAll()); }
  catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch communications' }); }
});
operationsRouter.post('/api/communications', async (req, res) => {
  try {
    const result = insertComunicazioneSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const item = { id: randomUUID(), ...result.data };
    await comunicazioniStorage.create(item);

    if (req.session?.user) {
      await activityLogsStorage.create({
        id: randomUUID(),
        userId: req.session.user.id,
        userName: req.session.user.nome,
        action: 'create',
        entityType: 'comunicazione',
        entityId: item.id,
        details: `Nuova ${result.data.tipo}: ${result.data.oggetto}`,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json(item);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to create communication' }); }
});
operationsRouter.patch('/api/communications/:id', async (req, res) => {
  try {
    const result = insertComunicazioneSchema.partial().safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const updated = await comunicazioniStorage.update(req.params.id, result.data);
    updated ? res.json(updated) : res.status(404).json({ error: 'Communication not found' });
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to update communication' }); }
});
operationsRouter.delete('/api/communications/:id', async (req, res) => {
  try {
    const deleted = await comunicazioniStorage.delete(req.params.id);
    deleted ? res.status(204).send() : res.status(404).json({ error: 'Communication not found' });
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to delete communication' }); }
});
