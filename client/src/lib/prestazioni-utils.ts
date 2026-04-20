import type { ProjectPrestazioni } from "@shared/schema";
import {
  Ruler, HardHat, Shield, BarChart3, CheckCircle2, Scale, ClipboardList,
  Hammer, RefreshCw, Handshake, Users, Settings, Link2,
  type LucideIcon,
} from "lucide-react";

// Configurazione prestazioni professionali
export type PrestazioneKey = 'progettazione' | 'dl' | 'csp' | 'cse' | 'contabilita' | 'collaudo' | 'perizia' | 'pratiche';
export const PRESTAZIONI_CONFIG: Record<PrestazioneKey, {
  id: string;
  Icon: LucideIcon;
  label: string;
  shortLabel: string;
  className: string;
  description: string;
}> = {
  progettazione: {
    id: 'progettazione',
    Icon: Ruler,
    label: 'Progettazione',
    shortLabel: 'Prog.',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'Progettazione architettonica e/o strutturale'
  },
  dl: {
    id: 'dl',
    Icon: HardHat,
    label: 'Direzione Lavori',
    shortLabel: 'DL',
    className: 'bg-purple-100 text-purple-800 border-purple-200',
    description: 'Direzione lavori e supervisione cantiere'
  },
  csp: {
    id: 'csp',
    Icon: Shield,
    label: 'CSP',
    shortLabel: 'CSP',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
    description: 'Coordinamento Sicurezza in fase di Progettazione'
  },
  cse: {
    id: 'cse',
    Icon: Shield,
    label: 'CSE',
    shortLabel: 'CSE',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
    description: 'Coordinamento Sicurezza in fase di Esecuzione'
  },
  contabilita: {
    id: 'contabilita',
    Icon: BarChart3,
    label: 'Contabilità Lavori',
    shortLabel: 'Cont.',
    className: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    description: 'Contabilità lavori e gestione economica'
  },
  collaudo: {
    id: 'collaudo',
    Icon: CheckCircle2,
    label: 'Collaudo',
    shortLabel: 'Coll.',
    className: 'bg-green-100 text-green-800 border-green-200',
    description: 'Collaudo statico e/o funzionale'
  },
  perizia: {
    id: 'perizia',
    Icon: Scale,
    label: 'Perizia',
    shortLabel: 'Per.',
    className: 'bg-pink-100 text-pink-800 border-pink-200',
    description: 'Perizie, CTU, CTP'
  },
  pratiche: {
    id: 'pratiche',
    Icon: ClipboardList,
    label: 'Pratiche',
    shortLabel: 'Prat.',
    className: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    description: 'Pratiche strutturali ed edilizie'
  }
};

// Configurazione livelli progettazione
export type LivelloProgettazioneKey = 'pfte' | 'definitivo' | 'esecutivo' | 'variante';
export const LIVELLO_PROGETTAZIONE_CONFIG: Record<LivelloProgettazioneKey, {
  id: string;
  label: string;
  fullLabel: string;
  description: string;
  className: string;
  Icon: LucideIcon;
}> = {
  pfte: {
    id: 'pfte',
    label: 'PFTE',
    fullLabel: 'Progetto di Fattibilità Tecnico-Economica',
    description: 'Progetto di Fattibilità Tecnico-Economica',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
    Icon: ClipboardList,
  },
  definitivo: {
    id: 'definitivo',
    label: 'Definitivo',
    fullLabel: 'Progetto Definitivo',
    description: 'Progetto definitivo',
    className: 'bg-orange-50 text-orange-700 border-orange-200',
    Icon: Ruler,
  },
  esecutivo: {
    id: 'esecutivo',
    label: 'Esecutivo',
    fullLabel: 'Progetto Esecutivo',
    description: 'Progetto esecutivo',
    className: 'bg-green-50 text-green-700 border-green-200',
    Icon: Hammer,
  },
  variante: {
    id: 'variante',
    label: 'Variante',
    fullLabel: 'Variante in corso d\'opera',
    description: 'Variante in corso d\'opera',
    className: 'bg-purple-50 text-purple-700 border-purple-200',
    Icon: RefreshCw,
  },
};

