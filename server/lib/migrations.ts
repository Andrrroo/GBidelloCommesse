import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const META_FILE = path.join(DATA_DIR, '_schema-version.json');

// ----------------------------------------------------------------------------
// VERSIONE ATTUALE DELLO SCHEMA
// Incrementare di 1 ogni volta che si introduce una migrazione in `MIGRATIONS`.
// ----------------------------------------------------------------------------
export const SCHEMA_VERSION = 7;

/**
 * Ogni migrazione riceve il percorso di `data/` e fa in-place i cambiamenti
 * necessari. Deve essere idempotente: eseguirla due volte sullo stesso dato
 * non deve rompere nulla. Rilanciare errore ferma la catena.
 *
 * Esempio di firma: async (dataDir) => { ... }
 *
 * Oggi la chain è vuota (siamo al baseline v1). Quando servirà cambiare uno
 * schema, aggiungere qui una funzione con indice = versione target.
 */
type MigrationFn = (dataDir: string) => Promise<void>;

// Helper usato da v7: applica una trasformazione a ciascun record di un
// file JSON array, salva solo se qualcosa è cambiato.
async function mutateJsonArray(
  filePath: string,
  mutate: (record: any) => boolean
): Promise<void> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return;
    let changed = false;
    for (const it of items) {
      if (it && typeof it === 'object' && mutate(it)) changed = true;
    }
    if (changed) await fs.writeFile(filePath, JSON.stringify(items, null, 2), 'utf-8');
  } catch {
    // file assente: nulla da fare
  }
}

const MIGRATIONS: Record<number, MigrationFn> = {
  // v2 — merge di ProfiloCosto in Collaboratore:
  // rinomina user.profiloCostoId -> user.collaboratoreId e rimuove
  // l'eventuale file profili-costo.json (vuoto o meno).
  2: async (dataDir) => {
    const usersFile = path.join(dataDir, 'users.json');
    try {
      const raw = await fs.readFile(usersFile, 'utf-8');
      const users = JSON.parse(raw);
      if (Array.isArray(users)) {
        let changed = false;
        for (const u of users) {
          if (u && typeof u === 'object' && 'profiloCostoId' in u) {
            u.collaboratoreId = u.profiloCostoId;
            delete u.profiloCostoId;
            changed = true;
          }
        }
        if (changed) {
          await fs.writeFile(usersFile, JSON.stringify(users, null, 2), 'utf-8');
        }
      }
    } catch {
      // users.json mancante: nulla da fare
    }
    // Rimozione del file obsoleto
    try {
      await fs.unlink(path.join(dataDir, 'profili-costo.json'));
    } catch {
      // già assente: ok
    }
  },

  // v7 — rename Collaboratore → Dipendente (anagrafica, non ruolo utente):
  //   - rinomina file data/collaboratori.json → data/dipendenti.json
  //   - rinomina field collaboratoreId → dipendenteId nei record di
  //     costi-generali.json, project-resources.json, users.json
  //   - rimuove il campo isDipendente dai record esistenti (obsoleto:
  //     tutti in anagrafica sono dipendenti ora)
  7: async (dataDir) => {
    // 1) rename del file
    const oldPath = path.join(dataDir, 'collaboratori.json');
    const newPath = path.join(dataDir, 'dipendenti.json');
    try {
      await fs.rename(oldPath, newPath);
    } catch {
      // già rinominato o assente: ok
    }
    // 2) pulisci isDipendente nei record dipendenti (cosmetico, non bloccante)
    await mutateJsonArray(newPath, (rec) => {
      if ('isDipendente' in rec) { delete rec.isDipendente; return true; }
      return false;
    });
    // 3) rinomina collaboratoreId → dipendenteId nei file collegati
    const filesToPatch = [
      path.join(dataDir, 'costi-generali.json'),
      path.join(dataDir, 'project-resources.json'),
      path.join(dataDir, 'users.json'),
    ];
    for (const f of filesToPatch) {
      await mutateJsonArray(f, (rec) => {
        if ('collaboratoreId' in rec) {
          if (!('dipendenteId' in rec)) rec.dipendenteId = rec.collaboratoreId;
          delete rec.collaboratoreId;
          return true;
        }
        return false;
      });
    }
  },

  // v6 — aggiunto campo codiceFiscale opzionale a Collaboratore per matchare
  // le buste paga PDF in upload. Nessuna operazione sui dati esistenti.
  //
  // v5 — aggiunta categoria "abbonamento" + campi periodicita/ricorrenzaId
  // a CostoGenerale. Tutti opzionali, nessuna operazione sui dati esistenti.
  //
  // v4 — aggiunti isDipendente/stipendioMensile a Collaboratore e
  // collaboratoreId/periodo a CostoGenerale. Tutti opzionali → nessuna
  // operazione sui dati esistenti, il bump serve solo a marcare la versione.
  //
  // v3 — rimossi i campi `ricorrente` e `periodicita` da CostoGenerale
  // (ogni pagamento è una fattura distinta, non servivano). Pulisco i
  // record esistenti così lo schema Zod strict non incontra campi extra.
  3: async (dataDir) => {
    const file = path.join(dataDir, 'costi-generali.json');
    try {
      const raw = await fs.readFile(file, 'utf-8');
      const items = JSON.parse(raw);
      if (!Array.isArray(items)) return;
      let changed = false;
      for (const it of items) {
        if (it && typeof it === 'object') {
          if ('ricorrente' in it) { delete it.ricorrente; changed = true; }
          if ('periodicita' in it) { delete it.periodicita; changed = true; }
        }
      }
      if (changed) await fs.writeFile(file, JSON.stringify(items, null, 2), 'utf-8');
    } catch {
      // file mancante: nulla da fare
    }
  },
};

