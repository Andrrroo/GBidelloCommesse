import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { type Project, type ProjectMetadata } from "@shared/schema";
import { formatImporto } from "@/lib/prestazioni-utils";
import {
  TrendingUp, TrendingDown, DollarSign, Briefcase,
  PieChart as PieChartIcon, BarChart3, Target, AlertCircle
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function EconomicDashboardCard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "amministratore";
  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: isAdmin,
  });

  // Guard difensivo: il tab/widget è già gated in dashboard.tsx per i
  // collaboratori, ma preveniamo render accidentali di valori economici.
  if (!isAdmin) return null;

  if (isLoading) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calcoli economici
  const projectsWithEconomicData = projects.filter(p => {
    const metadata = p.metadata as ProjectMetadata;
    return metadata?.importoOpere || metadata?.importoServizio;
  });

  const totalImportoOpere = projectsWithEconomicData.reduce((sum, p) => {
    const metadata = p.metadata as ProjectMetadata;
    return sum + (metadata?.importoOpere || 0);
  }, 0);

  const totalImportoServizi = projectsWithEconomicData.reduce((sum, p) => {
    const metadata = p.metadata as ProjectMetadata;
    return sum + (metadata?.importoServizio || 0);
  }, 0);

  const projectsInCorso = projects.filter(p => p.status === "in_corso");
  const importoServiziInCorso = projectsInCorso.reduce((sum, p) => {
    const metadata = p.metadata as ProjectMetadata;
    return sum + (metadata?.importoServizio || 0);
  }, 0);

  const projectsConcluse = projects.filter(p => p.status === "conclusa");
  const importoServiziConclusi = projectsConcluse.reduce((sum, p) => {
    const metadata = p.metadata as ProjectMetadata;
    return sum + (metadata?.importoServizio || 0);
  }, 0);

  const averageImportoServizio = projectsWithEconomicData.length > 0
    ? totalImportoServizi / projectsWithEconomicData.length
    : 0;

  // Dati per grafico distribuzione per anno
  const yearlyData = projects.reduce((acc, project) => {
    const year = String(project.year < 100 ? 2000 + project.year : project.year);
    const metadata = project.metadata as ProjectMetadata;
    const importo = metadata?.importoServizio || 0;

    const existing = acc.find(item => item.year === year);
    if (existing) {
      existing.importo += importo;
      existing.count += 1;
    } else {
      acc.push({ year, importo, count: 1 });
    }
    return acc;
  }, [] as Array<{ year: string; importo: number; count: number }>)
  .sort((a, b) => a.year.localeCompare(b.year));

  // Dati per grafico distribuzione per stato
  const statusData = [
    {
      name: 'In Corso',
      value: importoServiziInCorso,
      count: projectsInCorso.length,
      color: '#F59E0B'
    },
    {
      name: 'Concluse',
      value: importoServiziConclusi,
      count: projectsConcluse.length,
      color: '#10B981'
    },
    {
      name: 'Sospese',
      value: projects.filter(p => p.status === "sospesa").reduce((sum, p) => {
        const metadata = p.metadata as ProjectMetadata;
        return sum + (metadata?.importoServizio || 0);
      }, 0),
      count: projects.filter(p => p.status === "sospesa").length,
      color: '#EF4444'
    },
  ].filter(item => item.count > 0);

  // Top 5 commesse per importo
  const topProjectsByValue = [...projectsWithEconomicData]
    .sort((a, b) => {
      const metadataA = a.metadata as ProjectMetadata;
      const metadataB = b.metadata as ProjectMetadata;
      return (metadataB?.importoServizio || 0) - (metadataA?.importoServizio || 0);
    })
    .slice(0, 5);

  // Calcola percentuale parcella media
  const avgPercentualeParcella = projectsWithEconomicData.reduce((sum, p) => {
    const metadata = p.metadata as ProjectMetadata;
    return sum + (metadata?.percentualeParcella || 0);
  }, 0) / (projectsWithEconomicData.length || 1);

  return (
    <Card className="col-span-full shadow-lg border-gray-200">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-green-600" />
              Dashboard Economica
            </CardTitle>
            <CardDescription className="mt-1">
              Panoramica economica delle commesse attive e concluse
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-sm px-3 py-1">
            {projectsWithEconomicData.length} commesse valorizzate
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Panoramica
            </TabsTrigger>
            <TabsTrigger value="charts" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Grafici
            </TabsTrigger>
            <TabsTrigger value="top-projects" className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Top Commesse
            </TabsTrigger>
          </TabsList>

          {/* Panoramica KPI */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* KPI 1: Importo Totale Opere */}
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardHeader className="pb-2">
                  <CardDescription className="text-blue-700 font-medium">
                    Importo Totale Opere
                  </CardDescription>
                  <CardTitle className="text-3xl font-bold text-blue-900">
                    {formatImporto(totalImportoOpere)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-blue-600">
                    Base di calcolo compensi professionali
                  </p>
                </CardContent>
              </Card>

              {/* KPI 2: Compensi Professionali */}
              <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                <CardHeader className="pb-2">
                  <CardDescription className="text-green-700 font-medium">
                    Compensi Professionali
                  </CardDescription>
                  <CardTitle className="text-3xl font-bold text-green-900">
                    {formatImporto(totalImportoServizi)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <TrendingUp className="h-3 w-3" />
                    {projectsWithEconomicData.length} commesse
                  </div>
                </CardContent>
              </Card>

              {/* KPI 3: In Corso */}
              <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
                <CardHeader className="pb-2">
                  <CardDescription className="text-yellow-700 font-medium">
                    Commesse In Corso
                  </CardDescription>
                  <CardTitle className="text-3xl font-bold text-yellow-900">
                    {formatImporto(importoServiziInCorso)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-yellow-600">
                    {projectsInCorso.length} progetti attivi
                  </p>
                </CardContent>
              </Card>

              {/* KPI 4: Media Compenso */}
              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <CardHeader className="pb-2">
                  <CardDescription className="text-purple-700 font-medium">
                    Compenso Medio
                  </CardDescription>
                  <CardTitle className="text-3xl font-bold text-purple-900">
                    {formatImporto(averageImportoServizio)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-purple-600">
                    Per commessa ({avgPercentualeParcella.toFixed(2)}% medio)
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Metriche Secondarie */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    Fatturato Realizzato
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatImporto(importoServiziConclusi)}
                  </div>
                  <Progress value={totalImportoServizi > 0 ? (importoServiziConclusi / totalImportoServizi) * 100 : 0} className="mt-2 h-2" />
                  <p className="text-xs text-gray-500 mt-2">
                    {projectsConcluse.length} commesse concluse
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    Pipeline Attiva
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatImporto(importoServiziInCorso)}
                  </div>
                  <Progress value={totalImportoServizi > 0 ? (importoServiziInCorso / totalImportoServizi) * 100 : 0} className="mt-2 h-2" indicatorClassName="bg-yellow-500" />
                  <p className="text-xs text-gray-500 mt-2">
                    In fase di realizzazione
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    Tasso di Completamento
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900">
                    {projects.length > 0 ? ((projectsConcluse.length / projects.length) * 100).toFixed(1) : '0.0'}%
                  </div>
                  <Progress value={projects.length > 0 ? (projectsConcluse.length / projects.length) * 100 : 0} className="mt-2 h-2" indicatorClassName="bg-green-500" />
                  <p className="text-xs text-gray-500 mt-2">
                    {projectsConcluse.length}/{projects.length} commesse
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Grafici */}
          <TabsContent value="charts" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Grafico Distribuzione per Anno */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-blue-600" />
                    Distribuzione Annuale Compensi
                  </CardTitle>
                  <CardDescription>
                    Andamento compensi professionali per anno
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={yearlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis
                        dataKey="year"
                        tick={{ fontSize: 12 }}
                        stroke="#6B7280"
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        stroke="#6B7280"
                        tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        formatter={(value: number) => formatImporto(value)}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
                      />
                      <Bar
                        dataKey="importo"
                        fill="#3B82F6"
                        radius={[8, 8, 0, 0]}
                        name="Compensi"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Grafico Distribuzione per Stato */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <PieChartIcon className="h-5 w-5 text-green-600" />
                    Distribuzione per Stato
                  </CardTitle>
                  <CardDescription>
                    Ripartizione compensi per stato commessa
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(props: any) => {
                          const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
                          if (!percent || percent < 0.05) return null;
                          const RADIAN = Math.PI / 180;
                          const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
                          const x = cx + radius * Math.cos(-midAngle * RADIAN);
                          const y = cy + radius * Math.sin(-midAngle * RADIAN);
                          return (
                            <text
                              x={x}
                              y={y}
                              fill="white"
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize={13}
                              fontWeight={700}
                              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                            >
                              {`${(percent * 100).toFixed(0)}%`}
                            </text>
                          );
                        }}
                        outerRadius={95}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => formatImporto(value)}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-4 space-y-2">
                    {statusData.map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-gray-700">{item.name}</span>
                        </div>
                        <div className="font-medium text-gray-900">
                          {formatImporto(item.value)} ({item.count})
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Top Commesse */}
          <TabsContent value="top-projects" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-purple-600" />
                  Top 5 Commesse per Valore
                </CardTitle>
                <CardDescription>
                  Commesse con il maggiore importo di compensi professionali
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {topProjectsByValue.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <AlertCircle className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                      <p>Nessuna commessa con dati economici disponibili</p>
                    </div>
                  ) : (
                    topProjectsByValue.map((project, index) => {
                      const metadata = project.metadata as ProjectMetadata;
                      const importoServizio = metadata?.importoServizio || 0;
                      const percentage = totalImportoServizi > 0 ? (importoServizio / totalImportoServizi) * 100 : 0;

                      return (
                        <div key={project.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                                index === 0 ? 'bg-yellow-500' :
                                index === 1 ? 'bg-gray-400' :
                                index === 2 ? 'bg-orange-600' :
                                'bg-blue-500'
                              }`}>
                                {index + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-gray-900 truncate" title={`${project.code} - ${project.object}`}>
                                  {project.code}
                                </div>
                                <div className="text-sm text-gray-500 truncate">
                                  {project.client} - {project.city}
                                </div>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 ml-4">
                              <div className="font-bold text-gray-900">
                                {formatImporto(importoServizio)}
                              </div>
                              <div className="text-xs text-gray-500">
                                {percentage.toFixed(1)}% del totale
                              </div>
                            </div>
                          </div>
                          <Progress value={percentage} className="h-2" />
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
