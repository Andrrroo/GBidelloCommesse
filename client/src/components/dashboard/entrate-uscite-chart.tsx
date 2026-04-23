import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/financial-utils";
import { EntrateUsciteBreakdown, type PieDatum } from "@/components/shared/entrate-uscite-breakdown";
import { YearFilter, ALL_YEARS, getYearFromISO, collectYears } from "@/components/shared/year-filter";
import type { FatturaEmessa, FatturaIngresso, FatturaConsulente, CostoGenerale } from "@shared/schema";

interface Props {
  isAdmin?: boolean;
}

// Raggruppa e somma gli importi per una chiave (cliente/fornitore)
function aggregate<T>(items: T[], keyFn: (item: T) => string, valueFn: (item: T) => number): PieDatum[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item) || "Non specificato";
    map.set(key, (map.get(key) || 0) + valueFn(item));
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .filter(x => x.value > 0);
}

export default function EntrateUsciteChart({ isAdmin = false }: Props) {
  const [selectedYear, setSelectedYear] = useState<string>(ALL_YEARS);

  const { data: fattureEmesse = [] } = useQuery<FatturaEmessa[]>({
    queryKey: ["/api/fatture-emesse"],
    queryFn: async () => (await apiRequest("GET", "/api/fatture-emesse")).json(),
    enabled: isAdmin,
  });

  const { data: fattureIngresso = [] } = useQuery<FatturaIngresso[]>({
    queryKey: ["/api/fatture-ingresso"],
    queryFn: async () => (await apiRequest("GET", "/api/fatture-ingresso")).json(),
    enabled: isAdmin,
  });

  const { data: fattureConsulenti = [] } = useQuery<FatturaConsulente[]>({
    queryKey: ["/api/fatture-consulenti"],
    queryFn: async () => (await apiRequest("GET", "/api/fatture-consulenti")).json(),
    enabled: isAdmin,
  });

  const { data: costiGenerali = [] } = useQuery<CostoGenerale[]>({
    queryKey: ["/api/costi-generali"],
    queryFn: async () => (await apiRequest("GET", "/api/costi-generali")).json(),
    enabled: isAdmin,
  });

  // Anni disponibili sommando tutte le fonti, poi filtro per l'anno selezionato
  const availableYears = collectYears<any>([
    [fattureEmesse, 'dataEmissione'],
    [fattureIngresso, 'dataEmissione'],
    [fattureConsulenti, 'dataEmissione'],
    [costiGenerali, 'data'],
  ]);
  const filterYear = selectedYear === ALL_YEARS ? null : Number(selectedYear);
  const byYear = <T, K extends keyof T>(arr: T[], f: K) =>
    filterYear === null ? arr : arr.filter(x => getYearFromISO(x[f] as unknown as string) === filterYear);
  const fattureEmesseF = byYear(fattureEmesse, 'dataEmissione');
  const fattureIngressoF = byYear(fattureIngresso, 'dataEmissione');
  const fattureConsulentiF = byYear(fattureConsulenti, 'dataEmissione');
  const costiGeneraliF = byYear(costiGenerali, 'data');

  // Entrate: fatture emesse raggruppate per cliente (importo in euro)
  const entratePerCliente = aggregate(fattureEmesseF, f => f.cliente, f => f.importo);
  const totaleEntrate = entratePerCliente.reduce((s, x) => s + x.value, 0);

  // Uscite: fatture ingresso (centesimi / 100) + consulenti (euro) + costi generali (euro).
  // Gli stipendi sono uscite "per dipendente", non "per fornitore": vengono esclusi
  // dalla pie "Uscite per Fornitore" ma restano nel totale uscite aggregato.
  const mapFornitori = new Map<string, number>();
  let totaleStipendi = 0;
  for (const f of fattureIngressoF) {
    const key = f.fornitore || "Non specificato";
    mapFornitori.set(key, (mapFornitori.get(key) || 0) + (f.importo / 100));
  }
  if (isAdmin) {
    for (const f of fattureConsulentiF) {
      const key = f.consulente || "Non specificato";
      mapFornitori.set(key, (mapFornitori.get(key) || 0) + f.importo);
    }
    for (const c of costiGeneraliF) {
      if (c.categoria === "stipendi") {
        totaleStipendi += c.importo;
        continue;
      }
      const key = c.fornitore || "Non specificato";
      mapFornitori.set(key, (mapFornitori.get(key) || 0) + c.importo);
    }
  }
  const uscitePerFornitore: PieDatum[] = [];
  mapFornitori.forEach((value, name) => {
    if (value > 0) uscitePerFornitore.push({ name, value });
  });
  // Totale uscite include anche gli stipendi (per accuratezza del saldo), ma
  // il grafico a torta sopra riflette solo i fornitori non-stipendiali.
  const totaleUscite = uscitePerFornitore.reduce((s, x) => s + x.value, 0) + totaleStipendi;

  const saldo = totaleEntrate - totaleUscite;
  const saldoPositivo = saldo >= 0;

  // Guard difensivo: il widget è gated in dashboard.tsx per i non-admin.
  if (!isAdmin) return null;

  const yearLabel = selectedYear === ALL_YEARS ? "Tutti gli anni" : selectedYear;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Entrate vs Uscite <span className="text-sm font-normal text-gray-500">— {yearLabel}</span>
            </CardTitle>
            <CardDescription>
              Ripartizione percentuale per cliente e fornitore
            </CardDescription>
          </div>
          <YearFilter value={selectedYear} onChange={setSelectedYear} years={availableYears} data-testid="select-entrate-uscite-year" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-center">
            <p className="text-xs text-green-700 flex items-center justify-center gap-1">
              <TrendingUp className="h-3 w-3" /> Entrate
            </p>
            <p className="font-bold text-green-800">{formatCurrency(totaleEntrate)}</p>
          </div>
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-center">
            <p className="text-xs text-red-700 flex items-center justify-center gap-1">
              <TrendingDown className="h-3 w-3" /> Uscite
            </p>
            <p className="font-bold text-red-800">{formatCurrency(totaleUscite)}</p>
          </div>
          <div className={`p-3 rounded-lg border text-center ${saldoPositivo ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
            <p className={`text-xs ${saldoPositivo ? 'text-blue-700' : 'text-orange-700'}`}>Saldo</p>
            <p className={`font-bold ${saldoPositivo ? 'text-blue-800' : 'text-red-600'}`}>
              {formatCurrency(saldo)}
            </p>
          </div>
        </div>

        <EntrateUsciteBreakdown
          entrate={entratePerCliente}
          uscite={uscitePerFornitore}
          emptyEntrateMessage="Nessuna fattura emessa"
          emptyUsciteMessage="Nessuna fattura ingresso"
        />
      </CardContent>
    </Card>
  );
}
