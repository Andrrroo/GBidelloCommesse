import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

/**
 * Estrae l'IP del client con fallback robusto.
 *
 * In Vite middleware mode (dev) o dietro proxy, `req.ip` può essere undefined
 * all'arrivo del middleware: il rate limiter allora esplode con
 * ERR_ERL_UNDEFINED_IP_ADDRESS. Qui proviamo in ordine: req.ip (valore di
 * Express), x-forwarded-for (primo hop dietro proxy), socket remoto, e in
 * ultima istanza una chiave statica ("local") cosi' il limiter continua
 * a funzionare senza piantarsi.
 */
function safeKeyGenerator(req: Request): string {
  if (req.ip) return req.ip;
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  const remote = req.socket?.remoteAddress;
  if (remote) return remote;
  return 'local';
}

/**
 * Rate limiter per endpoint di autenticazione: 5 tentativi ogni 15 minuti
 * per IP. Protegge login e cambio password da brute force.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: safeKeyGenerator,
  message: {
    success: false,
    error: 'Troppi tentativi. Riprova tra qualche minuto.',
  },
  // Non contare richieste che arrivano a buon fine (utente legittimo che si logga)
  skipSuccessfulRequests: true,
});

/**
 * Rate limiter per endpoint di cambio password. Più restrittivo rispetto
 * al login perché l'utente è già autenticato: 5 tentativi ogni 15 minuti
 * sono ampiamente sufficienti per un uso legittimo.
 */
export const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: safeKeyGenerator,
  message: {
    error: 'Troppi tentativi di cambio password. Riprova tra qualche minuto.',
  },
});

/**
 * Rate limiter generico per API "write-like" non critiche (es. generate-code):
 * 60 richieste al minuto per IP, sufficienti per uso interattivo ma blocca lo spam.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: safeKeyGenerator,
  message: { error: 'Troppe richieste. Riprova tra qualche istante.' },
});

/**
 * Rate limiter globale applicato a tutte le route /api. Limite alto (300/min)
 * per supportare dashboard con query multiple, ma blocca bot/scraper che
 * cercano di scaricare tutto lo storage in loop.
 */
export const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: safeKeyGenerator,
  message: { error: 'Troppe richieste. Riprova tra qualche istante.' },
});
