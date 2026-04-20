/**
 * Retention per l'activity log.
 * Gli eventi si accumulano in data/activity-logs.json senza limite naturale;
 * qui applichiamo una policy ibrida per contenere dimensione del file e
 * durata di scansione/lettura.
 *
 * Policy:
 *  - età massima: 90 giorni (un trimestre di audit basta per il caso d'uso)
 *  - numero massimo: 10 000 record (cap di sicurezza)
 *  - legacy cleanup: tutti i record con action === 'login' vengono purgati
 *    (non registriamo piu' i login a partire da questa versione)
 *
 * Chiamata: all'avvio del server + ogni 24h (vedi schedule in index.ts).
 */

import { activityLogsStorage } from '../storage.js';
import { logger } from './logger.js';

export const MAX_ACTIVITY_AGE_DAYS = 90;
export const MAX_ACTIVITY_RECORDS = 10_000;

interface PurgeResult {
  before: number;
  after: number;
  removed: number;
  removedLoginLegacy: number;
  removedByAge: number;
  removedByCap: number;
}

export async function purgeActivityLogs(): Promise<PurgeResult> {
  const all = await activityLogsStorage.readAll();
  const totalBefore = all.length;
  const cutoffMs = Date.now() - MAX_ACTIVITY_AGE_DAYS * 24 * 60 * 60 * 1000;

  let removedLoginLegacy = 0;
  let removedByAge = 0;

  const afterFilter = all.filter((entry) => {
    // Drop login records (legacy: non li registriamo piu')
    if ((entry as { action?: string }).action === 'login') {
      removedLoginLegacy++;
      return false;
    }
    // Drop records older than MAX_ACTIVITY_AGE_DAYS
    const ts = new Date(entry.timestamp).getTime();
    if (!Number.isFinite(ts) || ts < cutoffMs) {
      removedByAge++;
      return false;
    }
    return true;
  });

  // Cap: tieni solo gli ultimi MAX_ACTIVITY_RECORDS (per timestamp desc)
  let final = afterFilter;
  let removedByCap = 0;
  if (final.length > MAX_ACTIVITY_RECORDS) {
    final = [...final]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, MAX_ACTIVITY_RECORDS);
    removedByCap = afterFilter.length - final.length;
  }

  const removed = totalBefore - final.length;
  if (removed > 0) {
    await activityLogsStorage.writeAll(final);
    logger.info('Activity log retention applicata', {
      before: totalBefore,
      after: final.length,
      removed,
      removedLoginLegacy,
      removedByAge,
      removedByCap,
    });
  }

  return {
    before: totalBefore,
    after: final.length,
    removed,
    removedLoginLegacy,
    removedByAge,
    removedByCap,
  };
}

/**
 * Schedula la pulizia periodica dell'activity log ogni N ore.
 * Ritorna l'handle del setInterval (ignorabile).
 */
export function scheduleActivityRetention(intervalHours = 24): NodeJS.Timeout {
  const ms = intervalHours * 60 * 60 * 1000;
  return setInterval(() => {
    purgeActivityLogs().catch((err) => logger.error('Activity retention failed', { err }));
  }, ms).unref();
}
