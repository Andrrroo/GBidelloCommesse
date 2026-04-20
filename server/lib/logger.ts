/**
 * Logger minimale strutturato. Output JSON one-line in produzione
 * (facile da grep e parse con jq/ELK), output leggibile in development.
 *
 * Uso: `logger.error('message', { userId, requestId })`.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const isProd = process.env.NODE_ENV === 'production';
const MIN_LEVEL: Level = (process.env.LOG_LEVEL as Level) || (isProd ? 'info' : 'debug');

const LEVEL_PRIORITY: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function shouldLog(level: Level): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function emit(level: Level, message: string, context?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const base = {
    t: new Date().toISOString(),
    level,
    msg: message,
    ...(context || {}),
  };

  // Serializza Error nativamente (stack + message)
  for (const key of Object.keys(base)) {
    const v = (base as Record<string, unknown>)[key];
    if (v instanceof Error) {
      (base as Record<string, unknown>)[key] = { message: v.message, stack: v.stack, name: v.name };
    }
  }

  if (isProd) {
    // JSON one-line per log aggregators
    const out = JSON.stringify(base);
    if (level === 'error' || level === 'warn') {
      console.error(out);
    } else {
      console.log(out);
    }
    return;
  }

  // Dev: human-readable con prefix colorato [SERVER] in stile concurrently.
  // ANSI: 34=blue, 31=red, 33=yellow, 90=gray (bright-black), 0=reset.
  const PREFIX = '\x1b[34m[SERVER]\x1b[0m';
  const levelColor: Record<Level, string> = {
    debug: '\x1b[90m',
    info:  '\x1b[32m',
    warn:  '\x1b[33m',
    error: '\x1b[31m',
  };
  const tag = `${levelColor[level]}${level.toUpperCase().padEnd(5)}\x1b[0m`;
  const time = `\x1b[90m${base.t}\x1b[0m`;
  const ctx = context && Object.keys(context).length ? ` ${JSON.stringify(context)}` : '';
  const line = `${PREFIX} ${time} ${tag} ${message}${ctx}`;
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit('debug', msg, ctx),
  info:  (msg: string, ctx?: Record<string, unknown>) => emit('info', msg, ctx),
  warn:  (msg: string, ctx?: Record<string, unknown>) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit('error', msg, ctx),
};
