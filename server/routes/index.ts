import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { globalApiLimiter } from '../middleware/rate-limit.js';

import { uploadsRouter } from './uploads.js';
import { authRouter } from './auth.js';
import { projectsRouter } from './projects.js';
import { clientsRouter } from './clients.js';
import { invoicesRouter } from './invoices.js';
import { costsRouter } from './costs.js';
import { operationsRouter } from './operations.js';
import { resourcesRouter } from './resources.js';
import { usersRouter } from './users.js';
import { systemRouter } from './system.js';
import { dashboardRouter } from './dashboard.js';
import { collaboratoriRouter } from './collaboratori.js';

export const router = Router();

// Rate limit globale su /api per contenere bot/scraper. I limiter specifici
// su auth/change-password restano più restrittivi e si applicano prima.
router.use('/api', globalApiLimiter);

// Middleware auth globale — protegge tutte le route /api/ tranne auth
router.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const relativePath = req.path;
  const publicPaths = ['/auth/login', '/auth/status', '/auth/logout'];
  if (publicPaths.includes(relativePath)) {
    return next();
  }
  return requireAuth(req, res, next);
});

// Route admin-only per gestione utenti
router.use('/api/users', (req: Request, res: Response, next: NextFunction) => {
  // Cambio password e' permesso a tutti gli autenticati (check owner in auth.ts)
  if (req.path.endsWith('/change-password')) {
    return next();
  }
  // PUT sul proprio profilo e' permesso (check owner in users.ts)
  if (req.method === 'PUT') {
    return next();
  }
  // GET (lista utenti), POST (crea), DELETE richiedono admin.
  // Un non-admin conosce solo il proprio profilo via /api/auth/status.
  return requireAdmin(req, res, next);
});

// Route admin-only per fatture emesse, consulenti e profili costo (scrittura)
router.use('/api/fatture-emesse', (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET') return requireAdmin(req, res, next);
  next();
});
router.use('/api/fatture-consulenti', (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET') return requireAdmin(req, res, next);
  next();
});
router.use('/api/collaboratori', (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET') return requireAdmin(req, res, next);
  next();
});

// Dati finanziari aziendali: saldo, previsioni, dettaglio costi generali
// → solo admin. Le route dashboard restanti (fatture-in-scadenza,
// pagamenti-collaboratori-pendenti) filtrano internamente per ruolo.
router.use('/api/cash-flow', requireAdmin);

// Costi generali (affitti, utenze, abbonamenti aziendali) — coerente con
// la UI che è nella tab "Economia" già admin-only.
router.use('/api/costi-generali', requireAdmin);

// Anagrafica clienti: scrittura solo admin (coerente con tab "Anagrafica"
// admin-only UI). GET resta aperto perché usato da progetti e dashboard.
router.use('/api/clients', (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET') return requireAdmin(req, res, next);
  next();
});

// Commesse: i collaboratori possono creare/aggiornare, ma solo admin
// può eliminare una commessa (azione distruttiva a cascata).
router.use('/api/projects', (req: Request, res: Response, next: NextFunction) => {
  // Gate DELETE solo sulla route /:id (non confondere con sotto-route GET/PUT)
  if (req.method === 'DELETE') return requireAdmin(req, res, next);
  next();
});

// Route admin-only per export/import
router.use('/api/export', requireAdmin);
router.use('/api/import', requireAdmin);

// Activity logs: interamente admin-only (audit trail aziendale).
// I log automatici creati dal server non passano da questo router.
router.use('/api/activity-logs', requireAdmin);

// Mount sub-routers
router.use(uploadsRouter);
router.use(authRouter);
router.use(projectsRouter);
router.use(clientsRouter);
router.use(invoicesRouter);
router.use(costsRouter);
router.use(operationsRouter);
router.use(resourcesRouter);
router.use(usersRouter);
router.use(systemRouter);
router.use(dashboardRouter);
router.use(collaboratoriRouter);
