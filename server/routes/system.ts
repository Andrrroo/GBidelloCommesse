import { Router } from 'express';
import { randomUUID } from 'crypto';
import {
  activityLogsStorage, projectsStorage, clientsStorage,
  fattureIngressoStorage, fattureEmesseStorage, fattureConsulentiStorage,
  costiViviStorage, costiGeneraliStorage, prestazioniStorage,
  scadenzeStorage, comunicazioniStorage, tagsStorage,
  projectTagsStorage, projectResourcesStorage,
  collaboratoriStorage,
} from '../storage.js';
import { logger } from '../lib/logger.js';
import { insertActivityLogSchema } from '@shared/schema';
import {
  performBackup, listBackups,
  BACKUP_INTERVAL_HOURS, BACKUP_MAX_SNAPSHOTS,
} from '../lib/backup.js';
import { requireAdmin } from '../middleware/auth.js';

export const systemRouter = Router();

// --- Activity Logs (admin-only, gate applicato in routes/index.ts) ---
systemRouter.get('/api/activity-logs', async (req, res) => {
  try { res.json(await activityLogsStorage.readAll()); }
  catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch activity logs' }); }
});

systemRouter.get('/api/activity-logs/user/:userId', async (req, res) => {
  try {
    const logs = await activityLogsStorage.findByField('userId', req.params.userId);
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json(logs);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch user activity logs' }); }
});

systemRouter.post('/api/activity-logs', async (req, res) => {
  try {
    const result = insertActivityLogSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const log = {
      id: randomUUID(),
      ...result.data,
      timestamp: result.data.timestamp || new Date().toISOString()
    };
    await activityLogsStorage.create(log);
    res.status(201).json(log);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to create activity log' }); }
});

// --- Export / Import ---
systemRouter.get('/api/export', async (req, res) => {
  try {
    const data = {
      projects: await projectsStorage.readAll(),
      clients: await clientsStorage.readAll(),
      fattureIngresso: await fattureIngressoStorage.readAll(),
      fattureEmesse: await fattureEmesseStorage.readAll(),
      fattureConsulenti: await fattureConsulentiStorage.readAll(),
      costiVivi: await costiViviStorage.readAll(),
      costiGenerali: await costiGeneraliStorage.readAll(),
      prestazioni: await prestazioniStorage.readAll(),
      scadenze: await scadenzeStorage.readAll(),
      comunicazioni: await comunicazioniStorage.readAll(),
      tags: await tagsStorage.readAll(),
      projectTags: await projectTagsStorage.readAll(),
      projectResources: await projectResourcesStorage.readAll(),
      collaboratori: await collaboratoriStorage.readAll(),
      activityLogs: await activityLogsStorage.readAll(),
      exportedAt: new Date().toISOString()
    };
    res.json(data);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to export data' }); }
});

systemRouter.post('/api/import', async (req, res) => {
  try {
    const data = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Dati non validi' });
    }

    // Importa solo le collezioni presenti nel payload
    const storageMap: Record<string, { storage: any; data?: any[] }> = {
      projects: { storage: projectsStorage, data: data.projects },
      clients: { storage: clientsStorage, data: data.clients },
      fattureIngresso: { storage: fattureIngressoStorage, data: data.fattureIngresso },
      fattureEmesse: { storage: fattureEmesseStorage, data: data.fattureEmesse },
      fattureConsulenti: { storage: fattureConsulentiStorage, data: data.fattureConsulenti },
      costiVivi: { storage: costiViviStorage, data: data.costiVivi },
      costiGenerali: { storage: costiGeneraliStorage, data: data.costiGenerali },
      prestazioni: { storage: prestazioniStorage, data: data.prestazioni },
      scadenze: { storage: scadenzeStorage, data: data.scadenze },
      comunicazioni: { storage: comunicazioniStorage, data: data.comunicazioni },
      tags: { storage: tagsStorage, data: data.tags },
      projectTags: { storage: projectTagsStorage, data: data.projectTags },
      projectResources: { storage: projectResourcesStorage, data: data.projectResources },
      collaboratori: { storage: collaboratoriStorage, data: data.collaboratori },
      activityLogs: { storage: activityLogsStorage, data: data.activityLogs },
    };

    let imported = 0;
    for (const [key, { storage, data: items }] of Object.entries(storageMap)) {
      if (Array.isArray(items)) {
        await storage.writeAll(items);
        imported++;
      }
    }

    res.json({ success: true, message: `Importate ${imported} collezioni` });
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to import data' }); }
});

// --- Backup ---
// Stato del backup automatico + elenco snapshot esistenti.
// Accessibile a tutti gli utenti autenticati (la route è montata sotto il middleware auth globale).
systemRouter.get('/api/system/backups', async (req, res) => {
  try {
    const snapshots = await listBackups();
    res.json({
      enabled: true,
      intervalHours: BACKUP_INTERVAL_HOURS,
      maxSnapshots: BACKUP_MAX_SNAPSHOTS,
      snapshots,
    });
  } catch (error) {
    logger.error('Backup list error', { err: error });
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// Crea un backup on-demand. Richiede ruolo admin perché tocca il filesystem.
systemRouter.post('/api/system/backup', requireAdmin, async (req, res) => {
  try {
    const result = await performBackup('manual');
    if (!result.ok) {
      return res.status(500).json({ error: result.error || 'Backup failed' });
    }
    res.status(201).json(result);
  } catch (error) {
    logger.error('Manual backup error', { err: error });
    res.status(500).json({ error: 'Failed to create backup' });
  }
});
