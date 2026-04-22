import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import type { z } from 'zod';
import { fattureIngressoStorage, fattureEmesseStorage, fattureConsulentiStorage, costiViviStorage } from '../storage.js';
import { insertFatturaIngressoSchema, insertFatturaEmessaSchema, insertFatturaConsulenteSchema } from '@shared/schema';
import { logActivity, type ActivityEntity } from '../lib/activity-logger.js';
import { logger } from '../lib/logger.js';
import type { JSONFileStorage } from '../storage.js';

export const invoicesRouter = Router();

// ---------------------------------------------------------------------------
// Helpers condivisi per le 3 tipologie di fattura
// ---------------------------------------------------------------------------
function describeFattura(f: {
  numeroFattura?: string;
  fornitore?: string;
  cliente?: string;
  consulente?: string;
  importo?: number;
}, amountInCents: boolean): string {
  const euro = f.importo !== undefined ? (amountInCents ? f.importo / 100 : f.importo) : 0;
  const amount = euro.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  const controparte = f.fornitore ?? f.cliente ?? f.consulente ?? '';
  return `#${f.numeroFattura ?? '—'} · ${controparte} · ${amount}`;
}

function detectStatusChange(
  changes: Record<string, unknown>,
  statusField: 'pagata' | 'incassata'
): string | null {
  if (!(statusField in changes)) return null;
  const v = changes[statusField];
  if (v === true) return statusField === 'pagata' ? 'segnata come pagata' : 'segnata come incassata';
  if (v === false) return statusField === 'pagata' ? 'segnata come non pagata' : 'segnata come non incassata';
  return null;
}

// ---------------------------------------------------------------------------
// Factory che registra GET list/byId/byProject, POST, PUT+PATCH, DELETE per
// una tipologia di fattura. Centralizza validazione, activity log e logger.
// Hook opzionali `onCreate`/`onDelete` per side-effect cross-storage (es. il
// costo vivo collegato alle fatture d'ingresso con categoria costo_vivo).
// ---------------------------------------------------------------------------
interface FatturaBase {
  id: string;
  numeroFattura?: string;
  fornitore?: string;
  cliente?: string;
  consulente?: string;
  importo?: number;
}

interface InvoiceRouteConfig<T extends FatturaBase, Schema extends z.ZodTypeAny> {
  basePath: string;
  storage: JSONFileStorage<T>;
  schema: Schema;
  entityType: ActivityEntity;
  amountInCents: boolean;
  statusField: 'pagata' | 'incassata';
  // Sanitizza la risposta GET per utenti non-admin. Usato per le fatture
  // emesse: collaboratori vedono le righe senza importi.
  sanitizeForNonAdmin?: (f: T) => Partial<T>;
  onCreate?: (created: T, input: z.infer<Schema>) => Promise<void>;
  onDelete?: (deleted: T) => Promise<void>;
}

