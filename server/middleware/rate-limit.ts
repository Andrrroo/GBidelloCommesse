import rateLimit from 'express-rate-limit';

/**
 * Rate limiter per endpoint di autenticazione: 5 tentativi ogni 15 minuti
 * per IP. Protegge login e cambio password da brute force.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
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
  message: { error: 'Troppe richieste. Riprova tra qualche istante.' },
});