// Tipi per autocomplete e type safety
export type PrestazioneType = keyof typeof PRESTAZIONI_CONFIG;
export type LivelloProgettazioneType = keyof typeof LIVELLO_PROGETTAZIONE_CONFIG;

// Funzione per formattare importi in euro
export function formatImporto(amount?: number | null): string {
  if (amount === undefined || amount === null) return '€ 0';
  if (amount === 0) return '€ 0';
  
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(amount);
}

// Funzione per formattare percentuale
export function formatPercentuale(percentage?: number | null): string {
  if (!percentage) return '-';
  return `${percentage.toFixed(2)}%`;
}

// Funzione per validare classe DM 143/2013
export function validateClasseDM143(classe?: string): boolean {
  if (!classe) return true; // Opzionale
  
  // Esempi di classi valide: E22, IA03, S05, etc.
  const pattern = /^[A-Z]{1,2}[0-9]{1,2}$/;
  return pattern.test(classe);
}

// Funzione per renderizzare badge prestazioni
export function renderPrestazioneBadge(
  prestazione: PrestazioneType,
  size: 'sm' | 'md' = 'sm'
): {
  Icon: LucideIcon;
  label: string;
  className: string;
  fullLabel: string;
} {
  const config = PRESTAZIONI_CONFIG[prestazione];
  const sizeClass = size === 'sm'
    ? 'px-2 py-1 text-xs'
    : 'px-3 py-1.5 text-sm';

  return {
    Icon: config.Icon,
    label: config.shortLabel,
    className: `inline-flex items-center gap-1 rounded-full font-medium border ${config.className} ${sizeClass}`,
    fullLabel: config.label,
  };
}

// Funzione per ottenere configurazione prestazione
export function getPrestazioneConfig(prestazione: PrestazioneType) {
  return PRESTAZIONI_CONFIG[prestazione];
}

// Funzione per ottenere tutte le prestazioni disponibili
export function getAllPrestazioni(): Array<{ id: PrestazioneType; config: typeof PRESTAZIONI_CONFIG[PrestazioneType] }> {
  return Object.entries(PRESTAZIONI_CONFIG).map(([id, config]) => ({
    id: id as PrestazioneType,
    config
  }));
}

// Funzione per ottenere tutti i livelli progettazione
export function getAllLivelliProgettazione(): Array<{ id: LivelloProgettazioneType; config: typeof LIVELLO_PROGETTAZIONE_CONFIG[LivelloProgettazioneType] }> {
  return Object.entries(LIVELLO_PROGETTAZIONE_CONFIG).map(([id, config]) => ({
    id: id as LivelloProgettazioneType,
    config
  }));
}

// Funzione helper per verificare se progettazione è selezionata
export function hasProgettazione(prestazioni?: string[]): boolean {
  return prestazioni?.includes('progettazione') ?? false;
}

// Funzione per calcolare importo totale (opere + servizio)
export function calcolaImportoTotale(importoOpere?: number, importoServizio?: number): number {
  return (importoOpere || 0) + (importoServizio || 0);
}

