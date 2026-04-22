import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'crypto';
import { createEvents, type EventAttributes } from 'ics';
import {
  usersStorage,
  projectsStorage,
  scadenzeStorage,
  comunicazioniStorage,
  fattureIngressoStorage,
  fattureEmesseStorage,
  fattureConsulentiStorage,
  costiGeneraliStorage,
} from '../storage.js';
import { logger } from '../lib/logger.js';

export const calendarRouter = Router();

// Feed iCal non contiene importi: né nei title né nelle description. Il
// calendar è uno "strumento di promemoria", chi vuole il numero apre la webapp.
// Eventi più vecchi di N giorni esclusi per contenere la dimensione del feed.
const CALENDAR_HISTORY_DAYS = 90;

function parseDateToTuple(dateStr: string): [number, number, number] | null {
  // Le date nello storage sono ISO (YYYY-MM-DD o con time). Estraiamo la
  // parte data e restituiamo [Y, M, D] per ics (all-day event).
  if (!dateStr) return null;
  const onlyDate = dateStr.split('T')[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(onlyDate);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

function isRecentEnough(dateStr: string, cutoff: Date): boolean {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d >= cutoff;
}

function joinDescription(...parts: (string | undefined)[]): string {
  return parts.filter(p => p && p.trim().length > 0).join('\n\n');
}

async function buildEvents(isAdmin: boolean): Promise<EventAttributes[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CALENDAR_HISTORY_DAYS);

  const [
    projects,
    scadenze,
    comunicazioni,
    fattureIngresso,
    fattureEmesse,
    fattureConsulenti,
    costiGenerali,
  ] = await Promise.all([
    projectsStorage.readAll(),
    scadenzeStorage.readAll(),
    comunicazioniStorage.readAll(),
    fattureIngressoStorage.readAll(),
    fattureEmesseStorage.readAll(),
    fattureConsulentiStorage.readAll(),
    costiGeneraliStorage.readAll(),
  ]);

  const projectCodeById = new Map(projects.map(p => [p.id, p.code]));
  const events: EventAttributes[] = [];

  const pushEvent = (
    uidPrefix: string,
    id: string,
    dateStr: string,
    title: string,
    description: string,
    priorityHigh = false,
  ) => {
    if (!isRecentEnough(dateStr, cutoff)) return;
    const start = parseDateToTuple(dateStr);
    if (!start) return;
    events.push({
      uid: `${uidPrefix}-${id}@gbidello-commesse`,
      start,
      duration: { days: 1 },
      title,
      description: description || undefined,
      status: 'CONFIRMED',
      busyStatus: 'FREE',
      ...(priorityHigh ? { priority: 1 } : {}),
    });
  };

  // Scadenzario
  for (const s of scadenze) {
    if (s.completata) continue;
    const code = projectCodeById.get(s.projectId) ?? '';
    const tipoTag = s.tipo ? `[${s.tipo.toUpperCase()}] ` : '';
    const title = `${tipoTag}${s.titolo}${code ? ` · ${code}` : ''}`;
    pushEvent(
      'scadenza',
      s.id,
      s.data,
      title,
      joinDescription(s.descrizione, s.note),
      s.priorita === 'alta',
    );
  }

  // Comunicazioni (email/telefono/riunione/verbale/altro) — tutti gli eventi
  // con data, anche passati, come archivio storico nel calendar.
  for (const c of comunicazioni) {
    const code = projectCodeById.get(c.projectId) ?? '';
    const tipoTag = c.tipo ? `[${c.tipo.toUpperCase()}] ` : '';
    const title = `${tipoTag}${c.oggetto}${code ? ` · ${code}` : ''}`;
    const partecipanti = c.partecipanti ? `Partecipanti: ${c.partecipanti}` : undefined;
    pushEvent(
      'comunicazione',
      c.id,
      c.data,
      title,
      joinDescription(c.descrizione, partecipanti, c.note),
    );
  }

  // Fatture ingresso non pagate
  for (const f of fattureIngresso) {
    if (f.pagata) continue;
    const code = projectCodeById.get(f.projectId) ?? '';
    const title = `Fattura ingresso #${f.numeroFattura} · ${f.fornitore}${code ? ` · ${code}` : ''}`;
    pushEvent('fattura-ingresso', f.id, f.dataScadenzaPagamento, title, f.descrizione || '');
  }

  // Fatture emesse non incassate — nessun importo nel calendar
  for (const f of fattureEmesse) {
    if (f.incassata) continue;
    const code = projectCodeById.get(f.projectId) ?? '';
    const title = `Fattura emessa #${f.numeroFattura} · ${f.cliente}${code ? ` · ${code}` : ''}`;
    pushEvent('fattura-emessa', f.id, f.dataScadenzaPagamento, title, f.descrizione || '');
  }

  // Fatture consulenti non pagate
  for (const f of fattureConsulenti) {
    if (f.pagata) continue;
    const code = projectCodeById.get(f.projectId) ?? '';
    const title = `Consulente #${f.numeroFattura} · ${f.consulente}${code ? ` · ${code}` : ''}`;
    pushEvent('fattura-consulente', f.id, f.dataScadenzaPagamento, title, f.descrizione || '');
  }

  // Costi generali con dataScadenza non pagati. Gli stipendi sono
  // informazione di payroll: niente feed per i non-admin.
  for (const c of costiGenerali) {
    if (c.pagato || !c.dataScadenza) continue;
    if (!isAdmin && c.categoria === 'stipendi') continue;
    const title = `Costo generale · ${c.categoria} · ${c.fornitore}`;
    pushEvent('costo-generale', c.id, c.dataScadenza, title, c.descrizione || '');
  }

  return events;
}

function buildFeedUrl(req: Request, token: string): string {
  // Usa host dalla richiesta — funziona in dev (localhost:5173) e prod.
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = req.headers.host;
  return `${proto}://${host}/api/calendar/feed.ics?token=${token}`;
}

// Endpoint pubblico (NON protetto da requireAuth — la whitelist è in
// routes/index.ts). Valida il token manualmente confrontandolo con
// users.calendarToken. Risponde 404 su token invalido/assente così un
// attaccante non può distinguere l'esistenza dell'endpoint da un token
// sbagliato.
calendarRouter.get('/api/calendar/feed.ics', async (req, res) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token || token.length < 10) {
      return res.status(404).end();
    }
    const users = await usersStorage.readAll();
    const user = users.find(u => u.calendarToken === token);
    if (!user) {
      return res.status(404).end();
    }

    const events = await buildEvents(user.role === 'amministratore');
    const { error, value } = createEvents(events, {
      productId: 'gbidello-commesse/ics',
      calName: `GB Commesse — ${user.nome}`,
    });
    if (error || !value) {
      logger.error('Calendar feed generation failed', { err: error, userId: user.id });
      return res.status(500).end();
    }

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.setHeader('Content-Disposition', 'inline; filename="gbidello-commesse.ics"');
    res.send(value);
  } catch (error) {
    logger.error('Calendar feed error', { err: error });
    res.status(500).end();
  }
});

