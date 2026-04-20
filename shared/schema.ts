import { z } from "zod";

// ============================================================================
// Projects Schema
// ============================================================================
export const CATEGORIE_LAVORO_PROFESSIONALE = ["IA01", "IA02", "IA04", "S03", "S04", "E20", "E22"] as const;
export type CategoriaLavoroProfessionale = typeof CATEGORIE_LAVORO_PROFESSIONALE[number];

// Regola di validazione condizionale: categoriaLavoro è obbligatoria quando manutenzione === false
// (commessa di tipo "Lavoro Professionale"). Viene applicata dal form client e dalla route server.
export const categoriaLavoroRefinement = (data: { manutenzione?: boolean; categoriaLavoro?: string }, ctx: z.RefinementCtx) => {
  if (!data.manutenzione && !data.categoriaLavoro) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["categoriaLavoro"],
      message: "La categoria è obbligatoria per Lavoro Professionale",
    });
  }
};

export const insertProjectSchema = z.object({
  code: z.string().min(1, "Il codice è obbligatorio"),
  client: z.string().min(1, "Il cliente è obbligatorio"),
  city: z.string().min(1, "La città è obbligatoria"),
  object: z.string().min(1, "L'oggetto è obbligatorio"),
  year: z.number().int().min(2000).max(2099),
  template: z.enum(["LUNGO", "BREVE"]),
  status: z.enum(["in_corso", "conclusa", "sospesa"]).default("in_corso"),
  tipoRapporto: z.enum(["diretto", "consulenza", "subappalto", "ati", "partnership"]).default("diretto"),
  tipoIntervento: z.enum(["professionale", "realizzativo"]).default("professionale"),
  manutenzione: z.boolean().default(false),
  categoriaLavoro: z.enum(CATEGORIE_LAVORO_PROFESSIONALE).optional(),
  budget: z.number().optional(),
  committenteFinale: z.string().optional(),
  fsRoot: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  // Data di creazione esplicita (ISO string). Permette di caricare commesse
  // passate con la data corretta. Se non fornita al create il server imposta now().
  createdAt: z.string().optional(),
});

export type InsertProject = z.infer<typeof insertProjectSchema>;

export interface Project extends InsertProject {
  id: string;
  createdAt?: string;
  fatturato?: boolean;
  numeroFattura?: string;
  dataFattura?: string;
  importoFatturato?: number;
  pagato?: boolean;
  dataPagamento?: string;
  importoPagato?: number;
  noteFatturazione?: string;
}

// ============================================================================
// Project Metadata & Prestazioni Types
// ============================================================================
export interface ProjectMetadata {
  importoOpere?: number;
  importoServizio?: number;
  percentualeParcella?: number;
  prestazioni?: string[];
  livelloProgettazione?: string[];
  classeDM143?: string;
}

export interface ProjectPrestazioni {
  prestazioni?: string[];
  livelloProgettazione?: string[];
  classeDM143?: string;
  importoOpere?: number;
  importoServizio?: number;
  percentualeParcella?: number;
}

// Schema Zod per validare il payload di PUT /api/projects/:id/prestazioni
// (payload aggiornato nel metadata del project)
export const projectPrestazioniSchema = z.object({
  prestazioni: z.array(z.string()).optional(),
  livelloProgettazione: z.array(z.string()).optional(),
  classeDM143: z.string().optional(),
  importoOpere: z.number().nonnegative().optional(),
  importoServizio: z.number().nonnegative().optional(),
  percentualeParcella: z.number().min(0).max(100).optional(),
}).strict();  // strict: rifiuta campi non previsti

