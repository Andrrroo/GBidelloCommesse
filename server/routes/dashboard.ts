import { Router } from 'express';
import { fattureIngressoStorage, fattureEmesseStorage, fattureConsulentiStorage, costiViviStorage, costiGeneraliStorage, projectResourcesStorage, dipendentiStorage, projectsStorage } from '../storage.js';
import { logger } from '../lib/logger.js';

export const dashboardRouter = Router();

dashboardRouter.get('/api/pagamenti-collaboratori-pendenti', async (req, res) => {
  try {
    const isAdmin = req.session?.user?.role === 'amministratore';
    const [resources, collaboratori, projects] = await Promise.all([
      projectResourcesStorage.readAll(),
      dipendentiStorage.readAll(),
      projectsStorage.readAll(),
    ]);

    const pendenti = resources
      .filter(r => (r.oreLavorate || 0) > (r.orePagate || 0))
      .map(r => {
        const oreDaPagare = (r.oreLavorate || 0) - (r.orePagate || 0);
        const collab = r.dipendenteId ? collaboratori.find(c => c.id === r.dipendenteId) : null;
        const project = projects.find(p => p.id === r.projectId);
        const costoOrario = collab?.costoOrario ?? r.costoOrario ?? 0;
        const importoDaPagare = oreDaPagare * costoOrario;
        const base = {
          id: r.id,
          dipendenteId: r.dipendenteId,
          collaboratoreNome: collab ? `${collab.nome} ${collab.cognome}` : r.userName,
          projectId: r.projectId,
          projectCode: project?.code || '',
          projectClient: project?.client || '',
          role: r.role,
          oreLavorate: r.oreLavorate || 0,
          orePagate: r.orePagate || 0,
          oreDaPagare,
        };
        // Solo admin vede gli importi economici
        return isAdmin ? { ...base, costoOrario, importoDaPagare } : base;
      })
      .sort((a, b) => {
        // Se admin, ordina per importo; altrimenti per ore da pagare
        if (isAdmin && 'importoDaPagare' in a && 'importoDaPagare' in b) {
          return (b as any).importoDaPagare - (a as any).importoDaPagare;
        }
        return b.oreDaPagare - a.oreDaPagare;
      });

    res.json(pendenti);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch pagamenti pendenti' }); }
});

dashboardRouter.get('/api/fatture-in-scadenza', async (req, res) => {
  try {
    const isAdmin = req.session?.user?.role === 'amministratore';
    const oggi = new Date();
    const tra30giorni = new Date();
    tra30giorni.setDate(oggi.getDate() + 30);

    const fattureIngresso = await fattureIngressoStorage.readAll();
    const fattureIngressoInScadenza = fattureIngresso
      .filter(f => !f.pagata && new Date(f.dataScadenzaPagamento) <= tra30giorni)
      .map(f => ({ ...f, tipo: 'ingresso' as const }));

    const fattureConsulenti = await fattureConsulentiStorage.readAll();
    const fattureConsulentiInScadenza = fattureConsulenti
      .filter(f => !f.pagata && new Date(f.dataScadenzaPagamento) <= tra30giorni)
      .map(f => ({ ...f, tipo: 'consulente' as const }));

    // Fatture emesse in scadenza: visibili a tutti (il collaboratore deve
    // sapere che una fattura a un cliente è in scadenza), ma per i non-admin
    // omettiamo l'importo (imponibile) — stesso approccio di /api/fatture-emesse.
    const fattureEmesseInScadenza = (await fattureEmesseStorage.readAll())
      .filter(f => !f.incassata && new Date(f.dataScadenzaPagamento) <= tra30giorni)
      .map(f => {
        if (isAdmin) return { ...f, tipo: 'emessa' as const };
        const { importo, ...rest } = f;
        return { ...rest, tipo: 'emessa' as const };
      });

    const costiGenerali = await costiGeneraliStorage.readAll();
    const costiGeneraliInScadenza = costiGenerali
      // Stipendi esclusi per i non-admin (payroll privato).
      .filter(c => !c.pagato && c.dataScadenza && new Date(c.dataScadenza) <= tra30giorni)
      .filter(c => isAdmin || c.categoria !== 'stipendi')
      .map(c => ({ ...c, tipo: 'costo_generale' as const }));

    const tutteLeScadenze = [
      ...fattureIngressoInScadenza,
      ...fattureConsulentiInScadenza,
      ...fattureEmesseInScadenza,
      ...costiGeneraliInScadenza
    ].sort((a, b) => {
      const dataA = 'dataScadenzaPagamento' in a ? a.dataScadenzaPagamento : a.dataScadenza;
      const dataB = 'dataScadenzaPagamento' in b ? b.dataScadenzaPagamento : b.dataScadenza;
      return new Date(dataA!).getTime() - new Date(dataB!).getTime();
    });

    res.json(tutteLeScadenze);
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to fetch fatture in scadenza' }); }
});

dashboardRouter.get('/api/cash-flow', async (req, res) => {
  try {
    const fattureEmesse = await fattureEmesseStorage.readAll();
    const totaleEmesso = fattureEmesse.reduce((acc, f) => acc + f.importo, 0);
    const totaleIncassato = fattureEmesse.filter(f => f.incassata).reduce((acc, f) => acc + f.importo, 0);
    const totaleDaIncassare = totaleEmesso - totaleIncassato;

    const fattureIngresso = await fattureIngressoStorage.readAll();
    const totaleFattureIngresso = fattureIngresso.reduce((acc, f) => acc + f.importo, 0) / 100; // importi salvati in centesimi
    const totaleFattureIngressoPagate = fattureIngresso.filter(f => f.pagata).reduce((acc, f) => acc + f.importo, 0) / 100;
    const totaleFattureIngressoDaPagare = totaleFattureIngresso - totaleFattureIngressoPagate;

    const fattureConsulenti = await fattureConsulentiStorage.readAll();
    const totaleFattureConsulenti = fattureConsulenti.reduce((acc, f) => acc + f.importo, 0);
    const totaleFattureConsulentiPagate = fattureConsulenti.filter(f => f.pagata).reduce((acc, f) => acc + f.importo, 0);
    const totaleFattureConsulentiDaPagare = totaleFattureConsulenti - totaleFattureConsulentiPagate;

    const costiVivi = await costiViviStorage.readAll();
    const totaleCostiVivi = costiVivi.reduce((acc, c) => acc + c.importo, 0) / 100; // importi salvati in centesimi

    const costiGenerali = await costiGeneraliStorage.readAll();
    const totaleCostiGenerali = costiGenerali.reduce((acc, c) => acc + c.importo, 0);
    const totaleCostiGeneraliPagati = costiGenerali.filter(c => c.pagato).reduce((acc, c) => acc + c.importo, 0);
    const totaleCostiGeneraliDaPagare = totaleCostiGenerali - totaleCostiGeneraliPagati;

    const totaleUscite = totaleFattureIngresso + totaleFattureConsulenti + totaleCostiVivi + totaleCostiGenerali;
    const totaleUscitePagate = totaleFattureIngressoPagate + totaleFattureConsulentiPagate + totaleCostiVivi + totaleCostiGeneraliPagati;
    const totaleUsciteDaPagare = totaleFattureIngressoDaPagare + totaleFattureConsulentiDaPagare + totaleCostiGeneraliDaPagare;

    res.json({
      entrate: { totaleEmesso, totaleIncassato, totaleDaIncassare, fatture: fattureEmesse.length },
      uscite: {
        totale: totaleUscite, pagate: totaleUscitePagate, daPagare: totaleUsciteDaPagare,
        dettaglio: {
          fattureIngresso: { totale: totaleFattureIngresso, pagate: totaleFattureIngressoPagate, daPagare: totaleFattureIngressoDaPagare },
          fattureConsulenti: { totale: totaleFattureConsulenti, pagate: totaleFattureConsulentiPagate, daPagare: totaleFattureConsulentiDaPagare },
          costiVivi: { totale: totaleCostiVivi },
          costiGenerali: { totale: totaleCostiGenerali, pagati: totaleCostiGeneraliPagati, daPagare: totaleCostiGeneraliDaPagare }
        }
      },
      saldo: totaleIncassato - totaleUscitePagate,
      saldoPrevisionale: totaleEmesso - totaleUscite
    });
  } catch (error) { logger.error('Request failed', { err: error, path: req.path, method: req.method }); res.status(500).json({ error: 'Failed to calculate cash flow' }); }
});
