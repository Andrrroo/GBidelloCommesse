import { Router } from 'express';
import { randomUUID } from 'crypto';
import { clientsStorage, projectsStorage } from '../storage.js';
import { insertClientSchema } from '@shared/schema';
import { logActivity } from '../lib/activity-logger.js';
import { logger } from '../lib/logger.js';

export const clientsRouter = Router();

clientsRouter.get('/api/clients', async (req, res) => {
  try {
    const [clients, projects] = await Promise.all([
      clientsStorage.readAll(),
      projectsStorage.readAll(),
    ]);
    // Conta progetti per nome cliente in un'unica scansione O(N+M) invece
    // di filtrare la lista progetti per ogni cliente (O(N*M)).
    const countByClient = new Map<string, number>();
    for (const p of projects) {
      countByClient.set(p.client, (countByClient.get(p.client) || 0) + 1);
    }
    const clientsWithCount = clients.map(client => ({
      ...client,
      projectsCount: countByClient.get(client.name) || 0,
    }));
    res.json(clientsWithCount);
  } catch (error) {
    logger.error('Client list error', { err: error });
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

clientsRouter.post('/api/clients', async (req, res) => {
  try {
    const validationResult = insertClientSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errors = validationResult.error.flatten();
      return res.status(400).json({ error: 'Validation error', details: errors.fieldErrors });
    }
    const client = { id: randomUUID(), ...validationResult.data, projectsCount: 0 };
    await clientsStorage.create(client);

    await logActivity(req, {
      action: 'create',
      entityType: 'client',
      entityId: client.id,
      details: `${client.sigla} — ${client.name}`,
    });

    res.status(201).json(client);
  } catch (error) {
    logger.error('Client creation error', { err: error });
    res.status(500).json({ error: 'Failed to create client' });
  }
});

clientsRouter.put('/api/clients/:id', async (req, res) => {
  try {
    const validationResult = insertClientSchema.partial().safeParse(req.body);
    if (!validationResult.success) {
      const errors = validationResult.error.flatten();
      return res.status(400).json({ error: 'Validation error', details: errors.fieldErrors });
    }
    const updated = await clientsStorage.update(req.params.id, validationResult.data);
    if (!updated) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const changedKeys = Object.keys(validationResult.data);
    await logActivity(req, {
      action: 'update',
      entityType: 'client',
      entityId: updated.id,
      details: `${updated.sigla} — ${updated.name} (campi: ${changedKeys.join(', ')})`,
    });

    res.json(updated);
  } catch (error) {
    logger.error('Client update error', { err: error });
    res.status(500).json({ error: 'Failed to update client' });
  }
});

clientsRouter.delete('/api/clients/:id', async (req, res) => {
  try {
    const allProjects = await projectsStorage.readAll();
    const client = await clientsStorage.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const clientProjects = allProjects.filter(p => p.client === client.name);
    if (clientProjects.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete client with associated projects',
        message: `Il cliente ha ${clientProjects.length} commesse associate. Eliminare prima le commesse.`
      });
    }
    const deleted = await clientsStorage.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Client not found' });
    }

    await logActivity(req, {
      action: 'delete',
      entityType: 'client',
      entityId: req.params.id,
      details: `${client.sigla} — ${client.name}`,
    });

    res.status(204).send();
  } catch (error) {
    logger.error('Client deletion error', { err: error });
    res.status(500).json({ error: 'Failed to delete client' });
  }
});
