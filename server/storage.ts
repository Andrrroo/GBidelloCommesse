import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Semplice Mutex async per serializzare sequenze read-modify-write
 * su un singolo storage in-process. Evita che due richieste concorrenti
 * leggano la stessa versione e sovrascrivano a vicenda la scrittura.
 */
class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    return new Promise(resolve => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) next();
    else this.locked = false;
  }
}

// Generic JSON file storage
export class JSONFileStorage<T extends { id: string }> {
  private filePath: string;
  private cache: T[] | null = null;
  private mutex = new AsyncMutex();

  constructor(filename: string) {
    this.filePath = path.join(DATA_DIR, filename);
  }

  async ensureFile(): Promise<void> {
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, JSON.stringify([], null, 2), 'utf-8');
    }
  }

  async readAll(): Promise<T[]> {
    if (this.cache) return this.cache;

    await this.ensureFile();
    const content = await fs.readFile(this.filePath, 'utf-8');
    this.cache = JSON.parse(content);
    return this.cache || [];
  }

  async writeAll(data: T[]): Promise<void> {
    // Scrittura atomica: scrivi su file temporaneo, poi rinomina.
    // Invalida la cache PRIMA del rename così letture concorrenti in
    // caso di errore non restituiranno dati stale non ancora committati.
    const tmpPath = `${this.filePath}.${randomUUID().slice(0, 8)}.tmp`;
    try {
      await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tmpPath, this.filePath);
      this.cache = data;
    } catch (err) {
      // cache invalidate in caso di errore per evitare stato inconsistente
      this.cache = null;
      try { await fs.unlink(tmpPath); } catch { /* ignore */ }
      throw err;
    }
  }

  async findById(id: string): Promise<T | undefined> {
    const all = await this.readAll();
    return all.find(item => item.id === id);
  }

  async create(item: T): Promise<T> {
    return this.mutex.runExclusive(async () => {
      const all = await this.readAll();
      all.push(item);
      await this.writeAll(all);
      return item;
    });
  }

  async update(id: string, updates: Partial<T>): Promise<T | null> {
    return this.mutex.runExclusive(async () => {
      const all = await this.readAll();
      const index = all.findIndex(item => item.id === id);

      if (index === -1) return null;

      all[index] = { ...all[index], ...updates };
      await this.writeAll(all);
      return all[index];
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.mutex.runExclusive(async () => {
      const all = await this.readAll();
      const filtered = all.filter(item => item.id !== id);

      if (filtered.length === all.length) return false;

      await this.writeAll(filtered);
      return true;
    });
  }

  async findByField<K extends keyof T>(field: K, value: T[K]): Promise<T[]> {
    const all = await this.readAll();
    return all.filter(item => item[field] === value);
  }

  /**
   * Esegue una operazione arbitraria read-modify-write sotto il mutex
   * dello storage. Usare per garantire unicità di campi o consistenza
   * di operazioni multi-step (es. generare un codice unico e poi creare
   * il record senza che un'altra richiesta si infili in mezzo).
   */
  async withLock<R>(fn: () => Promise<R>): Promise<R> {
    return this.mutex.runExclusive(fn);
  }

  clearCache(): void {
    this.cache = null;
  }
}

// Storage instances
import type {
  Project,
  Client,
  FatturaIngresso,
  CostoVivo,
  Prestazione,
  UserWithPassword,
  Scadenza,
  Comunicazione,
  Tag,
  ProjectTag,
  FileRouting,
  ProjectResource,
  Collaboratore,
  ActivityLog,
  FatturaEmessa,
  FatturaConsulente,
  CostoGenerale
} from '@shared/schema';

export const projectsStorage = new JSONFileStorage<Project>('projects.json');
export const clientsStorage = new JSONFileStorage<Client>('clients.json');
export const fattureIngressoStorage = new JSONFileStorage<FatturaIngresso>('fatture-ingresso.json');
export const costiViviStorage = new JSONFileStorage<CostoVivo>('costi-vivi.json');
export const prestazioniStorage = new JSONFileStorage<Prestazione>('prestazioni.json');
export const usersStorage = new JSONFileStorage<UserWithPassword>('users.json');
export const scadenzeStorage = new JSONFileStorage<Scadenza>('scadenze.json');
export const comunicazioniStorage = new JSONFileStorage<Comunicazione>('comunicazioni.json');
export const tagsStorage = new JSONFileStorage<Tag>('tags.json');
export const projectTagsStorage = new JSONFileStorage<ProjectTag & { id: string }>('project-tags.json');
export const fileRoutingsStorage = new JSONFileStorage<FileRouting>('file-routings.json');
export const projectResourcesStorage = new JSONFileStorage<ProjectResource>('project-resources.json');
export const collaboratoriStorage = new JSONFileStorage<Collaboratore>('collaboratori.json');

// Nuovi storage
export const activityLogsStorage = new JSONFileStorage<ActivityLog>('activity-logs.json');
export const fattureEmesseStorage = new JSONFileStorage<FatturaEmessa>('fatture-emesse.json');
export const fattureConsulentiStorage = new JSONFileStorage<FatturaConsulente>('fatture-consulenti.json');
export const costiGeneraliStorage = new JSONFileStorage<CostoGenerale>('costi-generali.json');