// Ritorna il token dell'utente di sessione, creandolo se non esiste
calendarRouter.get('/api/calendar/token', async (req, res) => {
  try {
    const sessionUser = req.session?.user;
    if (!sessionUser) return res.status(401).json({ error: 'Non autenticato' });

    const stored = await usersStorage.findById(sessionUser.id);
    if (!stored) return res.status(404).json({ error: 'Utente non trovato' });

    let token = stored.calendarToken;
    if (!token) {
      token = randomBytes(24).toString('base64url');
      await usersStorage.update(stored.id, { calendarToken: token });
    }
    res.json({ token, feedUrl: buildFeedUrl(req, token) });
  } catch (error) {
    logger.error('Calendar token fetch error', { err: error });
    res.status(500).json({ error: 'Failed to fetch calendar token' });
  }
});

// Rigenera il token (il precedente smette di funzionare immediatamente)
calendarRouter.post('/api/calendar/token/regenerate', async (req, res) => {
  try {
    const sessionUser = req.session?.user;
    if (!sessionUser) return res.status(401).json({ error: 'Non autenticato' });

    const stored = await usersStorage.findById(sessionUser.id);
    if (!stored) return res.status(404).json({ error: 'Utente non trovato' });

    const token = randomBytes(24).toString('base64url');
    await usersStorage.update(stored.id, { calendarToken: token });
    res.json({ token, feedUrl: buildFeedUrl(req, token) });
  } catch (error) {
    logger.error('Calendar token regenerate error', { err: error });
    res.status(500).json({ error: 'Failed to regenerate calendar token' });
  }
});
