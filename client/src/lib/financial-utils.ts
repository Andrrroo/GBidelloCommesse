/**
 * Utility functions condivise per calcoli finanziari
 * Usate da: fatture, costi, dashboards
 */

// Formattazione valuta in Euro (formato italiano)
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount);
};

// Formattazione valuta da centesimi
export const formatCurrencyFromCents = (cents: number): string => {
  return formatCurrency(cents / 100);
};

// Formattazione data in formato italiano
export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('it-IT');
};

// Formato corto gg/mm per widget compatti
export const formatDateShort = (dateStr: string): string => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
};

// Formattazione data completa
export const formatDateLong = (dateStr: string): string => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
};

// Interfaccia generica per item con stato pagamento
interface PayableItem {
  importo?: number;
  pagata?: boolean;
  incassata?: boolean;
}

// Calcolo totali per liste di fatture/costi. Tutti gli `importo` sono
// imponibili (senza IVA) — lo schema non traccia più l'IVA.
export const calculateTotals = <T extends PayableItem>(
  items: T[],
  amountField: 'importo' = 'importo'
): {
  total: number;
  paid: number;
  pending: number;
  count: number;
  paidCount: number;
  pendingCount: number;
} => {
  const getAmount = (item: T) => item[amountField] || 0;
  const isPaid = (item: T) => item.pagata || item.incassata || false;

  const total = items.reduce((sum, item) => sum + getAmount(item), 0);
  const paidItems = items.filter(isPaid);
  const paid = paidItems.reduce((sum, item) => sum + getAmount(item), 0);

  return {
    total,
    paid,
    pending: total - paid,
    count: items.length,
    paidCount: paidItems.length,
    pendingCount: items.length - paidItems.length
  };
};

// Verifica se una data è scaduta
export const isOverdue = (dateStr: string): boolean => {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
};

// Conta elementi scaduti non pagati
export const countOverdue = <T extends { dataScadenzaPagamento?: string; pagata?: boolean; incassata?: boolean }>(
  items: T[]
): number => {
  return items.filter(item => {
    const isPaid = item.pagata || item.incassata || false;
    return !isPaid && item.dataScadenzaPagamento && isOverdue(item.dataScadenzaPagamento);
  }).length;
};

// Raggruppa per campo (es. projectId, categoria)
export const groupBy = <T>(items: T[], key: keyof T): Record<string, T[]> => {
  return items.reduce((acc, item) => {
    const groupKey = String(item[key]);
    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(item);
    return acc;
  }, {} as Record<string, T[]>);
};

// Enrichment con dati progetto
export interface Project {
  id: string;
  code: string;
  object?: string;
  client?: string;
}

export const enrichWithProject = <T extends { projectId: string }>(
  item: T,
  projects: Project[]
): T & { projectCode?: string; projectName?: string; projectClient?: string } => {
  const project = projects.find(p => p.id === item.projectId);
  return {
    ...item,
    projectCode: project?.code,
    projectName: project?.object,
    projectClient: project?.client
  };
};

export const enrichListWithProjects = <T extends { projectId: string }>(
  items: T[],
  projects: Project[]
): (T & { projectCode?: string; projectName?: string; projectClient?: string })[] => {
  return items.map(item => enrichWithProject(item, projects));
};

// Helper per ottenere nome progetto
export const getProjectDisplayName = (projectId: string, projects: Project[]): string => {
  const project = projects.find(p => p.id === projectId);
  return project ? `${project.code} - ${project.object}` : projectId;
};

// Data di oggi in formato ISO (per form)
export const getTodayISO = (): string => {
  return new Date().toISOString().split('T')[0];
};

// Converti importo in centesimi
export const toCents = (amount: number): number => {
  return Math.round(amount * 100);
};

// Converti centesimi in euro
export const fromCents = (cents: number): number => {
  return cents / 100;
};