interface SchemaMeta {
  version: number;
  lastMigration?: string;
  history?: Array<{ to: number; at: string }>;
}

async function readMeta(): Promise<SchemaMeta> {
  try {
    const raw = await fs.readFile(META_FILE, 'utf-8');
    return JSON.parse(raw) as SchemaMeta;
  } catch {
    // Nessun meta file: è un DB fresco oppure esisteva prima dell'introduzione
    // del sistema di migrazioni. Trattiamolo come "già allineato" per non
    // rovinare dati esistenti — assumiamo che i dati correnti corrispondano
    // alla versione corrente.
    return { version: SCHEMA_VERSION };
  }
}

async function writeMeta(meta: SchemaMeta): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

/**
 * Esegue in sequenza tutte le migrazioni mancanti, dalla versione corrente
 * del DB fino a `SCHEMA_VERSION`. Non-bloccante sul server: in caso di
 * errore logga e prosegue (per non bloccare l'avvio su un data bug isolato),
 * ma ritorna false per segnalare lo stato.
 */
export async function runMigrations(): Promise<boolean> {
  const meta = await readMeta();
  const from = Number(meta.version) || 0;
  if (from >= SCHEMA_VERSION) {
    logger.info('Schema già aggiornato', { version: from });
    return true;
  }

  logger.info('Esecuzione migrazioni schema', { from, to: SCHEMA_VERSION });
  const history = Array.isArray(meta.history) ? [...meta.history] : [];
  let current = from;

  for (let v = from + 1; v <= SCHEMA_VERSION; v++) {
    const fn = MIGRATIONS[v];
    if (!fn) {
      // Nessuna funzione registrata per questa versione: probabilmente è
      // un salto di versione senza operazione dati (es. solo aggiunta campo
      // opzionale). Avanziamo comunque il marker.
      logger.info('Migrazione skip (nessuna op)', { version: v });
      current = v;
      history.push({ to: v, at: new Date().toISOString() });
      continue;
    }
    try {
      await fn(DATA_DIR);
      current = v;
      history.push({ to: v, at: new Date().toISOString() });
      logger.info('Migrazione completata', { version: v });
    } catch (err) {
      logger.error('Migrazione fallita', { version: v, err: err as Error });
      // Persistiamo comunque lo stato intermedio per non riapplicare ciò che
      // già è andato a buon fine alla prossima boot.
      await writeMeta({ version: current, lastMigration: new Date().toISOString(), history });
      return false;
    }
  }

  await writeMeta({ version: current, lastMigration: new Date().toISOString(), history });
  return true;
}
