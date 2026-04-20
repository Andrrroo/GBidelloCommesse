import express, { type Request, Response, NextFunction } from 'express';
import session from 'express-session';
import { router } from './routes/index.js';
import { logger } from './lib/logger.js';
import { performBackup, scheduleBackup } from './lib/backup.js';
import { runMigrations } from './lib/migrations.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.NODE_ENV === 'production' ? Number(process.env.PORT) || 5000 : 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Extend express-session types
declare module 'express-session' {
  interface SessionData {
    user: {
      id: string;
      username: string;
      role: string;
      nome: string;
      email: string;
      collaboratoreId?: string;
    };
  }
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: (() => {
    const secret = process.env.SESSION_SECRET;
    if (isProduction && !secret) {
      throw new Error('SESSION_SECRET deve essere impostato in produzione');
    }
    return secret || 'dev-only-secret-not-for-production';
  })(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000, // 8 ore
  }
}));

// CORS — origin restrittiva invece di wildcard
app.use((req: Request, res: Response, next: NextFunction) => {
  const allowedOrigins = isProduction
    ? [] // In produzione il frontend e' servito dallo stesso server
    : ['http://localhost:5173', 'http://localhost:5174']; // Vite dev server

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// API Routes
app.use(router);

// Serve static files in production
if (isProduction) {
  const publicPath = path.join(__dirname, '..', 'dist', 'public');
  app.use(express.static(publicPath));

  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', {
    method: req.method,
    path: req.path,
    err,
  });
  res.status(500).json({
    error: 'Internal server error',
    message: isProduction ? 'Si e\' verificato un errore' : err.message
  });
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  logger.info('Server started', { port: PORT, env: process.env.NODE_ENV || 'development' });
  // Backup snapshot PRIMA delle migrazioni: se una migrazione dovesse corrompere
  // dati, abbiamo sempre lo stato pre-migrazione nei backups/.
  await performBackup('startup');
  await runMigrations().catch((e) => logger.error('Migrations aborted', { err: e }));
  scheduleBackup(24);
});

export default app;
