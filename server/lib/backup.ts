import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const BACKUPS_DIR = path.join(__dirname, '..', '..', 'backups');

// Quanti backup conservare prima di cancellare i più vecchi
const MAX_BACKUPS = 14;

// Ogni quante ore viene eseguito il backup automatico (valore letto da index.ts)
export const BACKUP_INTERVAL_HOURS = 24;
export const BACKUP_MAX_SNAPSHOTS = MAX_BACKUPS;

function formatDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    d.getFullYear() +
    '-' + pad(d.getMonth() + 1) +
    '-' + pad(d.getDate()) +
    '_' + pad(d.getHours()) +
    '-' + pad(d.getMinutes()) +
    '-' + pad(d.getSeconds())
  );
}

async function copyJsonFiles(srcDir: string, dstDir: string): Promise<number> {
  await fs.mkdir(dstDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  let copied = 0;
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.endsWith('.json')) continue;
    const src = path.join(srcDir, e.name);
    const dst = path.join(dstDir, e.name);
    await fs.copyFile(src, dst);
    copied++;
  }
  return copied;
}

async function pruneOldBackups(): Promise<number> {
  try {
    const entries = await fs.readdir(BACKUPS_DIR, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort(); // ordinamento lessicografico = cronologico (formato YYYY-MM-DD_HH-MM-SS)
    if (dirs.length <= MAX_BACKUPS) return 0;
    const toDelete = dirs.slice(0, dirs.length - MAX_BACKUPS);
    let removed = 0;
    for (const d of toDelete) {
      await fs.rm(path.join(BACKUPS_DIR, d), { recursive: true, force: true });
      removed++;
    }
    return removed;
  } catch (err) {
    // Se non esiste la dir backups non c'è nulla da pulire
    return 0;
  }
}

export interface BackupResult {
  ok: boolean;
  snapshot?: string;
  filesCopied?: number;
  oldSnapshotsPruned?: number;
  error?: string;
}

/**
 * Crea uno snapshot di tutti i file JSON in data/ dentro backups/YYYY-MM-DD_HH-MM-SS/.
 * Non solleva in caso di errore: logga e ritorna `ok: false` per permettere al
 * chiamante di decidere come reagire (startup ignora, endpoint manuale risponde 500).
 * Viene chiamato all'avvio e (opzionalmente) su base periodica.
 */
export async function performBackup(reason: string = 'startup'): Promise<BackupResult> {
  try {
    const ts = formatDate(new Date());
    const dst = path.join(BACKUPS_DIR, ts);
    const filesCopied = await copyJsonFiles(DATA_DIR, dst);
    const oldSnapshotsPruned = await pruneOldBackups();
    logger.info('Backup completato', { reason, snapshot: ts, filesCopied, oldSnapshotsPruned });
    return { ok: true, snapshot: ts, filesCopied, oldSnapshotsPruned };
  } catch (err) {
    const e = err as Error;
    logger.warn('Backup fallito (non bloccante)', { err: e });
    return { ok: false, error: e.message };
  }
}

export interface BackupInfo {
  name: string;
  createdAt: string;      // ISO string ricostruita dal nome
  sizeBytes: number;
  filesCount: number;
}

/**
 * Elenca gli snapshot attualmente presenti in backups/.
 * Restituisce ordinato dal più recente al più vecchio.
 */
export async function listBackups(): Promise<BackupInfo[]> {
  try {
    const entries = await fs.readdir(BACKUPS_DIR, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    const result: BackupInfo[] = [];
    for (const name of dirs) {
      const dirPath = path.join(BACKUPS_DIR, name);
      const files = await fs.readdir(dirPath);
      let sizeBytes = 0;
      for (const f of files) {
        try {
          const st = await fs.stat(path.join(dirPath, f));
          sizeBytes += st.size;
        } catch { /* skip */ }
      }
      // Ricostruzione ISO: "YYYY-MM-DD_HH-MM-SS" -> "YYYY-MM-DDTHH:MM:SS"
      const iso = name.replace('_', 'T').replace(/-(\d{2})-(\d{2})$/, ':$1:$2');
      result.push({ name, createdAt: iso, sizeBytes, filesCount: files.length });
    }
    // Ordinamento lessicografico inverso (più recente prima)
    return result.sort((a, b) => b.name.localeCompare(a.name));
  } catch {
    return [];
  }
}

/**
 * Programma un backup ricorrente ogni N ore. Ritorna il handle per eventuale clear.
 */
export function scheduleBackup(everyHours: number = 24): NodeJS.Timeout {
  const ms = Math.max(1, everyHours) * 60 * 60 * 1000;
  return setInterval(() => performBackup('scheduled').catch(() => {}), ms).unref();
}
