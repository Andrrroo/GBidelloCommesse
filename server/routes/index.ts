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

// Collaboratori anagrafica: scrittura solo admin (il costoOrario è stipendio
// sensibile). GET sanitizza costoOrario per non-admin via collaboratori.ts.
router.use('/api/collaboratori', (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET') return requireAdmin(req, res, next);
  next();
});

// Dati finanziari aziendali aggregati (saldo, previsioni, cash flow globale)
// → solo admin.
router.use('/api/cash-flow', requireAdmin);

// Anagrafica clienti: scrittura solo admin (coerente con tab "Anagrafica"
// admin-only UI). GET resta aperto perché usato da progetti e dashboard.
router.use('/api/clients', (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET') return requireAdmin(req, res, next);
  next();
});

// Fatture (ingresso, consulenti), costi generali, commesse CRUD:
// aperti ai collaboratori per l'uso quotidiano (è il loro lavoro registrare
// fatture, costi e commesse). I dati "compromettenti" rimangono gated via
// Cash Flow, Anagrafica clienti/collaboratori, Users, Activity Log.
//
// Fatture emesse: i collaboratori vedono le righe (commessa, numero, data,
// stato) senza importi (sanitize in invoices.ts), ma non possono creare,
// modificare o eliminare — sono entrate aziendali.
router.use('/api/fatture-emesse', (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET') return requireAdmin(req, res, next);
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
