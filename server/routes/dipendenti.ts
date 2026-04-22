import { Router } from 'express';
import { randomUUID } from 'crypto';
import { dipendentiStorage, projectResourcesStorage } from '../storage.js';
import { insertDipendenteSchema, updateDipendenteSchema } from '@shared/schema';
import { logActivity } from '../lib/activity-logger.js';
import { logger } from '../lib/logger.js';
import { ensurePayrollBootstrap } from '../lib/payroll-auto-gen.js';

export const dipendentiRouter = Router();

// Rimuove campi stipendiali sensibili dalla risposta se l'utente non e' admin.
// costoOrario e stipendioMensile sono informazioni di payroll: i collaboratori
// (ruolo utente) non devono vederli per gli altri.
function sanitize(d: any, isAdmin: boolean) {
  if (isAdmin) return d;
  const { costoOrario, stipendioMensile, ...rest } = d;
  return rest;
}

dipendentiRouter.get('/api/dipendenti', async (req, res) => {
  try {
    const isAdmin = req.session?.user?.role === 'amministratore';
    const all = await dipendentiStorage.readAll();
    res.json(all.map(d => sanitize(d, isAdmin)));
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch dipendenti' }); }
});

dipendentiRouter.get('/api/dipendenti/:id', async (req, res) => {
  try {
    const isAdmin = req.session?.user?.role === 'amministratore';
    const d = await dipendentiStorage.findById(req.params.id);
    d ? res.json(sanitize(d, isAdmin)) : res.status(404).json({ error: 'Dipendente not found' });
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch dipendente' }); }
});

dipendentiRouter.post('/api/dipendenti', async (req, res) => {
  try {
    const result = insertDipendenteSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const dipendente = {
      id: randomUUID(),
      ...result.data,
      createdAt: new Date().toISOString(),
    };
    await dipendentiStorage.create(dipendente);

    await logActivity(req, {
      action: 'create',
      entityType: 'dipendente',
      entityId: dipendente.id,
      details: `${result.data.nome} ${result.data.cognome || ''} · ${result.data.ruolo || ''}`.trim(),
    });

    // Se creato già attivo con stipendio mensile configurato: crea la prima
    // busta paga (bootstrap). Il cron giornaliero rigenererà ogni mese da qui.
    await ensurePayrollBootstrap(dipendente.id).catch((err) =>
      logger.error('Payroll bootstrap failed (create)', { err, dipendenteId: dipendente.id })
    );

    res.status(201).json(dipendente);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to create dipendente' }); }
});

dipendentiRouter.put('/api/dipendenti/:id', async (req, res) => {
  try {
    const result = updateDipendenteSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const updated = await dipendentiStorage.update(req.params.id, result.data);
    if (!updated) return res.status(404).json({ error: 'Dipendente not found' });
    await logActivity(req, {
      action: 'update',
      entityType: 'dipendente',
      entityId: updated.id,
      details: `${updated.nome} ${updated.cognome || ''} (campi: ${Object.keys(result.data).join(', ')})`.trim(),
    });

    // Se l'update ha portato il dipendente in stato attivo + stipendio
    // configurato e non ha buste paga pregresse, bootstrap.
    // Idempotente: se ne esiste già una, non crea nulla.
    await ensurePayrollBootstrap(updated.id).catch((err) =>
      logger.error('Payroll bootstrap failed (update)', { err, dipendenteId: updated.id })
    );

    res.json(updated);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to update dipendente' }); }
});

dipendentiRouter.delete('/api/dipendenti/:id', async (req, res) => {
  try {
    // Check: non eliminare se ci sono project resources collegate
    const resources = await projectResourcesStorage.findByField('dipendenteId', req.params.id);
    if (resources.length > 0) {
      return res.status(400).json({
        error: 'Impossibile eliminare',
        message: `Il dipendente e' assegnato a ${resources.length} commess${resources.length === 1 ? 'a' : 'e'}. Rimuovere prima le assegnazioni.`
      });
    }
    const d = await dipendentiStorage.findById(req.params.id);
    const deleted = await dipendentiStorage.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Dipendente not found' });
    if (d) {
      await logActivity(req, {
        action: 'delete',
        entityType: 'dipendente',
        entityId: d.id,
        details: `${d.nome} ${d.cognome || ''}`.trim(),
      });
    }
    res.status(204).send();
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to delete dipendente' }); }
});
