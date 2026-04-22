import { randomUUID } from 'crypto';
import { costiGeneraliStorage } from '../storage.js';
import type { CostoGenerale } from '@shared/schema';
import { logger } from './logger.js';

// Auto-generazione ricorrente per costi "abbonamento" (e in generale per
// qualunque CostoGenerale con `ricorrenzaId` + `periodicita` valorizzati).
//
// Regola: prima occorrenza creata manualmente in Costi Generali con categoria
// "abbonamento" e una periodicità. Il POST del costo assegna un `ricorrenzaId`
// (UUID) che lega tutte le occorrenze successive. Il cron giornaliero, per
// ogni gruppo, prende il record più recente e - se la data-di-rigenerazione
// (latest.data + mesi(periodicita)) è oggi o passata - crea un nuovo record
// con stesso fornitore/descrizione/importo/categoria/periodicita/ricorrenzaId
// e data+dataScadenza = next-date.
//
// Stop: l'utente può interrompere rimuovendo la periodicità dall'ultimo
// record (o eliminandolo). Senza periodicità sull'ultimo, nessuna nuova
// occorrenza viene creata.
//
// Catch-up con cap 12 per evitare avalanche su dati molto vecchi.

const PERIODICITA_MESI: Record<NonNullable<CostoGenerale['periodicita']>, number> = {
  mensile: 1,
  bimestrale: 2,
  trimestrale: 3,
  semestrale: 6,
  annuale: 12,
};

const MAX_CATCHUP_PER_RICORRENZA = 12;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// Somma `mesi` mesi a una data ISO (YYYY-MM-DD) e clampa al last-day-of-month
// se il giorno-ancora eccede il numero di giorni del mese target (es. anchor
// day 31 + gennaio → 28/29 febbraio).
function addMonthsClamped(iso: string, mesi: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const targetMonthIndex0 = m - 1 + mesi; // 0-based, può eccedere 11
  const targetY = y + Math.floor(targetMonthIndex0 / 12);
  const targetM = ((targetMonthIndex0 % 12) + 12) % 12 + 1; // 1-based
  const lastDayTarget = new Date(Date.UTC(targetY, targetM, 0)).getUTCDate();
  const day = Math.min(d, lastDayTarget);
  const dt = new Date(Date.UTC(targetY, targetM - 1, day));
  return dt.toISOString().slice(0, 10);
}

// Raggruppa i costi per ricorrenzaId e ritorna il record più recente per
// ogni gruppo (per data desc, tie-break sull'id per stabilità).
function latestPerRicorrenza(costi: CostoGenerale[]): Map<string, CostoGenerale> {
  const latest = new Map<string, CostoGenerale>();
  for (const c of costi) {
    if (!c.ricorrenzaId) continue;
    const cur = latest.get(c.ricorrenzaId);
    if (!cur) {
      latest.set(c.ricorrenzaId, c);
      continue;
    }
    if (c.data > cur.data || (c.data === cur.data && c.id > cur.id)) {
      latest.set(c.ricorrenzaId, c);
    }
  }
  return latest;
}

async function processRicorrenza(latestStart: CostoGenerale, allCosti: CostoGenerale[]): Promise<number> {
  if (!latestStart.ricorrenzaId) return 0;
  if (!latestStart.periodicita) return 0; // ricorrenza interrotta

  const today = todayIsoDate();
  let latest = latestStart;
  let created = 0;

  for (let i = 0; i < MAX_CATCHUP_PER_RICORRENZA; i++) {
    if (!latest.periodicita) break;
    const mesi = PERIODICITA_MESI[latest.periodicita];
    const nextData = addMonthsClamped(latest.data, mesi);
    if (nextData > today) break; // non ancora maturato

    // Idempotenza: se esiste già un record con stesso ricorrenzaId e data
    // == nextData, lo prendo come nuovo "latest" e continuo.
    const existing = allCosti.find(
      x => x.ricorrenzaId === latest.ricorrenzaId && x.data === nextData
    );
    if (existing) {
      latest = existing;
      continue;
    }

    const costo: CostoGenerale = {
      id: randomUUID(),
      categoria: latest.categoria,
      fornitore: latest.fornitore,
      descrizione: latest.descrizione,
      data: nextData,
      dataScadenza: nextData,
      importo: latest.importo,
      pagato: false,
      ricorrenzaId: latest.ricorrenzaId,
      periodicita: latest.periodicita,
      // dipendenteId/periodo non applicabili agli abbonamenti
    };
    await costiGeneraliStorage.create(costo);
    allCosti.push(costo);
    latest = costo;
    created++;
  }

  return created;
}

export async function runSubscriptionAutoGen(): Promise<{ totalCreated: number }> {
  const costi = await costiGeneraliStorage.readAll();
  const latest = latestPerRicorrenza(costi);
  let totalCreated = 0;
  for (const [ricorrenzaId, record] of Array.from(latest.entries())) {
    try {
      totalCreated += await processRicorrenza(record, costi);
    } catch (err) {
      logger.error('Auto-gen subscription failed per ricorrenza', { err, ricorrenzaId });
    }
  }
  if (totalCreated > 0) {
    logger.info('Auto-generazione abbonamenti completata', { totalCreated });
  }
  return { totalCreated };
}

export function scheduleSubscriptionAutoGen(intervalHours = 24): NodeJS.Timeout {
  const ms = intervalHours * 60 * 60 * 1000;
  return setInterval(() => {
    runSubscriptionAutoGen().catch((err) => logger.error('Auto-gen subscription failed', { err }));
  }, ms).unref();
}
