import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

/**
 * Estrae l'IP del client con fallback robusto e normalizzazione IPv6.
 *
 * Due problemi risolti:
 *  1) In Vite middleware mode (dev), `req.ip` può essere undefined → il
 *     rate limiter di default esplode con ERR_ERL_UNDEFINED_IP_ADDRESS.
 *     Qui il fallback va su x-forwarded-for → socket → 'local'.
 *  2) IPv6: ogni indirizzo /128 e' unico, quindi un attaccante con un
 *     prefix /64 potrebbe ruotare tra milioni di IP bypassando il limite.
 *     `ipKeyGenerator()` normalizza a /56 (block provider tipico) per
 *     contare tutti gli IP dello stesso prefisso come un solo client.
 */
function safeKeyGenerator(req: Request): string {
  const rawIp = req.ip
    || (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : undefined)
    || req.socket?.remoteAddress;
  if (!rawIp) return 'local';
  // ipKeyGenerator richiede (ip, ipv6Subnet?). Default ipv6Subnet = 56.
  return ipKeyGenerator(rawIp);
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
