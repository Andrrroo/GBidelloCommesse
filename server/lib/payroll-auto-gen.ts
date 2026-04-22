import { randomUUID } from 'crypto';
import { dipendentiStorage, costiGeneraliStorage } from '../storage.js';
import type { Dipendente, CostoGenerale } from '@shared/schema';
import { logger } from './logger.js';

// Auto-generazione buste paga ricorrenti.
//
// Regola: dopo la prima busta paga creata manualmente per un dipendente
// (tramite il pulsante "Genera Buste Paga" in Costi Generali), il sistema
// crea automaticamente un nuovo record ogni mese, nel giorno del mese
// corrispondente a quello della busta paga più recente.
//
// Idempotente sul coppia (dipendenteId, periodo): il batch generator
// già esistente usa la stessa chiave, quindi una generazione manuale e
// una automatica per lo stesso periodo non si duplicano.
//
// Catch-up: se il server è rimasto spento per mesi, al primo avvio la
// funzione crea tutte le buste paga mancanti fino a oggi (con un cap di
// sicurezza a 12 mesi per evitare avalanche su dati molto vecchi).

const MESI_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];
const MAX_CATCHUP_PER_DIPENDENTE = 12;

function meseItaliano(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number);
  return `${MESI_IT[m - 1]} ${y}`;
}

