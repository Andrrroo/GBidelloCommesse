import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Project } from "@shared/schema";
import { useState } from "react";
import { TrendingDown, TrendingUp, AlertCircle, AlertTriangle, DollarSign, Receipt, Users, CreditCard, Package } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatCurrencyFromCents } from "@/lib/financial-utils";
import { YearFilter, ALL_YEARS, getYearFromISO } from "@/components/shared/year-filter";

interface FatturaIngresso {
  id: string;
  projectId: string;
  numeroFattura: string;
  fornitore: string;
  dataEmissione: string;
  dataScadenzaPagamento: string;
  importo: number;
  categoria: 'materiali' | 'collaborazione_esterna' | 'costo_vivo' | 'altro';
  descrizione: string;
  pagata: boolean;
  dataPagamento?: string;
  note?: string;
}

interface CostoVivo {
  id: string;
  projectId: string;
  tipologia: 'viaggio' | 'parcheggio' | 'carburante' | 'alloggio' | 'vitto' | 'altro';
  data: string;
  importo: number;
  descrizione: string;
  luogo?: string;
  km?: number;
  destinazione?: string;
  note?: string;
}

interface ProjectResourceLite {
  id: string;
  projectId: string;
  userName: string;
  oreLavorate: number;
  orePagate?: number;
  costoOrario: number; // in centesimi
}

interface CentrodiCosto {
  project: Project;
  fattureIngresso: FatturaIngresso[];
  costiVivi: CostoVivo[];
  resources: ProjectResourceLite[];
  totaleSpeso: number;
  budgetIniziale: number | null;
  percentualeUtilizzata: number;
  materiali: number;
  collaborazioniEsterne: number;
  costiDiretti: number;
  riservaHumana: number;
}

