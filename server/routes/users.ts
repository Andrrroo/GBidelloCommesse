import { Router } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { usersStorage } from '../storage.js';
import { BCRYPT_ROUNDS } from '../middleware/auth.js';
import { insertUserSchema } from '@shared/schema';
import { logActivity } from '../lib/activity-logger.js';
import { logger } from '../lib/logger.js';

export const usersRouter = Router();

usersRouter.get('/api/users', async (req, res) => {
  try {
    const users = await usersStorage.readAll();
    const usersWithoutPassword = users.map(({ password, ...user }) => user);
    res.json(usersWithoutPassword);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch users' }); }
});

usersRouter.post('/api/users', async (req, res) => {
  try {
    const result = insertUserSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    const hashedPassword = await bcrypt.hash(result.data.password, BCRYPT_ROUNDS);
    const user = {
      id: randomUUID(),
      ...result.data,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };
    await usersStorage.create(user);

    await logActivity(req, {
      action: 'create',
      entityType: 'user',
      entityId: user.id,
      details: `${user.nome} (${user.username}) · ruolo: ${user.role}`,
    });

    const { password, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to create user' }); }
});

usersRouter.put('/api/users/:id', async (req, res) => {
  try {
    // Solo l'utente stesso o un admin puo' modificare un profilo
    const sessionUser = req.session.user;
    if (sessionUser?.id !== req.params.id && sessionUser?.role !== 'amministratore') {
      return res.status(403).json({ error: 'Non autorizzato a modificare questo utente' });
    }
    const result = insertUserSchema.partial().safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
    // Un non-admin non puo' cambiare il proprio ruolo
    if (sessionUser?.role !== 'amministratore' && result.data.role) {
      delete result.data.role;
    }
    // Nessuno (nemmeno un admin) puo' cambiare il ruolo del proprio account:
    // eviterebbe che un admin si auto-degradi a collaboratore e perda
    // l'accesso amministrativo se non ci sono altri admin.
    if (sessionUser?.id === req.params.id && result.data.role && result.data.role !== sessionUser.role) {
      return res.status(400).json({ error: 'Non puoi cambiare il ruolo del tuo account' });
    }
    const updated = await usersStorage.update(req.params.id, result.data);
    if (!updated) return res.status(404).json({ error: 'User not found' });

    await logActivity(req, {
      action: 'update',
      entityType: 'user',
      entityId: updated.id,
      details: `${updated.nome} (${updated.username}) — campi: ${Object.keys(result.data).join(', ')}`,
    });

    const { password, ...userWithoutPassword } = updated;
    res.json(userWithoutPassword);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to update user' }); }
});

usersRouter.delete('/api/users/:id', async (req, res) => {
  try {
    // Un admin non può eliminare il proprio account (rischio lockout).
    if (req.session?.user?.id === req.params.id) {
      return res.status(400).json({ error: 'Non puoi eliminare il tuo account' });
    }
    const user = await usersStorage.findById(req.params.id);
    const deleted = await usersStorage.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'User not found' });
    if (user) {
      await logActivity(req, {
        action: 'delete',
        entityType: 'user',
        entityId: user.id,
        details: `${user.nome} (${user.username})`,
      });
    }
    res.status(204).send();
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to delete user' }); }
});
