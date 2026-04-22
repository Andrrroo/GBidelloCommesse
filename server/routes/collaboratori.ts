import { Router } from 'express';
import { randomUUID } from 'crypto';
import { collaboratoriStorage, projectResourcesStorage } from '../storage.js';
import { insertCollaboratoreSchema, updateCollaboratoreSchema } from '@shared/schema';
import { logActivity } from '../lib/activity-logger.js';
import { logger } from '../lib/logger.js';

export const collaboratoriRouter = Router();

// Rimuove campi stipendiali sensibili dalla risposta se l'utente non e' admin.
// costoOrario e stipendioMensile sono informazioni di payroll: i collaboratori
// non devono vederli degli altri colleghi.
function sanitize(c: any, isAdmin: boolean) {
  if (isAdmin) return c;
  const { costoOrario, stipendioMensile, ...rest } = c;
  return rest;
}

collaboratoriRouter.get('/api/collaboratori', async (req, res) => {
  try {
    const isAdmin = req.session?.user?.role === 'amministratore';
    const all = await collaboratoriStorage.readAll();
    res.json(all.map(c => sanitize(c, isAdmin)));
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch collaboratori' }); }
});

collaboratoriRouter.get('/api/collaboratori/:id', async (req, res) => {
  try {
    const isAdmin = req.session?.user?.role === 'amministratore';
    const c = await collaboratoriStorage.findById(req.params.id);
    c ? res.json(sanitize(c, isAdmin)) : res.status(404).json({ error: 'Collaboratore not found' });
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch collaboratore' }); }
});

collaboratoriRouter.post('/api/collaboratori', async (req, res) => {
  try {
    const result = insertCollaboratoreSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const collaboratore = {
      id: randomUUID(),
      ...result.data,
      createdAt: new Date().toISOString(),
    };
    await collaboratoriStorage.create(collaboratore);

    await logActivity(req, {
      action: 'create',
      entityType: 'collaboratore',
      entityId: collaboratore.id,
      details: `${result.data.nome} ${result.data.cognome || ''} · ${result.data.ruolo || ''}`.trim(),
    });

    res.status(201).json(collaboratore);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to create collaboratore' }); }
});

collaboratoriRouter.put('/api/collaboratori/:id', async (req, res) => {
  try {
    const result = updateCollaboratoreSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const updated = await collaboratoriStorage.update(req.params.id, result.data);
    if (!updated) return res.status(404).json({ error: 'Collaboratore not found' });
    await logActivity(req, {
      action: 'update',
      entityType: 'collaboratore',
      entityId: updated.id,
      details: `${updated.nome} ${updated.cognome || ''} (campi: ${Object.keys(result.data).join(', ')})`.trim(),
    });
    res.json(updated);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to update collaboratore' }); }
});

collaboratoriRouter.delete('/api/collaboratori/:id', async (req, res) => {
  try {
    // Check: non eliminare se ci sono project resources collegate
    const resources = await projectResourcesStorage.findByField('collaboratoreId', req.params.id);
    if (resources.length > 0) {
      return res.status(400).json({
        error: 'Impossibile eliminare',
        message: `Il collaboratore e' assegnato a ${resources.length} commess${resources.length === 1 ? 'a' : 'e'}. Rimuovere prima le assegnazioni.`
      });
    }
    const collab = await collaboratoriStorage.findById(req.params.id);
    const deleted = await collaboratoriStorage.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Collaboratore not found' });
    if (collab) {
      await logActivity(req, {
        action: 'delete',
        entityType: 'collaboratore',
        entityId: collab.id,
        details: `${collab.nome} ${collab.cognome || ''}`.trim(),
      });
    }
    res.status(204).send();
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to delete collaboratore' }); }
});
