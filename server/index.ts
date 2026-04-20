import express, { type Request, Response, NextFunction } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { createServer as createNetServer } from 'net';
import os from 'os';
import { router } from './routes/index.js';
import { logger } from './lib/logger.js';
import { performBackup, scheduleBackup } from './lib/backup.js';
import { runMigrations } from './lib/migrations.js';
import { purgeActivityLogs, scheduleActivityRetention } from './lib/activity-retention.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Helper ANSI per un banner colorato nel CMD (nessuna dipendenza aggiuntiva).
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  brightGreen: '\x1b[92m',
  cyan: '\x1b[36m',
  brightCyan: '\x1b[96m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

// Ritorna gli IP IPv4 esterni della macchina (es. 192.168.1.143) per mostrare
// l'URL "Network" cosi' il sito e' raggiungibile anche da altri dispositivi
// sulla stessa LAN (telefono, secondo PC, ecc).
function getNetworkAddresses(): string[] {
  const results: string[] = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) results.push(net.address);
    }
  }
  return results;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const BASE_PORT = process.env.NODE_ENV === 'production' ? Number(process.env.PORT) || 5000 : 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Cerca la prima porta TCP libera a partire da `start`, provando fino a
// `maxAttempts` porte consecutive. Evita crash EADDRINUSE su riavvi rapidi
// di `npm run dev` quando un processo tsx precedente non e' terminato bene.
async function findAvailablePort(start: number, maxAttempts = 20): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = start + i;
    const available = await new Promise<boolean>((resolve) => {
      const tester = createNetServer()
        .once('error', () => resolve(false))
        .once('listening', () => tester.close(() => resolve(true)))
        .listen(candidate, '0.0.0.0');
    });
    if (available) return candidate;
  }
  throw new Error(`Nessuna porta libera tra ${start} e ${start + maxAttempts - 1}`);
}

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

// Security headers HTTP (X-Frame-Options, X-Content-Type-Options, HSTS, ecc.).
// In dev disabilitiamo la CSP perche' Vite inietta script inline per HMR che
// una CSP strict bloccherebbe. In produzione la CSP di default di helmet e'
// attiva e restrittiva.
app.use(helmet({
  contentSecurityPolicy: isProduction ? undefined : false,
  crossOriginEmbedderPolicy: false, // evita blocchi su risorse dev (es. font Google)
}));

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

// API Routes
app.use(router);

async function start() {
  // Servire il frontend:
  //  - dev:  Vite montato come middleware (HMR + trasformazione on-the-fly).
  //          Niente proxy, niente porta separata: il frontend e' servito
  //          dallo stesso Express che risponde alle /api → risolve i problemi
  //          di ETIMEDOUT/ECONNREFUSED del proxy Vite su Windows.
  //  - prod: serve la build statica da dist/public.
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    // NON passiamo `root` qui: lo legge dal vite.config.ts (che lo imposta
    // a `client/`). Specifichiamo solo configFile per essere sicuri che
    // carichi la configurazione corretta (con gli alias @/, @shared, ecc.).
    const vite = await createViteServer({
      configFile: path.resolve(__dirname, '..', 'vite.config.ts'),
      server: { middlewareMode: true, hmr: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    // SPA fallback: per ogni URL non /api e non statico, serve index.html
    // dopo averla passata per le trasformazioni di Vite (injecta HMR client).
    app.use(async (req, res, next) => {
      if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/uploads')) {
        return next();
      }
      try {
        const fs = await import('fs/promises');
        const indexPath = path.resolve(__dirname, '..', 'client', 'index.html');
        let template = await fs.readFile(indexPath, 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const publicPath = path.join(__dirname, '..', 'dist', 'public');
    app.use(express.static(publicPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(publicPath, 'index.html'));
    });
  }

  // Error handling middleware (montato DOPO il serving del frontend)
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', { method: req.method, path: req.path, err });
    res.status(500).json({
      error: 'Internal server error',
      message: isProduction ? 'Si e\' verificato un errore' : err.message,
    });
  });

  const port = await findAvailablePort(BASE_PORT);
  const httpServer = app.listen(port, '0.0.0.0', async () => {
    // process.uptime() misura i secondi dall'avvio del processo Node.
    const readyMs = Math.round(process.uptime() * 1000);
    if (port !== BASE_PORT) {
      console.log(`\n  ${C.yellow}ⓘ Porta ${BASE_PORT} gia' in uso — server avviato su ${port}.${C.reset}`);
    }

    // Banner in stile Vite originale (come pre-git, con prefisso [CLIENT]
    // blu/verde stile concurrently per richiamare il layout familiare).
    const CLIENT_PREFIX = `${C.green}[CLIENT]${C.reset}`;
    const arrow = `${C.brightGreen}➜${C.reset}`;

    // Leggo la versione di Vite dal package.json per l'header originale
    let viteVersion = '';
    try { viteVersion = require('vite/package.json').version; } catch { /* opzionale */ }

    console.log('');
    console.log(`${CLIENT_PREFIX}   ${C.magenta}${C.bold}VITE${C.reset} ${C.brightCyan}v${viteVersion}${C.reset}  ${C.dim}ready in ${readyMs} ms${C.reset}`);
    console.log(`${CLIENT_PREFIX}`);
    console.log(`${CLIENT_PREFIX}   ${arrow}  ${C.bold}Local:${C.reset}   ${C.cyan}http://localhost:${port}/${C.reset}`);
    for (const addr of getNetworkAddresses()) {
      console.log(`${CLIENT_PREFIX}   ${arrow}  ${C.bold}Network:${C.reset} ${C.cyan}http://${addr}:${port}/${C.reset}`);
    }
    console.log('');

    // Log strutturato con prefix [SERVER]
    logger.info('Server started', { port, env: process.env.NODE_ENV || 'development' });

    await performBackup('startup');
    await runMigrations().catch((e) => logger.error('Migrations aborted', { err: e }));
    scheduleBackup(24);

    // Retention activity log: purga subito login legacy + record > 90 giorni
    // o eccedenti 10k; poi schedule ogni 24h.
    await purgeActivityLogs().catch((e) => logger.error('Activity retention failed', { err: e }));
    scheduleActivityRetention(24);
  });

  httpServer.keepAliveTimeout = 60_000;
  httpServer.headersTimeout = 65_000;
}

start().catch((err) => {
  logger.error('Startup failed', { err });
  console.error('Avvio server fallito:', err?.message || err);
  process.exit(1);
});

// Handler per crash non catturati: evita che una promise rejection async
// uccida il processo silenziosamente lasciando socket in stato pending.
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', { reason, promise: String(promise) });
  console.error('\n[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { err });
  console.error('\n[UNCAUGHT EXCEPTION]', err);
});

export default app;
