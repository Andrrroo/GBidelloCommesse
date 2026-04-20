import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { usersStorage } from '../storage.js';
import { BCRYPT_ROUNDS } from '../middleware/auth.js';
import { authLimiter, changePasswordLimiter } from '../middleware/rate-limit.js';
import { logActivity } from '../lib/activity-logger.js';

export const authRouter = Router();
// I log di 'login' non vengono piu' scritti nell'activity log: sono rumore
// rispetto agli eventi business (create/update/delete/payment).

authRouter.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username e password sono obbligatori' });
    }

    const users = await usersStorage.readAll();
    const user = users.find(u => u.username.trim() === username.trim());

    if (!user) {
      return res.status(401).json({ success: false, error: 'Credenziali non valide' });
    }

    if (!user.active) {
      return res.status(401).json({ success: false, error: 'Utente disattivato' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Credenziali non valide' });
    }

    const { password: _, ...userWithoutPassword } = user;

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      nome: user.nome,
      email: user.email,
      collaboratoreId: user.collaboratoreId,
    };

    res.json({ success: true, user: userWithoutPassword });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Errore durante il login' });
  }
});

authRouter.get('/api/auth/status', (req, res) => {
  if (req.session?.user) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.json({ authenticated: false, user: null });
  }
});

authRouter.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Errore durante il logout' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// Minimo 8 caratteri e almeno 1 numero: policy bilanciata per app aziendale.
function validateNewPassword(pwd: unknown): string | null {
  if (typeof pwd !== 'string') return 'La nuova password è obbligatoria';
  if (pwd.length < 8) return 'La nuova password deve avere almeno 8 caratteri';
  if (!/[0-9]/.test(pwd)) return 'La nuova password deve contenere almeno un numero';
  return null;
}

authRouter.post('/api/users/:id/change-password', changePasswordLimiter, async (req, res) => {
  try {
    // Solo l'utente stesso o un admin puo' cambiare la password
    const sessionUser = req.session.user;
    if (sessionUser?.id !== req.params.id && sessionUser?.role !== 'amministratore') {
      return res.status(403).json({ error: 'Non autorizzato a modificare la password di un altro utente' });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || typeof currentPassword !== 'string') {
      return res.status(400).json({ error: 'Password attuale obbligatoria' });
    }
    const pwdError = validateNewPassword(newPassword);
    if (pwdError) {
      return res.status(400).json({ error: pwdError });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'La nuova password deve essere diversa da quella attuale' });
    }

    const user = await usersStorage.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Password attuale non corretta' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await usersStorage.update(req.params.id, { password: hashedNewPassword });

    await logActivity(req, {
      action: 'update',
      entityType: 'user',
      entityId: req.params.id,
      details: `Cambio password per ${user.nome || user.username}`,
    });

    res.json({ success: true, message: 'Password modificata con successo' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});