// Dato un periodo "YYYY-MM" ritorna il successivo "YYYY-MM".
function nextPeriodo(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

// Data del giorno anchor nel periodo "YYYY-MM", clampata all'ultimo giorno
// del mese se l'anchor eccede (es. anchor=31 in febbraio → 28/29).
function dataInPeriodo(periodo: string, anchorDay: number): string {
  const [y, m] = periodo.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(anchorDay, lastDay);
  const d = new Date(Date.UTC(y, m - 1, day));
  return d.toISOString().slice(0, 10);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// Sceglie la busta paga più recente per il dipendente come riferimento per
// calcolare quando scade il prossimo record auto-generato.
function latestPayrollFor(costi: CostoGenerale[], dipendenteId: string): CostoGenerale | null {
  const own = costi.filter(
    c => c.categoria === 'stipendi' && c.dipendenteId === dipendenteId && typeof c.periodo === 'string'
  );
  if (own.length === 0) return null;
  // Ordino per periodo decrescente (lessicografico su YYYY-MM funziona).
  own.sort((a, b) => (b.periodo || '').localeCompare(a.periodo || ''));
  return own[0];
}

async function processDipendente(c: Dipendente): Promise<number> {
  if (!c.active) return 0;
  if (typeof c.stipendioMensile !== 'number' || c.stipendioMensile <= 0) return 0;

  const costi = await costiGeneraliStorage.readAll();
  let latest = latestPayrollFor(costi, c.id);
  if (!latest || !latest.periodo || !latest.data) {
    // Nessuna busta paga pregressa: il primo record lo crea manualmente l'admin.
    return 0;
  }

  // Anchor day = giorno del mese della busta paga di riferimento. Se il
  // record è stato creato con la vecchia logica (data = fine mese) l'anchor
  // sarà fine mese; è coerente con quel record e accettabile come baseline.
  const anchorDay = new Date(latest.data).getUTCDate();
  const today = todayIsoDate();

  let created = 0;
  for (let i = 0; i < MAX_CATCHUP_PER_DIPENDENTE; i++) {
    const targetPeriodo = nextPeriodo(latest.periodo!);
    const targetData = dataInPeriodo(targetPeriodo, anchorDay);
    if (targetData > today) break; // non ancora maturato

    // Idempotenza (doppia sicura): se esiste già per questo periodo, interrompo.
    const exists = costi.some(
      x => x.categoria === 'stipendi' && x.dipendenteId === c.id && x.periodo === targetPeriodo
    );
    if (exists) {
      latest = costi.find(
        x => x.categoria === 'stipendi' && x.dipendenteId === c.id && x.periodo === targetPeriodo
      )!;
      continue;
    }

    const meseLabel = meseItaliano(targetPeriodo);
    const costo: CostoGenerale = {
      id: randomUUID(),
      categoria: 'stipendi',
      fornitore: `${c.nome} ${c.cognome}`.trim(),
      descrizione: `Busta paga ${meseLabel}`,
      data: targetData,
      // dataScadenza = giorno di auto-gen: il record compare immediatamente
      // nel widget scadenze e resta visibile finché l'admin non lo marca pagato.
      dataScadenza: targetData,
      importo: c.stipendioMensile,
      pagato: false,
      dipendenteId: c.id,
      periodo: targetPeriodo,
    };
    await costiGeneraliStorage.create(costo);
    costi.push(costo);
    latest = costo;
    created++;
  }

  return created;
}

/**
 * Esegue un ciclo di auto-generazione per tutti i dipendenti attivi.
 * Da chiamare all'avvio del server e poi periodicamente via schedulePayrollAutoGen.
 */
export async function runPayrollAutoGen(): Promise<{ totalCreated: number }> {
  const dipendenti = await dipendentiStorage.readAll();
  let totalCreated = 0;
  for (const c of dipendenti) {
    try {
      totalCreated += await processDipendente(c);
    } catch (err) {
      logger.error('Auto-gen payroll failed per dipendente', { err, dipendenteId: c.id });
    }
  }
  if (totalCreated > 0) {
    logger.info('Auto-generazione buste paga completata', { totalCreated });
  }
  return { totalCreated };
}

/**
 * Bootstrap: crea la prima busta paga per un dipendente se non ne ha ancora
 * nessuna. Da chiamare quando un Dipendente viene creato/aggiornato e la
 * sua configurazione finale è attiva + dipendente + stipendio valorizzato.
 *
 * Il record bootstrap è per il mese corrente, con data = oggi (diventa
 * l'anchor day che il cron userà per le generazioni ricorrenti).
 * Idempotente: se esiste già una qualunque busta paga per questo
 * dipendente, non fa nulla.
 */
export async function ensurePayrollBootstrap(dipendenteId: string): Promise<CostoGenerale | null> {
  const c = await dipendentiStorage.findById(dipendenteId);
  if (!c) return null;
  if (!c.active) return null;
  if (typeof c.stipendioMensile !== 'number' || c.stipendioMensile <= 0) return null;

  const costi = await costiGeneraliStorage.readAll();
  const hasPregressa = costi.some(
    x => x.categoria === 'stipendi' && x.dipendenteId === c.id
  );
  if (hasPregressa) return null;

  const today = new Date();
  const periodo = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
  const todayStr = today.toISOString().slice(0, 10);
  const meseLabel = meseItaliano(periodo);
  const costo: CostoGenerale = {
    id: randomUUID(),
    categoria: 'stipendi',
    fornitore: `${c.nome} ${c.cognome}`.trim(),
    descrizione: `Busta paga ${meseLabel}`,
    data: todayStr,
    dataScadenza: todayStr,
    importo: c.stipendioMensile,
    pagato: false,
    dipendenteId: c.id,
    periodo,
  };
  await costiGeneraliStorage.create(costo);
  logger.info('Bootstrap busta paga dipendente', { dipendenteId: c.id, periodo });
  return costo;
}

/**
 * Schedula l'auto-generazione periodica. Esegue immediatamente all'avvio
 * (catch-up) e poi ogni `intervalHours` ore. Interval unref-ato per non
 * tenere vivo il process.
 */
export function schedulePayrollAutoGen(intervalHours = 24): NodeJS.Timeout {
  const ms = intervalHours * 60 * 60 * 1000;
  return setInterval(() => {
    runPayrollAutoGen().catch((err) => logger.error('Auto-gen payroll failed', { err }));
  }, ms).unref();
}
