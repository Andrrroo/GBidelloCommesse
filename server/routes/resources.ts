import { Router } from 'express';
import { randomUUID } from 'crypto';
import { tagsStorage, projectTagsStorage, projectResourcesStorage, collaboratoriStorage } from '../storage.js';
import { insertTagSchema, insertProjectResourceSchema, insertProjectTagSchema } from '@shared/schema';
import { logActivity } from '../lib/activity-logger.js';
import { logger } from '../lib/logger.js';

export const resourcesRouter = Router();

// --- Tags ---
resourcesRouter.get('/api/tags', async (req, res) => {
  try { res.json(await tagsStorage.readAll()); }
  catch { res.status(500).json({ error: 'Failed to fetch tags' }); }
});
resourcesRouter.post('/api/tags', async (req, res) => {
  try {
    const result = insertTagSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const tag = { id: randomUUID(), ...result.data };
    await tagsStorage.create(tag);
    await logActivity(req, {
      action: 'create', entityType: 'tag', entityId: tag.id,
      details: tag.name,
    });
    res.status(201).json(tag);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to create tag' }); }
});
resourcesRouter.delete('/api/tags/:id', async (req, res) => {
  try {
    const tag = await tagsStorage.findById(req.params.id);
    const deleted = await tagsStorage.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Tag not found' });
    if (tag) {
      await logActivity(req, {
        action: 'delete', entityType: 'tag', entityId: tag.id,
        details: tag.name,
      });
    }
    res.status(204).send();
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to delete tag' }); }
});

// --- Project Tags ---
resourcesRouter.get('/api/project-tags/:projectId', async (req, res) => {
  try { res.json(await projectTagsStorage.findByField('projectId', req.params.projectId)); }
  catch { res.status(500).json({ error: 'Failed to fetch project tags' }); }
});
resourcesRouter.post('/api/project-tags', async (req, res) => {
  try {
    const result = insertProjectTagSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const projectTag = { id: randomUUID(), ...result.data };
    await projectTagsStorage.create(projectTag);
    res.status(201).json(projectTag);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to create project tag' }); }
});
resourcesRouter.delete('/api/project-tags/:projectId/:tagId', async (req, res) => {
  try {
    const all = await projectTagsStorage.readAll();
    const toDelete = all.find(pt => pt.projectId === req.params.projectId && pt.tagId === req.params.tagId);
    if (!toDelete) return res.status(404).json({ error: 'Project tag not found' });
    await projectTagsStorage.delete(toDelete.id);
    res.status(204).send();
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to delete project tag' }); }
});

// Rimuove costoOrario dalla risposta se non admin
function sanitizeResource(r: any, isAdmin: boolean) {
  if (isAdmin) return r;
  const { costoOrario, ...rest } = r;
  return rest;
}

// --- Project Resources ---
resourcesRouter.get('/api/project-resources', async (req, res) => {
  try {
    const isAdmin = req.session?.user?.role === 'amministratore';
    const all = await projectResourcesStorage.readAll();
    res.json(all.map(r => sanitizeResource(r, isAdmin)));
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch project resources' }); }
});
resourcesRouter.get('/api/project-resources/:id', async (req, res) => {
  try {
    const isAdmin = req.session?.user?.role === 'amministratore';
    const r = await projectResourcesStorage.findById(req.params.id);
    r ? res.json(sanitizeResource(r, isAdmin)) : res.status(404).json({ error: 'Resource not found' });
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch resource' }); }
});
resourcesRouter.post('/api/project-resources', async (req, res) => {
  try {
    const result = insertProjectResourceSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });

    // Se c'e' un collaboratoreId, il costoOrario viene preso dal collaboratore (in centesimi)
    let resourceData: any = { ...result.data };
    if (resourceData.collaboratoreId) {
      const collab = await collaboratoriStorage.findById(resourceData.collaboratoreId);
      if (collab) {
        resourceData.costoOrario = Math.round(collab.costoOrario * 100);
      }
    }

    const resource = { id: randomUUID(), ...resourceData };
    await projectResourcesStorage.create(resource);

    await logActivity(req, {
      action: 'create',
      entityType: 'risorsa',
      entityId: resource.id,
      details: `${resource.userName || 'Risorsa'} · ${resource.role || ''} · ${resource.oreAssegnate || 0}h`,
    });

    const isAdmin = req.session?.user?.role === 'amministratore';
    res.status(201).json(sanitizeResource(resource, isAdmin));
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to create resource' }); }
});
resourcesRouter.put('/api/project-resources/:id', async (req, res) => {
  try {
    const result = insertProjectResourceSchema.partial().safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });

    let updates: any = { ...result.data };
    // Se viene cambiato il collaboratore, aggiorno anche il costoOrario
    if (updates.collaboratoreId) {
      const collab = await collaboratoriStorage.findById(updates.collaboratoreId);
      if (collab) {
        updates.costoOrario = Math.round(collab.costoOrario * 100);
      }
    }

    const updated = await projectResourcesStorage.update(req.params.id, updates);
    if (!updated) return res.status(404).json({ error: 'Resource not found' });

    await logActivity(req, {
      action: 'update',
      entityType: 'risorsa',
      entityId: updated.id,
      details: `${updated.userName || 'Risorsa'} (campi: ${Object.keys(result.data).join(', ')})`,
    });

    const isAdmin = req.session?.user?.role === 'amministratore';
    res.json(sanitizeResource(updated, isAdmin));
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to update resource' }); }
});
resourcesRouter.delete('/api/project-resources/:id', async (req, res) => {
  try {
    const resource = await projectResourcesStorage.findById(req.params.id);
    const deleted = await projectResourcesStorage.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Resource not found' });
    if (resource) {
      await logActivity(req, {
        action: 'delete',
        entityType: 'risorsa',
        entityId: resource.id,
        details: `${resource.userName || 'Risorsa'} · ${resource.role || ''}`,
      });
    }
    res.status(204).send();
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to delete resource' }); }
});
