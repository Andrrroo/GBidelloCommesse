import { type Request, type Response, type NextFunction } from 'express';

export const BCRYPT_ROUNDS = 10;

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Non autenticato' });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Non autenticato' });
  }
  if (req.session.user.role !== 'amministratore') {
    return res.status(403).json({ error: 'Accesso non autorizzato' });
  }
  next();
}