// Funzione per validare i dati prestazioni
export function validatePrestazioniData(data: ProjectPrestazioni): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Almeno una prestazione deve essere selezionata
  if (!data.prestazioni || data.prestazioni.length === 0) {
    errors.push('Almeno una prestazione deve essere selezionata');
  }
  
  // Se progettazione è selezionata, richiedere livello
  if (hasProgettazione(data.prestazioni) && (!data.livelloProgettazione || data.livelloProgettazione.length === 0)) {
    errors.push('Se la progettazione è selezionata, è necessario specificare il livello');
  }
  
  // Validare importi
  if (data.importoOpere && data.importoOpere < 0) {
    errors.push('L\'importo opere deve essere maggiore o uguale a 0');
  }
  
  if (data.importoServizio && data.importoServizio < 0) {
    errors.push('L\'importo servizio deve essere maggiore o uguale a 0');
  }
  
  if (data.percentualeParcella && (data.percentualeParcella < 0 || data.percentualeParcella > 100)) {
    errors.push('La percentuale parcella deve essere tra 0 e 100');
  }
  
  // Validare classe DM 143
  if (data.classeDM143 && !validateClasseDM143(data.classeDM143)) {
    errors.push('Formato classe DM 143/2013 non valido (es: E22, IA03, S05)');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Funzioni helper per il rendering delle colonne (solo testo)
export function renderPrestazioniColumn(prestazioni?: string[]): string[] {
  if (!prestazioni || prestazioni.length === 0) return [];

  return prestazioni.map(p => {
    const config = PRESTAZIONI_CONFIG[p as PrestazioneType];
    return config ? config.shortLabel : p;
  });
}

export function renderClasseDMColumn(classe?: string, importoOpere?: number): {
  classe: string;
  importo: string;
  isFormatted: boolean;
} {
  return {
    classe: classe || '-',
    importo: formatImporto(importoOpere),
    isFormatted: !!classe
  };
}

// Funzione per renderizzare badge livelli progettazione
export function renderLivelloProgettazioneBadge(
  livello: LivelloProgettazioneType,
  size: 'sm' | 'md' = 'sm'
): {
  Icon: LucideIcon;
  label: string;
  className: string;
  fullLabel: string;
} {
  const config = LIVELLO_PROGETTAZIONE_CONFIG[livello];
  const sizeClass = size === 'sm'
    ? 'px-2 py-1 text-xs'
    : 'px-3 py-1.5 text-sm';

  return {
    Icon: config.Icon,
    label: config.label,
    className: `inline-flex items-center gap-1 rounded-full font-medium border ${config.className} ${sizeClass}`,
    fullLabel: config.fullLabel,
  };
}

// Funzione per renderizzare colonna livelli progettazione
export function renderLivelliProgettazioneColumn(
  prestazioni?: string[],
  livelloProgettazione?: string[]
): Array<{
  Icon: LucideIcon;
  label: string;
  className: string;
  fullLabel: string;
}> {
  // Mostra livelli solo se progettazione è selezionata
  if (!hasProgettazione(prestazioni) || !livelloProgettazione || livelloProgettazione.length === 0) {
    return [];
  }

  return livelloProgettazione.map(livello =>
    renderLivelloProgettazioneBadge(livello as LivelloProgettazioneType)
  );
}

// Configurazione tipi rapporto committenza
export type TipoRapportoKey = 'diretto' | 'consulenza' | 'subappalto' | 'ati' | 'partnership';
export const TIPO_RAPPORTO_CONFIG: Record<TipoRapportoKey, {
  id: string;
  label: string;
  description: string;
  className: string;
  Icon: LucideIcon;
}> = {
  diretto: {
    id: 'diretto',
    label: 'Diretto',
    description: 'Incarico diretto con il committente',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
    Icon: Handshake,
  },
  consulenza: {
    id: 'consulenza',
    label: 'Consulenza',
    description: 'Consulenza per altro professionista',
    className: 'bg-purple-50 text-purple-700 border-purple-200',
    Icon: Users,
  },
  subappalto: {
    id: 'subappalto',
    label: 'Subappalto',
    description: 'Subappalto da altro professionista',
    className: 'bg-orange-50 text-orange-700 border-orange-200',
    Icon: Settings,
  },
  ati: {
    id: 'ati',
    label: 'ATI',
    description: 'Associazione Temporanea di Imprese',
    className: 'bg-green-50 text-green-700 border-green-200',
    Icon: Handshake,
  },
  partnership: {
    id: 'partnership',
    label: 'Partnership',
    description: 'Partnership con altro professionista',
    className: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    Icon: Link2,
  },
};

export type TipoRapportoType = keyof typeof TIPO_RAPPORTO_CONFIG;

// Funzione per renderizzare badge tipo rapporto
export function renderTipoRapportoBadge(
  tipo: TipoRapportoType,
  size: 'sm' | 'md' = 'sm'
): {
  Icon: LucideIcon;
  label: string;
  className: string;
  description: string;
} {
  const config = TIPO_RAPPORTO_CONFIG[tipo];
  const sizeClass = size === 'sm'
    ? 'px-2 py-1 text-xs'
    : 'px-3 py-1.5 text-sm';

  return {
    Icon: config.Icon,
    label: config.label,
    className: `inline-flex items-center gap-1 rounded-full font-medium border ${config.className} ${sizeClass}`,
    description: config.description,
  };
}