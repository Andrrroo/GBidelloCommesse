import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Clock, Euro, Users, AlertTriangle } from "lucide-react";
import { type Project } from "@shared/schema";
import { useState } from "react";

interface ProjectResource {
  projectId: string;
  userName: string;
  role: string;
  oreAssegnate: number;
  oreLavorate: number;
  costoOrario: number;
}

interface ProjectMetadata {
  importoOpere?: number;
  importoServizio?: number;
  prestazioni?: string[];
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function KpiDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"]
  });

  const { data: resources } = useQuery<ProjectResource[]>({
    queryKey: ["/api/project-resources"]
  });

  // Filtra progetti per periodo
  const filteredProjects = projects?.filter(project => {
    if (selectedPeriod === "all") return true;
    if (!project.createdAt) return false;
    const createdAt = new Date(project.createdAt);
    const now = new Date();

    switch (selectedPeriod) {
      case "month":
        return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
      case "quarter":
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const projectQuarter = Math.floor(createdAt.getMonth() / 3);
        return projectQuarter === currentQuarter && createdAt.getFullYear() === now.getFullYear();
      case "year":
        return createdAt.getFullYear() === parseInt(selectedYear);
      default:
        return true;
    }
  }) || [];

  // KPI Calculations
  const kpis = {
    // Progetti
    totaleProgetti: filteredProjects.length,
    progettiInCorso: filteredProjects.filter(p => p.status === "in_corso").length,
    progettiSospesi: filteredProjects.filter(p => p.status === "sospesa").length,
    progettiConclussi: filteredProjects.filter(p => p.status === "conclusa").length,

    // Economici
    valoreCommesse: filteredProjects.reduce((sum, p) => {
      const metadata = p.metadata as ProjectMetadata;
      return sum + (metadata?.importoOpere || 0);
    }, 0),
    compensoPrevisto: filteredProjects.reduce((sum, p) => {
      const metadata = p.metadata as ProjectMetadata;
      return sum + (metadata?.importoServizio || 0);
    }, 0),

    // Risorse
    oreAssegnate: resources?.filter(r =>
      filteredProjects.some(p => p.id === r.projectId)
    ).reduce((sum, r) => sum + r.oreAssegnate, 0) || 0,
    oreLavorate: resources?.filter(r =>
      filteredProjects.some(p => p.id === r.projectId)
    ).reduce((sum, r) => sum + r.oreLavorate, 0) || 0,
    costiRisorse: resources?.filter(r =>
      filteredProjects.some(p => p.id === r.projectId)
    ).reduce((sum, r) => sum + (r.oreLavorate * r.costoOrario), 0) || 0,

    // Clienti
    totaleClienti: new Set(filteredProjects.map(p => p.client).filter(Boolean)).size,
  };

  // Marginalità
  const margine = kpis.compensoPrevisto - kpis.costiRisorse;
  const marginePercentuale = kpis.compensoPrevisto > 0
    ? ((margine / kpis.compensoPrevisto) * 100).toFixed(1)
    : "0";

  // Efficienza
  const efficienzaOre = kpis.oreAssegnate > 0
    ? ((kpis.oreLavorate / kpis.oreAssegnate) * 100).toFixed(1)
    : "0";

  // Progetti per status (pie chart)
  const statusData = [
    { name: "In Corso", value: kpis.progettiInCorso, color: COLORS[0] },
    { name: "Sospesa", value: kpis.progettiSospesi, color: COLORS[2] },
    { name: "Conclusa", value: kpis.progettiConclussi, color: COLORS[1] }
  ].filter(item => item.value > 0);

  // Trend mensile progetti (bar chart)
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const month = i;
    const year = parseInt(selectedYear);
    const count = filteredProjects.filter(p => {
      if (!p.createdAt) return false;
      const date = new Date(p.createdAt);
      return date.getMonth() === month && date.getFullYear() === year;
    }).length;

    return {
      month: new Date(year, month).toLocaleDateString('it-IT', { month: 'short' }),
      progetti: count
    };
  });

  // Top 5 commesse per valore
  const top5Progetti = [...filteredProjects]
    .map(p => {
      const metadata = p.metadata as ProjectMetadata;
      return {
        ...p,
        valore: metadata?.importoOpere || 0
      };
    })
    .sort((a, b) => b.valore - a.valore)
    .slice(0, 5);

  // Distribuzione ore per ruolo
  const orePerRuolo = resources?.reduce((acc: Record<string, number>, r) => {
    if (!filteredProjects.some(p => p.id === r.projectId)) return acc;
    acc[r.role] = (acc[r.role] || 0) + r.oreLavorate;
    return acc;
  }, {}) || {};

  const roleData = Object.entries(orePerRuolo).map(([role, ore]) => ({
    role: role === 'progettista' ? 'Progettista' :
          role === 'dl' ? 'Direttore Lavori' :
          role === 'csp' ? 'CSP' :
          role === 'cse' ? 'CSE' :
          role === 'collaudatore' ? 'Collaudatore' :
          role === 'tecnico' ? 'Tecnico' :
          role === 'geologo' ? 'Geologo' :
          role === 'strutturista' ? 'Strutturista' :
          role === 'impiantista' ? 'Impiantista' : role,
    ore
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">KPI Dashboard</h2>
          <p className="text-gray-600 mt-1">Indicatori chiave di performance</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              <SelectItem value="month">Mese Corrente</SelectItem>
              <SelectItem value="quarter">Trimestre</SelectItem>
              <SelectItem value="year">Anno</SelectItem>
            </SelectContent>
          </Select>
          {selectedPeriod === "year" && (() => {
            // Range anni disponibili:
            //   max = anno corrente (non permettiamo di selezionare anni futuri)
            //   min = il più basso tra 2025 (baseline app) e l'anno della commessa più vecchia
            const currentYear = new Date().getFullYear();
            const oldestProjectYear = (projects ?? [])
              .map(p => p.createdAt ? new Date(p.createdAt).getFullYear() : currentYear)
              .reduce((min, y) => Math.min(min, y), currentYear);
            const minYear = Math.min(2025, oldestProjectYear);
            const years: number[] = [];
            for (let y = currentYear; y >= minYear; y--) years.push(y);
            return (
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })()}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Progetti */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Commesse Totali</CardDescription>
            <CardTitle className="text-3xl">{kpis.totaleProgetti}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-gray-600 space-y-1">
              <div className="flex justify-between">
                <span>In Corso:</span>
                <span className="font-medium text-blue-600">{kpis.progettiInCorso}</span>
              </div>
              <div className="flex justify-between">
                <span>Sospese:</span>
                <span className="font-medium text-orange-600">{kpis.progettiSospesi}</span>
              </div>
              <div className="flex justify-between">
                <span>Concluse:</span>
                <span className="font-medium text-green-600">{kpis.progettiConclussi}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Valore Commesse */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Valore Commesse</CardDescription>
            <CardTitle className="text-3xl">
              €{(kpis.valoreCommesse / 100).toLocaleString('it-IT', { maximumFractionDigits: 0 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-gray-600 space-y-1">
              <div className="flex justify-between">
                <span>Compenso Previsto:</span>
                <span className="font-medium">
                  €{(kpis.compensoPrevisto / 100).toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Costi Risorse:</span>
                <span className="font-medium text-red-600">
                  €{(kpis.costiRisorse / 100).toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Margine:</span>
                <span className={`font-bold flex items-center gap-1 ${parseFloat(marginePercentuale) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {parseFloat(marginePercentuale) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {marginePercentuale}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ore */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Gestione Ore</CardDescription>
            <CardTitle className="text-3xl">{kpis.oreLavorate}h</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-gray-600 space-y-1">
              <div className="flex justify-between">
                <span>Ore Assegnate:</span>
                <span className="font-medium">{kpis.oreAssegnate}h</span>
              </div>
              <div className="flex justify-between">
                <span>Ore Lavorate:</span>
                <span className="font-medium text-blue-600">{kpis.oreLavorate}h</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Efficienza:</span>
                <span className={`font-bold ${parseFloat(efficienzaOre) <= 100 ? 'text-green-600' : 'text-orange-600'}`}>
                  {efficienzaOre}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Clienti */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Clienti Attivi</CardDescription>
            <CardTitle className="text-3xl">{kpis.totaleClienti}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-gray-600">
              <div className="flex justify-between">
                <span>Avg. Commesse/Cliente:</span>
                <span className="font-medium">
                  {kpis.totaleClienti > 0
                    ? (kpis.totaleProgetti / kpis.totaleClienti).toFixed(1)
                    : '0'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="trend" className="w-full">
        <TabsList>
          <TabsTrigger value="trend">Trend Progetti</TabsTrigger>
          <TabsTrigger value="status">Distribuzione Status</TabsTrigger>
          <TabsTrigger value="top">Top Commesse</TabsTrigger>
          <TabsTrigger value="risorse">Distribuzione Risorse</TabsTrigger>
        </TabsList>

        {/* Trend Mensile */}
        <TabsContent value="trend">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Trend Mensile Nuove Commesse</CardTitle>
                {(() => {
                  // Stessa logica del range anni del selector in alto: max = anno
                  // corrente, min = min(2025, anno commessa più vecchia).
                  const currentYear = new Date().getFullYear();
                  const oldestProjectYear = (projects ?? [])
                    .map(p => p.createdAt ? new Date(p.createdAt).getFullYear() : currentYear)
                    .reduce((min, y) => Math.min(min, y), currentYear);
                  const minYear = Math.min(2025, oldestProjectYear);
                  const years: number[] = [];
                  for (let y = currentYear; y >= minYear; y--) years.push(y);
                  return (
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger className="w-28" aria-label="Anno del trend mensile">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map(year => (
                          <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                })()}
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="progetti" fill={COLORS[0]} name="Nuove Commesse" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Distribuzione Status */}
        <TabsContent value="status">
          <Card>
            <CardHeader>
              <CardTitle>Distribuzione Commesse per Status</CardTitle>
            </CardHeader>
            <CardContent>
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-gray-500 py-8">Nessun dato disponibile</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Commesse */}
        <TabsContent value="top">
          <Card>
            <CardHeader>
              <CardTitle>Top 5 Commesse per Valore</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {top5Progetti.map((project, index) => (
                  <div key={project.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className={`text-2xl font-bold ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-gray-400' : index === 2 ? 'text-orange-600' : 'text-gray-600'}`}>
                        #{index + 1}
                      </div>
                      <div>
                        <div className="font-semibold">{project.code}</div>
                        <div className="text-sm text-gray-600 truncate max-w-md">{project.object}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg">
                        €{(project.valore / 100).toLocaleString('it-IT', { maximumFractionDigits: 0 })}
                      </div>
                      <div className={`text-xs ${
                        project.status === 'in_corso' ? 'text-blue-600' :
                        project.status === 'conclusa' ? 'text-green-600' :
                        'text-orange-600'
                      }`}>
                        {project.status === 'in_corso' ? 'In Corso' :
                         project.status === 'conclusa' ? 'Conclusa' : 'Sospesa'}
                      </div>
                    </div>
                  </div>
                ))}
                {top5Progetti.length === 0 && (
                  <p className="text-center text-gray-500 py-8">Nessuna commessa disponibile</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Distribuzione Risorse */}
        <TabsContent value="risorse">
          <Card>
            <CardHeader>
              <CardTitle>Distribuzione Ore per Ruolo</CardTitle>
            </CardHeader>
            <CardContent>
              {roleData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={roleData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="role" type="category" width={150} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="ore" fill={COLORS[4]} name="Ore Lavorate" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-gray-500 py-8">Nessuna risorsa assegnata</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Alerts */}
      {(parseFloat(marginePercentuale) < 20 || parseFloat(efficienzaOre) > 100) && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="w-5 h-5" />
              Attenzione
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {parseFloat(marginePercentuale) < 20 && (
              <p className="text-sm text-orange-700 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>Marginalità bassa ({marginePercentuale}%). Considerare ottimizzazione costi o revisione compensi.</span>
              </p>
            )}
            {parseFloat(efficienzaOre) > 100 && (
              <p className="text-sm text-orange-700 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>Ore lavorate superiori alle ore assegnate ({efficienzaOre}%). Verifica budget ore progetti.</span>
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