export default function CentroCostoDashboard() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>(ALL_YEARS);

  // Fetch all data
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: fattureIngresso = [] } = useQuery<FatturaIngresso[]>({
    queryKey: ["/api/fatture-ingresso"],
  });

  const { data: costiVivi = [] } = useQuery<CostoVivo[]>({
    queryKey: ["/api/costi-vivi"],
  });

  const { data: resources = [] } = useQuery<ProjectResourceLite[]>({
    queryKey: ["/api/project-resources"],
  });

  // Anni disponibili dai dati con campi temporali (fatture/costi vivi) — risorse
  // non hanno data, quindi quando l'utente filtra per anno le ore lavorate non
  // rientrano nel conteggio per quell'anno (si conta solo spesa fatturata).
  const yearSet = new Set<number>();
  for (const f of fattureIngresso) { const y = getYearFromISO(f.dataEmissione); if (y) yearSet.add(y); }
  for (const c of costiVivi) { const y = getYearFromISO(c.data); if (y) yearSet.add(y); }
  const availableYears = Array.from(yearSet).filter(y => y >= 2025).sort((a, b) => b - a);

  const filterYear = selectedYear === ALL_YEARS ? null : Number(selectedYear);
  const fattureIngressoF = filterYear === null ? fattureIngresso : fattureIngresso.filter(f => getYearFromISO(f.dataEmissione) === filterYear);
  const costiViviF = filterYear === null ? costiVivi : costiVivi.filter(c => getYearFromISO(c.data) === filterYear);
  // Resources: non hanno data di competenza → quando filtro per anno, le escludo
  // dal calcolo "riservaHumana" (altrimenti darei ore su un anno in cui non sono state fatte).
  const resourcesF = filterYear === null ? resources : [];

  // Calculate cost centers
  // Regola di selezione iniziale:
  //   - 'all'           => solo commesse in corso (default)
  //   - 'all-inclusive' => tutte le commesse (incluse conclusa/sospesa)
  //   - <id commessa>   => quella commessa specifica, anche se conclusa
  const centriCosto: CentrodiCosto[] = projects
    .filter(p => {
      if (selectedProjectId === 'all') return p.status === 'in_corso';
      if (selectedProjectId === 'all-inclusive') return true;
      return true; // un id specifico: lascio passare, il secondo filter più sotto seleziona
    })
    .map(project => {
      const fattureProgetto = fattureIngressoF.filter(f => f.projectId === project.id);
      const costiViviProgetto = costiViviF.filter(c => c.projectId === project.id);
      const resourcesProgetto = resourcesF.filter(r => r.projectId === project.id);

      // Calcola costi per categoria (tutti in centesimi per coerenza con le barre progress)
      const materiali = fattureProgetto
        .filter(f => f.categoria === 'materiali')
        .reduce((sum, f) => sum + f.importo, 0);

      const collaborazioniEsterne = fattureProgetto
        .filter(f => f.categoria === 'collaborazione_esterna')
        .reduce((sum, f) => sum + f.importo, 0);

      // Fix bug: usa costiViviProgetto (non costiVivi globale)
      const costiDiretti = costiViviProgetto.reduce((sum, c) => sum + c.importo, 0) +
        fattureProgetto
          .filter(f => f.categoria === 'costo_vivo')
          .reduce((sum, f) => sum + f.importo, 0);

      // Risorse Umane: usa ProjectResource (oreLavorate * costoOrario, gia' in centesimi)
      const riservaHumana = resourcesProgetto.reduce((sum, r) => sum + ((r.oreLavorate || 0) * (r.costoOrario || 0)), 0);

      const totaleSpeso = materiali + collaborazioniEsterne + costiDiretti + riservaHumana;
      const budgetIniziale = project.budget || null;
      const percentualeUtilizzata = budgetIniziale ? (totaleSpeso / budgetIniziale) * 100 : 0;

      return {
        project,
        fattureIngresso: fattureProgetto,
        costiVivi: costiViviProgetto,
        resources: resourcesProgetto,
        totaleSpeso,
        budgetIniziale,
        percentualeUtilizzata,
        materiali,
        collaborazioniEsterne,
        costiDiretti,
        riservaHumana,
      };
    })
    .filter(cc => selectedProjectId === 'all' || selectedProjectId === 'all-inclusive' || cc.project.id === selectedProjectId)
    .sort((a, b) => b.totaleSpeso - a.totaleSpeso);

  // Calculate overall statistics
  const totaleGeneraleSpeso = centriCosto.reduce((sum, cc) => sum + cc.totaleSpeso, 0);
  const totaleBudget = centriCosto.reduce((sum, cc) => sum + (cc.budgetIniziale || 0), 0);
  const totaleProgetti = centriCosto.length;
  const progettiOverBudget = centriCosto.filter(cc => cc.budgetIniziale && cc.totaleSpeso > cc.budgetIniziale).length;

  const totaleMateriali = centriCosto.reduce((sum, cc) => sum + cc.materiali, 0);
  const totaleCollaborazioni = centriCosto.reduce((sum, cc) => sum + cc.collaborazioniEsterne, 0);
  const totaleCostiDiretti = centriCosto.reduce((sum, cc) => sum + cc.costiDiretti, 0);
  const totaleRiservaHumana = centriCosto.reduce((sum, cc) => sum + cc.riservaHumana, 0);

  const formatCurrency = formatCurrencyFromCents;

  const yearLabel = selectedYear === ALL_YEARS ? "Tutti gli anni" : selectedYear;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Dashboard Centro di Costo <span className="text-sm font-normal text-gray-500">— {yearLabel}</span>
          </h2>
          <p className="text-sm text-gray-500">Monitoraggio completo costi e budget per commessa</p>
        </div>
        <div className="flex items-center gap-3">
          <YearFilter value={selectedYear} onChange={setSelectedYear} years={availableYears} data-testid="select-centro-costo-year" />
          <div className="w-80">
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger>
              <SelectValue placeholder="Filtra per commessa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le commesse attive</SelectItem>
              <SelectItem value="all-inclusive">Tutte le commesse (incluse concluse e sospese)</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.code} - {project.client}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          </div>
        </div>
      </div>

      {/* Overall Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Totale Speso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(totaleGeneraleSpeso)}</div>
            <p className="text-xs text-gray-500 mt-1">{totaleProgetti} commesse</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Receipt className="w-4 h-4" />
              Budget Totale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(totaleBudget)}</div>
            <p className="text-xs text-gray-500 mt-1">
              {totaleBudget > 0 ? `${((totaleGeneraleSpeso / totaleBudget) * 100).toFixed(1)}% utilizzato` : 'Non definito'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Commesse
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{totaleProgetti}</div>
            <p className="text-xs text-gray-500 mt-1">in monitoraggio</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Alert Budget
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{progettiOverBudget}</div>
            <p className="text-xs text-gray-500 mt-1">commesse oltre budget</p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Ripartizione Costi per Categoria</CardTitle>
          <CardDescription>Distribuzione complessiva delle spese</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium">Materiali</span>
                </div>
                <span className="text-sm font-bold text-blue-600">
                  {totaleGeneraleSpeso > 0 ? ((totaleMateriali / totaleGeneraleSpeso) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="text-lg font-semibold">{formatCurrency(totaleMateriali)}</div>
              <Progress value={(totaleMateriali / totaleGeneraleSpeso) * 100} className="h-2 bg-blue-100" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium">Collaborazioni</span>
                </div>
                <span className="text-sm font-bold text-purple-600">
                  {totaleGeneraleSpeso > 0 ? ((totaleCollaborazioni / totaleGeneraleSpeso) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="text-lg font-semibold">{formatCurrency(totaleCollaborazioni)}</div>
              <Progress value={(totaleCollaborazioni / totaleGeneraleSpeso) * 100} className="h-2 bg-purple-100" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium">Costi Diretti</span>
                </div>
                <span className="text-sm font-bold text-green-600">
                  {totaleGeneraleSpeso > 0 ? ((totaleCostiDiretti / totaleGeneraleSpeso) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="text-lg font-semibold">{formatCurrency(totaleCostiDiretti)}</div>
              <Progress value={(totaleCostiDiretti / totaleGeneraleSpeso) * 100} className="h-2 bg-green-100" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-orange-600" />
                  <span className="text-sm font-medium">Risorse Umane</span>
                </div>
                <span className="text-sm font-bold text-orange-600">
                  {totaleGeneraleSpeso > 0 ? ((totaleRiservaHumana / totaleGeneraleSpeso) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="text-lg font-semibold">{formatCurrency(totaleRiservaHumana)}</div>
              <Progress value={(totaleRiservaHumana / totaleGeneraleSpeso) * 100} className="h-2 bg-orange-100" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Projects List */}
      <Tabs defaultValue="active" className="w-full">
        <TabsList>
          <TabsTrigger value="active">Commesse</TabsTrigger>
          <TabsTrigger value="over-budget">Oltre Budget</TabsTrigger>
          <TabsTrigger value="near-budget">Vicine al Budget</TabsTrigger>
        </TabsList>

        {/* Active Projects Tab */}
        <TabsContent value="active" className="space-y-4 data-[state=active]:animate-fade-in">
          {centriCosto.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-500">Nessuna commessa da visualizzare</p>
              </CardContent>
            </Card>
          ) : (
            centriCosto.map((cc) => (
              <Card key={cc.project.id} className={cc.budgetIniziale && cc.totaleSpeso > cc.budgetIniziale ? 'border-red-300' : ''}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle>{cc.project.code} - {cc.project.client}</CardTitle>
                        {cc.budgetIniziale && cc.totaleSpeso > cc.budgetIniziale && (
                          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Oltre Budget
                          </span>
                        )}
                        {cc.budgetIniziale && cc.percentualeUtilizzata >= 80 && cc.percentualeUtilizzata <= 100 && (
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full inline-flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                            Vicino al Budget
                          </span>
                        )}
                      </div>
                      <CardDescription>{cc.project.object}</CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">{formatCurrency(cc.totaleSpeso)}</div>
                      {cc.budgetIniziale && (
                        <p className="text-sm text-gray-500">
                          su {formatCurrency(cc.budgetIniziale)} ({cc.percentualeUtilizzata.toFixed(1)}%)
                        </p>
                      )}
                    </div>
                  </div>
                  {cc.budgetIniziale && (
                    <div className="mt-3">
                      <Progress
                        value={Math.min(cc.percentualeUtilizzata, 100)}
                        className={`h-2 ${
                          cc.percentualeUtilizzata > 100
                            ? 'bg-red-100'
                            : cc.percentualeUtilizzata >= 80
                            ? 'bg-yellow-100'
                            : 'bg-green-100'
                        }`}
                      />
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Package className="w-4 h-4" />
                        <span>Materiali</span>
                      </div>
                      <p className="text-lg font-semibold text-blue-600">{formatCurrency(cc.materiali)}</p>
                      <p className="text-xs text-gray-500">{cc.fattureIngresso.filter(f => f.categoria === 'materiali').length} fatture</p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Users className="w-4 h-4" />
                        <span>Collaborazioni</span>
                      </div>
                      <p className="text-lg font-semibold text-purple-600">{formatCurrency(cc.collaborazioniEsterne)}</p>
                      <p className="text-xs text-gray-500">{cc.fattureIngresso.filter(f => f.categoria === 'collaborazione_esterna').length} fatture</p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <CreditCard className="w-4 h-4" />
                        <span>Costi Diretti</span>
                      </div>
                      <p className="text-lg font-semibold text-green-600">{formatCurrency(cc.costiDiretti)}</p>
                      <p className="text-xs text-gray-500">{cc.costiVivi.length} costi vivi</p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Users className="w-4 h-4" />
                        <span>Risorse Umane</span>
                      </div>
                      <p className="text-lg font-semibold text-orange-600">{formatCurrency(cc.riservaHumana)}</p>
                      <p className="text-xs text-gray-500">{cc.resources.length} risorse</p>
                    </div>
                  </div>

                  {cc.budgetIniziale && cc.totaleSpeso > cc.budgetIniziale && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-2 text-red-700">
                        <TrendingDown className="w-4 h-4" />
                        <span className="text-sm font-semibold">
                          Superamento budget di {formatCurrency(cc.totaleSpeso - cc.budgetIniziale)}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Over Budget Tab */}
        <TabsContent value="over-budget" className="space-y-4 data-[state=active]:animate-fade-in">
          {centriCosto.filter(cc => cc.budgetIniziale && cc.totaleSpeso > cc.budgetIniziale).length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-500">Nessuna commessa oltre budget</p>
              </CardContent>
            </Card>
          ) : (
            centriCosto
              .filter(cc => cc.budgetIniziale && cc.totaleSpeso > cc.budgetIniziale)
              .map((cc) => (
                <Card key={cc.project.id} className="border-red-300">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle>{cc.project.code} - {cc.project.client}</CardTitle>
                          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Oltre Budget
                          </span>
                        </div>
                        <CardDescription>{cc.project.object}</CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-red-600">{formatCurrency(cc.totaleSpeso)}</div>
                        <p className="text-sm text-gray-500">
                          su {formatCurrency(cc.budgetIniziale!)} ({cc.percentualeUtilizzata.toFixed(1)}%)
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-2 text-red-700">
                        <TrendingDown className="w-4 h-4" />
                        <span className="text-sm font-semibold">
                          Superamento budget di {formatCurrency(cc.totaleSpeso - cc.budgetIniziale!)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
          )}
        </TabsContent>

        {/* Near Budget Tab */}
        <TabsContent value="near-budget" className="space-y-4 data-[state=active]:animate-fade-in">
          {centriCosto.filter(cc => cc.budgetIniziale && cc.percentualeUtilizzata >= 80 && cc.percentualeUtilizzata <= 100).length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-500">Nessuna commessa vicina al budget</p>
              </CardContent>
            </Card>
          ) : (
            centriCosto
              .filter(cc => cc.budgetIniziale && cc.percentualeUtilizzata >= 80 && cc.percentualeUtilizzata <= 100)
              .map((cc) => (
                <Card key={cc.project.id} className="border-yellow-300">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle>{cc.project.code} - {cc.project.client}</CardTitle>
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full inline-flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                            Vicino al Budget
                          </span>
                        </div>
                        <CardDescription>{cc.project.object}</CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-yellow-600">{formatCurrency(cc.totaleSpeso)}</div>
                        <p className="text-sm text-gray-500">
                          su {formatCurrency(cc.budgetIniziale!)} ({cc.percentualeUtilizzata.toFixed(1)}%)
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Progress value={cc.percentualeUtilizzata} className="h-2 bg-yellow-100" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center gap-2 text-yellow-700">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm font-semibold">
                          Margine residuo: {formatCurrency(cc.budgetIniziale! - cc.totaleSpeso)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