function mountInvoiceRoutes<T extends FatturaBase, Schema extends z.ZodTypeAny>(
  cfg: InvoiceRouteConfig<T, Schema>
) {
  const { basePath, storage, schema, entityType, amountInCents, statusField, sanitizeForNonAdmin, onCreate, onDelete } = cfg;
  const label = basePath.replace('/api/', '');

  const applySanitize = (req: Request, f: T): T | Partial<T> => {
    if (!sanitizeForNonAdmin) return f;
    const isAdmin = req.session?.user?.role === 'amministratore';
    return isAdmin ? f : sanitizeForNonAdmin(f);
  };

  invoicesRouter.get(basePath, async (req, res) => {
    try {
      const all = await storage.readAll();
      res.json(all.map(f => applySanitize(req, f)));
    }
    catch (error) { logger.error(`GET ${basePath} failed`, { err: error }); res.status(500).json({ error: `Failed to fetch ${label}` }); }
  });

  invoicesRouter.get(`${basePath}/:id`, async (req, res) => {
    try {
      const f = await storage.findById(req.params.id);
      f ? res.json(applySanitize(req, f)) : res.status(404).json({ error: 'Fattura not found' });
    } catch (error) { logger.error(`GET ${basePath}/:id failed`, { err: error }); res.status(500).json({ error: 'Failed to fetch fattura' }); }
  });

  invoicesRouter.get(`${basePath}/project/:projectId`, async (req, res) => {
    try {
      const list = await storage.findByField('projectId' as keyof T, req.params.projectId as T[keyof T]);
      res.json(list.map(f => applySanitize(req, f)));
    }
    catch (error) { logger.error(`GET ${basePath}/project/:projectId failed`, { err: error }); res.status(500).json({ error: 'Failed to fetch fatture for project' }); }
  });

  invoicesRouter.post(basePath, async (req, res) => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
      const fattura = { id: randomUUID(), ...result.data } as T;
      await storage.create(fattura);

      if (onCreate) {
        try { await onCreate(fattura, result.data); }
        catch (hookErr) {
          // Rollback della fattura per evitare record orfani
          try { await storage.delete(fattura.id); }
          catch (rbErr) { logger.error(`Rollback ${label} after onCreate failed`, { err: rbErr, fatturaId: fattura.id }); }
          throw hookErr;
        }
      }

      await logActivity(req, {
        action: 'create',
        entityType,
        entityId: fattura.id,
        details: describeFattura(fattura, amountInCents),
      });

      res.status(201).json(fattura);
    } catch (error) { logger.error(`POST ${basePath} failed`, { err: error }); res.status(500).json({ error: 'Failed to create fattura' }); }
  });

  async function handleUpdate(req: Request, res: Response) {
    try {
      const result = (schema as unknown as z.ZodObject<z.ZodRawShape>).partial().safeParse(req.body);
      if (!result.success) return res.status(400).json({ error: 'Validation error', details: result.error.flatten().fieldErrors });
      const updated = await storage.update(req.params.id, result.data as Partial<T>);
      if (!updated) return res.status(404).json({ error: 'Fattura not found' });

      const statusChange = detectStatusChange(result.data as Record<string, unknown>, statusField);
      const action = statusChange ? 'payment' : 'update';
      await logActivity(req, {
        action,
        entityType,
        entityId: updated.id,
        details: statusChange
          ? `${describeFattura(updated, amountInCents)} — ${statusChange}`
          : `${describeFattura(updated, amountInCents)} — campi: ${Object.keys(result.data as object).join(', ')}`,
      });

      res.json(updated);
    } catch (error) { logger.error(`UPDATE ${basePath} failed`, { err: error }); res.status(500).json({ error: 'Failed to update fattura' }); }
  }
  invoicesRouter.put(`${basePath}/:id`, handleUpdate);
  invoicesRouter.patch(`${basePath}/:id`, handleUpdate);

  invoicesRouter.delete(`${basePath}/:id`, async (req, res) => {
    try {
      const fattura = await storage.findById(req.params.id);
      const deleted = await storage.delete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Fattura not found' });

      if (fattura && onDelete) {
        try { await onDelete(fattura); }
        catch (hookErr) { logger.error(`onDelete ${label} failed`, { err: hookErr, fatturaId: fattura.id }); }
      }

      if (fattura) {
        await logActivity(req, {
          action: 'delete',
          entityType,
          entityId: fattura.id,
          details: describeFattura(fattura, amountInCents),
        });
      }
      res.status(204).send();
    } catch (error) { logger.error(`DELETE ${basePath} failed`, { err: error }); res.status(500).json({ error: 'Failed to delete fattura' }); }
  });
}

// --- Fatture Ingresso: hook costo_vivo collegato ---
mountInvoiceRoutes({
  basePath: '/api/fatture-ingresso',
  storage: fattureIngressoStorage,
  schema: insertFatturaIngressoSchema,
  entityType: 'fattura_ingresso',
  amountInCents: true,
  statusField: 'pagata',
  onCreate: async (fattura, input) => {
    if (input.categoria !== 'costo_vivo') return;
    await costiViviStorage.create({
      id: randomUUID(),
      projectId: input.projectId,
      tipologia: 'altro',
      data: input.dataEmissione,
      importo: input.importo,
      descrizione: `${input.descrizione} (da fattura ${input.numeroFattura} - ${input.fornitore})`,
      fatturaIngressoId: fattura.id,
    });
  },
  onDelete: async (fattura) => {
    const costiVivi = await costiViviStorage.readAll();
    const collegato = costiVivi.find(c => c.fatturaIngressoId === fattura.id);
    if (collegato) await costiViviStorage.delete(collegato.id);
  },
});

mountInvoiceRoutes({
  basePath: '/api/fatture-emesse',
  storage: fattureEmesseStorage,
  schema: insertFatturaEmessaSchema,
  entityType: 'fattura_emessa',
  amountInCents: false,
  statusField: 'incassata',
  // Collaboratori vedono la fattura (commessa, numero, data, stato, cliente)
  // ma non gli importi: entrate aziendali nascoste.
  sanitizeForNonAdmin: (f) => {
    const { importo, ...rest } = f as any;
    return rest;
  },
});

mountInvoiceRoutes({
  basePath: '/api/fatture-consulenti',
  storage: fattureConsulentiStorage,
  schema: insertFatturaConsulenteSchema,
  entityType: 'fattura_consulente',
  amountInCents: false,
  statusField: 'pagata',
});