// ============================================================================
// Clients Schema
// ============================================================================
export const insertClientSchema = z.object({
  sigla: z.string().min(1, "La sigla è obbligatoria"),
  name: z.string().min(1, "Il nome è obbligatorio"),
  codiceInterno: z.string().max(50, "Massimo 50 caratteri").optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  cap: z.string().optional(),
  province: z.string().optional(),
  paese: z.string().max(60, "Massimo 60 caratteri").optional().or(z.literal("")),
  piva: z.string().optional(),
  cf: z.string().optional(),
  codiceSdi: z.string().max(7, "Massimo 7 caratteri").regex(/^[A-Za-z0-9]*$/, "Codice SDI non valido (solo lettere e numeri)").optional().or(z.literal("")),
  email: z.string().email("Email non valida").optional().or(z.literal("")),
  pec: z.string().email("PEC non valida").optional().or(z.literal("")),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

export type InsertClient = z.infer<typeof insertClientSchema>;

export interface Client extends InsertClient {
  id: string;
  projectsCount?: number; // Calculated field: number of associated projects
}

// ============================================================================
// File Routing Schema
// ============================================================================
export const insertFileRoutingSchema = z.object({
  projectId: z.string(),
  fileName: z.string(),
  originalPath: z.string(),
  targetPath: z.string(),
  routedAt: z.string(),
  routedBy: z.enum(["ai", "manual"]),
  confidence: z.number().min(0).max(1).optional(),
});

export type InsertFileRouting = z.infer<typeof insertFileRoutingSchema>;

export interface FileRouting extends InsertFileRouting {
  id: string;
}

// ============================================================================
// System Config Schema
// ============================================================================
export const insertSystemConfigSchema = z.object({
  key: z.string(),
  value: z.any(),
  description: z.string().optional(),
  updatedAt: z.string(),
});

export type InsertSystemConfig = z.infer<typeof insertSystemConfigSchema>;

export interface SystemConfig extends InsertSystemConfig {
  id: string;
}

// ============================================================================
// Fatture Ingresso Schema — importo in CENTESIMI
// ============================================================================
export const insertFatturaIngressoSchema = z.object({
  projectId: z.string().min(1, "La commessa è obbligatoria"),
  numeroFattura: z.string().min(1, "Il numero fattura è obbligatorio"),
  fornitore: z.string().min(1, "Il fornitore è obbligatorio"),
  dataEmissione: z.string().min(1, "La data emissione è obbligatoria"),
  dataCaricamento: z.string().optional(),
  dataScadenzaPagamento: z.string().min(1, "La data scadenza è obbligatoria"),
  importo: z.number().positive("L'importo deve essere positivo"), // in centesimi
  categoria: z.enum(["materiali", "collaborazione_esterna", "costo_vivo", "altro"]),
  descrizione: z.string().min(1, "La descrizione è obbligatoria"),
  pagata: z.boolean().default(false),
  dataPagamento: z.string().optional(),
  allegato: z.string().optional(), // Path o URL del PDF
  note: z.string().optional(),
});

export type InsertFatturaIngresso = z.infer<typeof insertFatturaIngressoSchema>;

export interface FatturaIngresso extends InsertFatturaIngresso {
  id: string;
}

// ============================================================================
// Costi Vivi Schema — importo in CENTESIMI
// ============================================================================
export const insertCostoVivoSchema = z.object({
  projectId: z.string().min(1, "La commessa è obbligatoria"),
  userId: z.string().optional(),
  userName: z.string().optional(),
  tipologia: z.enum(["viaggio", "parcheggio", "carburante", "alloggio", "vitto", "autostrada", "altro"]),
  data: z.string().min(1, "La data è obbligatoria"),
  importo: z.number().positive("L'importo deve essere positivo"), // in centesimi
  descrizione: z.string().min(1, "La descrizione è obbligatoria"),
  luogo: z.string().optional(),
  km: z.number().optional(),
  destinazione: z.string().optional(),
  allegato: z.string().optional(), // Path o URL del PDF/ricevuta
  note: z.string().optional(),
  fatturaIngressoId: z.string().optional(), // Link a fattura ingresso che ha generato questo costo
});

export type InsertCostoVivo = z.infer<typeof insertCostoVivoSchema>;

export interface CostoVivo extends InsertCostoVivo {
  id: string;
}

// ============================================================================
// Prestazioni (Work Performance) Schema
// ============================================================================
export const insertPrestazioneSchema = z.object({
  projectId: z.string().min(1, "La commessa è obbligatoria"),
  userId: z.string().min(1, "L'utente è obbligatorio"),
  userName: z.string().min(1, "Il nome utente è obbligatorio"),
  data: z.string().min(1, "La data è obbligatoria"),
  oreLavoro: z.number().positive("Le ore lavoro devono essere positive"),
  costoOrario: z.number().positive("Il costo orario deve essere positivo"),
  descrizione: z.string().min(1, "La descrizione è obbligatoria"),
  categoria: z.string().optional(),
  note: z.string().optional(),
});

export type InsertPrestazione = z.infer<typeof insertPrestazioneSchema>;

export interface Prestazione extends InsertPrestazione {
  id: string;
}

// ============================================================================
// Users Schema
// ============================================================================
export const insertUserSchema = z.object({
  username: z.string().min(1, "L'username è obbligatorio"),
  password: z.string()
    .min(8, "La password deve avere almeno 8 caratteri")
    .regex(/[0-9]/, "La password deve contenere almeno un numero"),
  nome: z.string().min(1, "Il nome è obbligatorio"),
  email: z.string().email("Email non valida"),
  role: z.enum(["amministratore", "collaboratore"]).default("collaboratore"),
  // Riferimento all'anagrafica collaboratore: da qui arriva il costoOrario
  // di default per le prestazioni dell'utente se non specificato esplicitamente.
  collaboratoreId: z.string().optional(),
  active: z.boolean().default(true),
  createdAt: z.string().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;

export interface User extends Omit<InsertUser, 'password'> {
  id: string;
  createdAt: string;
}

export interface UserWithPassword extends InsertUser {
  id: string;
  createdAt: string;
}

// ============================================================================
// Collaboratori Schema (anagrafica aziendale — solo admin)
// ============================================================================
export const insertCollaboratoreSchema = z.object({
  nome: z.string().min(1, "Il nome e' obbligatorio"),
  cognome: z.string().min(1, "Il cognome e' obbligatorio"),
  email: z.string().email("Email non valida").optional().or(z.literal('')),
  telefono: z.string().optional(),
  ruolo: z.string().optional(), // es. "Ingegnere", "Geometra", "Tecnico"
  costoOrario: z.number().positive("Il costo orario deve essere positivo"),
  active: z.boolean().default(true),
  note: z.string().optional(),
});

export type InsertCollaboratore = z.infer<typeof insertCollaboratoreSchema>;

export interface Collaboratore extends InsertCollaboratore {
  id: string;
  createdAt?: string;
}

// ============================================================================
// Activity Log Schema (Log personale utente)
// ============================================================================
export const insertActivityLogSchema = z.object({
  userId: z.string().min(1, "L'utente è obbligatorio"),
  userName: z.string().min(1, "Il nome utente è obbligatorio"),
  action: z.string().min(1, "L'azione è obbligatoria"),
  entityType: z.string().min(1, "Il tipo entità è obbligatorio"), // project, fattura, costo, etc.
  entityId: z.string().optional(),
  details: z.string().optional(),
  timestamp: z.string().min(1, "Il timestamp è obbligatorio"),
  ipAddress: z.string().optional(),
});

export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export interface ActivityLog extends InsertActivityLog {
  id: string;
}


// ============================================================================
// Fatture Emesse Schema (solo ADMIN) — importi in EURO
// ============================================================================
export const insertFatturaEmessaSchema = z.object({
  projectId: z.string().min(1, "La commessa è obbligatoria"),
  numeroFattura: z.string().min(1, "Il numero fattura è obbligatorio"),
  cliente: z.string().min(1, "Il cliente è obbligatorio"),
  dataEmissione: z.string().min(1, "La data emissione è obbligatoria"),
  dataScadenzaPagamento: z.string().min(1, "La data scadenza è obbligatoria"),
  importo: z.number().positive("L'importo deve essere positivo"),
  importoIVA: z.number().min(0).optional(),
  importoTotale: z.number().positive("L'importo totale deve essere positivo"),
  descrizione: z.string().min(1, "La descrizione è obbligatoria"),
  incassata: z.boolean().default(false),
  dataIncasso: z.string().optional(),
  allegato: z.string().optional(), // Path o URL del PDF
  note: z.string().optional(),
});

export type InsertFatturaEmessa = z.infer<typeof insertFatturaEmessaSchema>;

export interface FatturaEmessa extends InsertFatturaEmessa {
  id: string;
}

// ============================================================================
// Fatture Consulenti Schema (solo ADMIN) — importi in EURO
// ============================================================================
export const insertFatturaConsulenteSchema = z.object({
  projectId: z.string().min(1, "La commessa è obbligatoria"),
  numeroFattura: z.string().min(1, "Il numero fattura è obbligatorio"),
  consulente: z.string().min(1, "Il consulente è obbligatorio"),
  dataEmissione: z.string().min(1, "La data emissione è obbligatoria"),
  dataScadenzaPagamento: z.string().min(1, "La data scadenza è obbligatoria"),
  importo: z.number().positive("L'importo deve essere positivo"),
  descrizione: z.string().min(1, "La descrizione è obbligatoria"),
  pagata: z.boolean().default(false),
  dataPagamento: z.string().optional(),
  allegato: z.string().optional(), // Path o URL del PDF
  note: z.string().optional(),
});

export type InsertFatturaConsulente = z.infer<typeof insertFatturaConsulenteSchema>;

export interface FatturaConsulente extends InsertFatturaConsulente {
  id: string;
}

// ============================================================================
// Costi Generali Schema (non associati a commesse) — importi in EURO
// ============================================================================
export const insertCostoGeneraleSchema = z.object({
  categoria: z.enum([
    "noleggio_auto",
    "fitto_ufficio",
    "energia",
    "internet_dati",
    "giardiniere",
    "pulizie",
    "multe",
    "assicurazioni",
    "commercialista",
    "altro"
  ]),
  fornitore: z.string().min(1, "Il fornitore è obbligatorio"),
  descrizione: z.string().min(1, "La descrizione è obbligatoria"),
  data: z.string().min(1, "La data è obbligatoria"),
  dataScadenza: z.string().optional(),
  importo: z.number().positive("L'importo deve essere positivo"),
  pagato: z.boolean().default(false),
  dataPagamento: z.string().optional(),
  allegato: z.string().optional(), // Path o URL del PDF
  note: z.string().optional(),
});

export type InsertCostoGenerale = z.infer<typeof insertCostoGeneraleSchema>;

export interface CostoGenerale extends InsertCostoGenerale {
  id: string;
}

// ============================================================================
// Scadenze (Deadlines) Schema
// ============================================================================
export const insertScadenzaSchema = z.object({
  projectId: z.string().min(1, "La commessa è obbligatoria"),
  titolo: z.string().min(1, "Il titolo è obbligatorio"),
  data: z.string().min(1, "La data è obbligatoria"),
  tipo: z.enum(["milestone", "deadline", "reminder", "altro"]),
  priorita: z.enum(["bassa", "media", "alta"]).default("media"),
  completata: z.boolean().default(false),
  descrizione: z.string().optional(),
  note: z.string().optional(),
});

export type InsertScadenza = z.infer<typeof insertScadenzaSchema>;

export interface Scadenza extends InsertScadenza {
  id: string;
}

// ============================================================================
// Comunicazioni Schema
// ============================================================================
export const insertComunicazioneSchema = z.object({
  projectId: z.string().min(1, "La commessa è obbligatoria"),
  data: z.string().min(1, "La data è obbligatoria"),
  tipo: z.enum(["email", "telefono", "riunione", "verbale", "altro"]),
  oggetto: z.string().min(1, "L'oggetto è obbligatorio"),
  descrizione: z.string().min(1, "La descrizione è obbligatoria"),
  partecipanti: z.string().optional(),
  allegati: z.array(z.string()).optional(),
  note: z.string().optional(),
});

export type InsertComunicazione = z.infer<typeof insertComunicazioneSchema>;

export interface Comunicazione extends InsertComunicazione {
  id: string;
}

// ============================================================================
// Tags Schema
// ============================================================================
export const insertTagSchema = z.object({
  name: z.string().min(1, "Il nome è obbligatorio"),
  color: z.string(),
  description: z.string().optional(),
});

export type InsertTag = z.infer<typeof insertTagSchema>;

export interface Tag extends InsertTag {
  id: string;
}

// ============================================================================
// Project Tags Relation
// ============================================================================
export const insertProjectTagSchema = z.object({
  projectId: z.string().min(1, "Il progetto e' obbligatorio"),
  tagId: z.string().min(1, "Il tag e' obbligatorio"),
});

export type InsertProjectTag = z.infer<typeof insertProjectTagSchema>;

export interface ProjectTag {
  projectId: string;
  tagId: string;
}

// ============================================================================
// Project Resources Schema
// ============================================================================
export const insertProjectResourceSchema = z.object({
  projectId: z.string().min(1, "La commessa è obbligatoria"),
  userName: z.string().min(1, "Il nome utente è obbligatorio"),
  userEmail: z.string().email().optional().or(z.literal('')),
  role: z.string().min(1, "Il ruolo è obbligatorio"),
  oreAssegnate: z.number().min(0).default(0),
  oreLavorate: z.number().min(0).default(0),
  orePagate: z.number().min(0).default(0),
  costoOrario: z.number().min(0).default(0),
  isResponsabile: z.boolean().default(false),
  dataInizio: z.string().optional(),
  dataFine: z.string().optional(),
  collaboratoreId: z.string().optional(), // link all'anagrafica Collaboratore
});

export type InsertProjectResource = z.infer<typeof insertProjectResourceSchema>;

export interface ProjectResource extends InsertProjectResource {
  id: string;
}

// ============================================================================
// Extended types (campi inglesi usati nel frontend)
// ============================================================================
export interface Communication extends Comunicazione {
  communicationDate?: string;
  direction?: string;
  type?: string;
  subject?: string;
  recipient?: string;
  sender?: string;
  attachments?: string[];
  tags?: string[];
  isImportant?: boolean;
  createdBy?: string;
}

export interface Deadline extends Scadenza {
  dueDate?: string;
  title?: string;
  status?: string;
  priority?: string;
  notifyDaysBefore?: number;
  completedAt?: string;
  projectCode?: string;
  projectClient?: string;
}
