import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { activityLogsStorage } from '../storage.js';
import { logger } from './logger.js';

export type ActivityAction = 'create' | 'update' | 'delete' | 'view' | 'payment';

export type ActivityEntity =
  | 'project'
  | 'client'
  | 'fattura_ingresso'
  | 'fattura_emessa'
  | 'fattura_consulente'
  | 'costo_vivo'
  | 'costo_generale'
  | 'prestazione'
  | 'scadenza'
  | 'comunicazione'
  | 'risorsa'
  | 'dipendente'
  | 'user'
  | 'tag';

interface LogActivityOptions {
  action: ActivityAction;
  entityType: ActivityEntity;
  entityId: string;
  details?: string;
  /** Utente esplicito quando non disponibile dalla session (es. login) */
  userIdOverride?: string;
  userNameOverride?: string;
}

/**
 * Registra un evento nel log attività.
 * Non solleva mai errori: se il log fallisce (es. storage indisponibile)
 * viene loggato internamente ma l'operazione dell'utente prosegue.
 * Non logga se non c'è un utente associabile.
 */
export async function logActivity(req: Request, opts: LogActivityOptions): Promise<void> {
  try {
    const sessionUser = req.session?.user;
    const userId = opts.userIdOverride || sessionUser?.id;
    const userName = opts.userNameOverride || sessionUser?.nome || sessionUser?.username || 'sconosciuto';

    if (!userId) return; // Nessun utente → nessun log

    await activityLogsStorage.create({
      id: randomUUID(),
      userId,
      userName,
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      details: opts.details,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Logging del log fallito: non interrompiamo l'operazione principale
    logger.warn('Activity log write failed (non bloccante)', {
      err: err as Error,
      action: opts.action,
      entityType: opts.entityType,
    });
  }
}
