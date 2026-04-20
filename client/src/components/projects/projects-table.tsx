import { useRef, useState } from "react";
import {
  Settings, ClipboardList, Wallet, MessageCircle, Calendar,
  Search, X, Folder, Wrench, Hammer, AlertTriangle, Check,
  Loader2, Mail, Send, Pin, Target, Bell, Pencil, BarChart3,
  Trash2, FileText, Play, Pause, Flag, ArrowUp, ArrowDown
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { EntrateUsciteCombinedPie, type PieDatum } from '@/components/shared/entrate-uscite-breakdown';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { type Project, type ProjectMetadata, type Communication, type Deadline, type FatturaEmessa, type ProjectSummary, CATEGORIE_LAVORO_PROFESSIONALE } from "@shared/schema";
import EditProjectForm from "./edit-project-form";
import NewProjectForm from "./new-project-form";
import PrestazioniModal from "./prestazioni-modal";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/table-pagination";
import { useAuth } from "@/hooks/useAuth";
import { Plus } from "lucide-react";
import { 
  renderPrestazioneBadge, 
  formatImporto, 
  renderClasseDMColumn,
  renderLivelliProgettazioneColumn,
  renderTipoRapportoBadge,
  PRESTAZIONI_CONFIG,
  type PrestazioneType,
  type TipoRapportoType 
} from "@/lib/prestazioni-utils";

export default function ProjectsTable() {
  const tableTopRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [tipoInterventoFilter, setTipoInterventoFilter] = useState<string>("all");
  const [categoriaLavoroFilter, setCategoriaLavoroFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<'createdAt' | 'code' | 'client' | 'year'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [selectedProjectForPrestazioni, setSelectedProjectForPrestazioni] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ id: string; status: string } | null>(null);
  const [summaryProject, setSummaryProject] = useState<Project | null>(null);
  // Payload di /api/projects/:id/summary — il server ritorna sempre il
  // tipo completo (permessi uniformi tra admin e collaboratori).
  const [summaryData, setSummaryData] = useState<ProjectSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Column visibility toggles
  const [showTechInfo, setShowTechInfo] = useState(false);
  const [showPrestazioni, setShowPrestazioni] = useState(false);
  const [showFatturazione, setShowFatturazione] = useState(true);
  const [showComunicazioni, setShowComunicazioni] = useState(true);
  const [showScadenze, setShowScadenze] = useState(true);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "amministratore";

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Load communications
  const { data: communications = [] } = useQuery<Communication[]>({
    queryKey: ["/api/communications"],
  });

  // Load deadlines
  const { data: deadlines = [] } = useQuery<Deadline[]>({
    queryKey: ["/api/deadlines"],
  });

  // Load fatture emesse per calcolo fatturazione
  const { data: fattureEmesse = [] } = useQuery<FatturaEmessa[]>({
    queryKey: ["/api/fatture-emesse"],
  });

  // Helper: calcola dati fatturazione dal vivo per un progetto
  const getProjectFatturazione = (projectId: string) => {
    const fatture = fattureEmesse.filter(f => f.projectId === projectId);
    const totaleEmesso = fatture.reduce((acc, f) => acc + f.importoTotale, 0);
    const totaleIncassato = fatture.filter(f => f.incassata).reduce((acc, f) => acc + f.importoTotale, 0);
    const daIncassare = totaleEmesso - totaleIncassato;
    return { count: fatture.length, totaleEmesso, totaleIncassato, daIncassare, tutteIncassate: fatture.length > 0 && fatture.every(f => f.incassata) };
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PUT", `/api/projects/${id}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Stato aggiornato", description: "Lo stato della commessa e' stato aggiornato" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Errore durante l'aggiornamento dello stato", variant: "destructive" });
    }
  });

  const handleOpenSummary = async (project: Project) => {
    setSummaryProject(project);
    setSummaryLoading(true);
    try {
      const response = await apiRequest("GET", `/api/projects/${project.id}/summary`);
      const data = await response.json();
      setSummaryData(data);
    } catch {
      toast({ title: "Errore", description: "Impossibile caricare il riepilogo", variant: "destructive" });
      setSummaryProject(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Commessa eliminata",
        description: "La commessa è stata eliminata con successo",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
    },
    onError: () => {
      toast({
        title: "Errore nell'eliminazione",
        description: "Si è verificato un errore durante l'eliminazione della commessa",
        variant: "destructive",
      });
    },
  });

  // Get unique years from projects
  const availableYears = Array.from(new Set(projects.map(p => p.year))).sort((a, b) => b - a);

  const filteredProjects = projects.filter(project => {
    // Text search filter
    const matchesSearch = searchTerm === "" ||
      project.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.object.toLowerCase().includes(searchTerm.toLowerCase());

    // Status filter
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;

    // Year filter
    const matchesYear = yearFilter === "all" || project.year === parseInt(yearFilter);

    // Tipo Intervento filter
    const matchesTipoIntervento = tipoInterventoFilter === "all" || project.tipoIntervento === tipoInterventoFilter;

    // Categoria Lavoro Professionale filter — si applica solo alle commesse non di manutenzione
    const matchesCategoriaLavoro = categoriaLavoroFilter === "all" ||
      (!project.manutenzione && project.categoriaLavoro === categoriaLavoroFilter);

    return matchesSearch && matchesStatus && matchesYear && matchesTipoIntervento && matchesCategoriaLavoro;
  });

  // Ordinamento configurabile. Default: data creazione decrescente (più recenti in alto).
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'createdAt': {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        cmp = at - bt;
        break;
      }
      case 'code':
        cmp = a.code.localeCompare(b.code, 'it');
        break;
      case 'client':
        cmp = (a.client || '').localeCompare(b.client || '', 'it', { sensitivity: 'base' });
        break;
      case 'year':
        cmp = (a.year || 0) - (b.year || 0);
        break;
    }
    // Tiebreaker sul suffisso numerico del codice (es. 2601 > 2501): mantiene
    // ordine deterministico quando il criterio primario è equivalente.
    if (cmp === 0) {
      const codeA = parseInt(a.code.match(/(\d{4})$/)?.[1] ?? '0', 10);
      const codeB = parseInt(b.code.match(/(\d{4})$/)?.[1] ?? '0', 10);
      cmp = codeA - codeB;
    }
    return sortDirection === 'asc' ? cmp : -cmp;
  });

  const toggleSortDirection = () => setSortDirection(d => d === 'asc' ? 'desc' : 'asc');

  // Paginazione (reset quando cambiano filtri o ricerca)
  const pagination = usePagination<Project>({
    data: sortedProjects,
    pageSize: 25,
    resetKey: `${searchTerm}|${statusFilter}|${yearFilter}|${tipoInterventoFilter}|${categoriaLavoroFilter}|${sortBy}|${sortDirection}`,
  });

  const handleDeleteProject = (project: Project) => {
    setProjectToDelete(project);
  };

  const confirmDeleteProject = () => {
    if (projectToDelete) {
      deleteProjectMutation.mutate(projectToDelete.id);
      setProjectToDelete(null);
    }
  };

  const handleExportProject = (project: Project) => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.code}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "Esportazione completata",
      description: `Commessa ${project.code} esportata con successo`,
    });
  };

  // Handler for opening prestazioni modal
  const handleOpenPrestazioniModal = (project: Project) => {
    setSelectedProjectForPrestazioni(project);
  };

  const handleClosePrestazioniModal = () => {
    setSelectedProjectForPrestazioni(null);
  };

  // Communication helper function
  const getLastCommunication = (projectId: string): Communication | undefined => {
    const projectComms = communications
      .filter(comm => comm.projectId === projectId)
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    return projectComms[0];
  };

  // Deadline helper function - get next upcoming deadline
  const getNextDeadline = (projectId: string): Deadline | undefined => {
    const now = new Date();
    const projectDeadlines = deadlines
      .filter(deadline => deadline.projectId === projectId && !deadline.completata)
      .filter(deadline => new Date(deadline.data) >= now)
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
    return projectDeadlines[0];
  };

  if (isLoading) {
    return (
      <div data-testid="projects-table-loading">
        <div className="flex justify-between items-center mb-6">
          <Skeleton className="h-7 w-48" />
          <div className="flex gap-3">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-4 items-center p-4 bg-white rounded-lg border border-gray-100">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-40 flex-1" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-8 w-28" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="projects-table">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Tutte le Commesse</h3>
          {isAdmin && (
            <Button
              className="button-g2-primary"
              onClick={() => setShowNewProjectDialog(true)}
              data-testid="add-project"
            >
              <Plus className="h-4 w-4 mr-1" />
              Nuova Commessa
            </Button>
          )}
        </div>

        {/* Column Toggle Buttons */}
        <div className="flex gap-2 flex-wrap items-center mb-4 pb-3 border-b border-gray-200">
          <span className="text-sm text-gray-600 font-medium mr-2">Mostra colonne:</span>
          <Button
            size="sm"
            variant={showTechInfo ? "default" : "outline"}
            onClick={() => setShowTechInfo(!showTechInfo)}
            className="text-xs gap-1.5"
          >
            <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            Info Tecniche
          </Button>
          <Button
            size="sm"
            variant={showPrestazioni ? "default" : "outline"}
            onClick={() => setShowPrestazioni(!showPrestazioni)}
            className="text-xs gap-1.5"
          >
            <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
            Prestazioni/DM143
          </Button>
          <Button
            size="sm"
            variant={showFatturazione ? "default" : "outline"}
            onClick={() => setShowFatturazione(!showFatturazione)}
            className="text-xs gap-1.5"
          >
            <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
            Fatturazione
          </Button>
          <Button
            size="sm"
            variant={showComunicazioni ? "default" : "outline"}
            onClick={() => setShowComunicazioni(!showComunicazioni)}
            className="text-xs gap-1.5"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Comunicazioni
          </Button>
          <Button
            size="sm"
            variant={showScadenze ? "default" : "outline"}
            onClick={() => setShowScadenze(!showScadenze)}
            className="text-xs gap-1.5"
          >
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            Scadenze
          </Button>
        </div>

        {/* Riga filtri + ordinamento */}
        <div className="flex gap-3 flex-wrap items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]" data-testid="filter-status">
              <SelectValue placeholder="Tutti gli stati" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="in_corso">In Corso</SelectItem>
              <SelectItem value="sospesa">Sospesa</SelectItem>
              <SelectItem value="conclusa">Conclusa</SelectItem>
            </SelectContent>
          </Select>

          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-[150px]" data-testid="filter-year">
              <SelectValue placeholder="Tutti gli anni" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli anni</SelectItem>
              {availableYears.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year < 100 ? 2000 + year : year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tipoInterventoFilter} onValueChange={setTipoInterventoFilter}>
            <SelectTrigger className="w-[200px]" data-testid="filter-tipo-intervento">
              <SelectValue placeholder="Tipo intervento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i tipi</SelectItem>
              <SelectItem value="professionale">Lavoro Professionale</SelectItem>
              <SelectItem value="realizzativo">Manutenzione</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoriaLavoroFilter} onValueChange={setCategoriaLavoroFilter}>
            <SelectTrigger className="w-[180px]" data-testid="filter-categoria-lavoro">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le categorie</SelectItem>
              {CATEGORIE_LAVORO_PROFESSIONALE.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Ordinamento: Select + freccia, sempre accoppiati in un blocco inseparabile */}
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-[240px]" aria-label="Criterio di ordinamento" data-testid="sort-by-projects">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Ordina per: Data creazione</SelectItem>
                <SelectItem value="code">Ordina per: Codice</SelectItem>
                <SelectItem value="client">Ordina per: Cliente</SelectItem>
                <SelectItem value="year">Ordina per: Anno</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleSortDirection}
              aria-label={sortDirection === 'asc' ? 'Ordine crescente' : 'Ordine decrescente'}
              title={sortDirection === 'asc' ? 'Ordine crescente' : 'Ordine decrescente'}
              data-testid="sort-direction-projects"
            >
              {sortDirection === 'asc'
                ? <ArrowUp className="h-4 w-4" aria-hidden="true" />
                : <ArrowDown className="h-4 w-4" aria-hidden="true" />}
            </Button>
          </div>

          {(statusFilter !== "all" || yearFilter !== "all" || tipoInterventoFilter !== "all" || categoriaLavoroFilter !== "all" || searchTerm !== "") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter("all");
                setYearFilter("all");
                setTipoInterventoFilter("all");
                setCategoriaLavoroFilter("all");
                setSearchTerm("");
              }}
              className="text-gray-500 hover:text-gray-700 gap-1"
              data-testid="clear-filters"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Pulisci filtri
            </Button>
          )}
        </div>

        {/* Riga ricerca: centrata sotto i filtri */}
        <div className="flex justify-center mt-3">
          <div className="relative w-full max-w-xl">
            <Input
              placeholder="Cerca per codice, cliente, città, oggetto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              data-testid="search-projects"
            />
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
          </div>
        </div>
      </div>
      
      {filteredProjects.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Folder className="h-12 w-12 mx-auto mb-2 text-gray-400" aria-hidden="true" />
          <p className="text-lg font-medium">
            {searchTerm ? "Nessuna commessa trovata" : "Nessuna commessa presente"}
          </p>
          <p className="text-sm">
            {searchTerm ? "Prova a modificare i criteri di ricerca" : "Crea la prima commessa per iniziare"}
          </p>
        </div>
      ) : (
        <>
          <div ref={tableTopRef} className="overflow-x-auto scroll-mt-24">
            <table className="w-full min-w-[1000px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-4 px-4 font-semibold text-gray-700 text-sm rounded-tl-lg w-24">Codice</th>
                  <th className="text-left py-4 px-4 font-semibold text-gray-700 text-sm w-32">Cliente</th>
                  {showTechInfo && (
                    <th className="text-left py-4 px-4 font-semibold text-gray-700 text-sm w-28">Tipo Rapporto</th>
                  )}
                  <th className="text-left py-4 px-4 font-semibold text-gray-700 text-sm w-24">Città</th>
                  <th className="text-left py-4 px-4 font-semibold text-gray-700 text-sm w-40">Oggetto</th>
                  {showPrestazioni && (
                    <>
                      <th className="text-left py-4 px-4 font-semibold text-gray-700 text-sm w-48">Prestazioni</th>
                      <th className="text-left py-4 px-4 font-semibold text-gray-700 text-sm w-40">Livelli Progettazione</th>
                      <th className="text-left py-4 px-4 font-semibold text-gray-700 text-sm w-32">Classe DM 143/2013</th>
                    </>
                  )}
                  {showTechInfo && (
                    <>
                      <th className="text-left py-4 px-4 font-semibold text-gray-700 text-sm w-32">Tipo</th>
                      <th className="text-left py-4 px-4 font-semibold text-gray-700 text-sm w-24">Categoria</th>
                      <th className="text-left py-4 px-4 font-semibold text-gray-700 text-sm w-16">Anno</th>
                      <th className="text-left py-4 px-4 font-semibold text-gray-700 text-sm w-20">Template</th>
                    </>
                  )}
                  <th className="text-left py-4 px-4 font-semibold text-gray-700 text-sm w-24">Stato</th>
                  {showFatturazione && (
                    <th className="text-left py-4 px-4 font-semibold text-gray-700 text-sm w-32">Fatturazione</th>
                  )}
                  {showComunicazioni && (
                    <th className="text-left py-4 px-4 font-semibold text-gray-700 text-sm w-48">Ultima Comunicazione</th>
                  )}
                  {showScadenze && (
                    <th className="text-left py-4 px-4 font-semibold text-gray-700 text-sm w-40">Prossima Scadenza</th>
                  )}
                  <th className="text-left py-4 px-4 font-semibold text-gray-700 text-sm rounded-tr-lg w-32">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagination.pageItems.map((project) => (
                  <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-4 font-mono text-sm font-semibold text-primary" data-testid={`project-code-${project.id}`}>
                      {project.code}
                    </td>
                    <td className="py-4 px-4 text-sm" data-testid={`project-client-${project.id}`}>
                      <div>
                        <div className="font-medium">{project.client}</div>
                        {project.committenteFinale && project.tipoRapporto !== "diretto" && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            ↳ Per: {project.committenteFinale}
                          </div>
                        )}
                      </div>
                    </td>
                    {showTechInfo && (
                      <td className="py-4 px-4" data-testid={`project-tipo-rapporto-${project.id}`}>
                        {(() => {
                          const tipoRapporto = project.tipoRapporto || "diretto";
                          const badge = renderTipoRapportoBadge(tipoRapporto as TipoRapportoType, 'sm');
                          const BadgeIcon = badge.Icon;
                          return (
                            <span
                              className={badge.className}
                              title={badge.description}
                            >
                              <BadgeIcon className="h-3 w-3" aria-hidden="true" />
                              {badge.label}
                            </span>
                          );
                        })()}
                      </td>
                    )}
                    <td className="py-4 px-4 text-sm text-gray-600" data-testid={`project-city-${project.id}`}>
                      {project.city}
                    </td>
                    <td className="py-4 px-4 text-sm" data-testid={`project-object-${project.id}`}>
                      {project.object}
                    </td>
                    {showPrestazioni && (
                      <>
                        {/* Colonna Prestazioni */}
                        <td className="py-4 px-4" data-testid={`project-prestazioni-${project.id}`}>
                          <div className="flex flex-wrap gap-1">
                            {((project.metadata as ProjectMetadata)?.prestazioni || []).map((prestazione) => {
                              const badge = renderPrestazioneBadge(prestazione as PrestazioneType, 'sm');
                              const BadgeIcon = badge.Icon;
                              return (
                                <span
                                  key={prestazione}
                                  className={badge.className}
                                  title={badge.fullLabel}
                                >
                                  <BadgeIcon className="h-3 w-3" aria-hidden="true" />
                                  {badge.label}
                                </span>
                              );
                            })}
                            {!(project.metadata as ProjectMetadata)?.prestazioni?.length && (
                              <span className="text-xs text-gray-500 italic">Non specificate</span>
                            )}
                          </div>
                        </td>
                        {/* Colonna Livelli Progettazione */}
                        <td className="py-4 px-4" data-testid={`project-livelli-progettazione-${project.id}`}>
                          <div className="flex flex-wrap gap-1">
                            {(() => {
                              const metadata = project.metadata as ProjectMetadata;
                              const livelliBadges = renderLivelliProgettazioneColumn(
                                metadata?.prestazioni,
                                metadata?.livelloProgettazione
                              );

                              if (livelliBadges.length === 0) {
                                return <span className="text-xs text-gray-500 italic">-</span>;
                              }

                              return livelliBadges.map((badge) => {
                                const BadgeIcon = badge.Icon;
                                return (
                                  <span
                                    key={badge.label}
                                    className={badge.className}
                                    title={badge.fullLabel}
                                  >
                                    <BadgeIcon className="h-3 w-3" aria-hidden="true" />
                                    {badge.label}
                                  </span>
                                );
                              });
                            })()}
                          </div>
                        </td>
                        {/* Colonna Classe DM 143/2013 */}
                        <td className="py-4 px-4" data-testid={`project-classe-dm-${project.id}`}>
                          {(() => {
                            const metadata = project.metadata as ProjectMetadata;
                            const classeDM = renderClasseDMColumn(metadata?.classeDM143, metadata?.importoOpere);
                            return (
                              <div>
                                <span className={`px-2 py-1 rounded-md text-xs font-mono font-bold ${
                                  classeDM.isFormatted ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-600'
                                }`}>
                                  {classeDM.classe}
                                </span>
                                <div className="text-xs text-gray-500 mt-1">
                                  {classeDM.importo}
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                      </>
                    )}
                    {showTechInfo && (
                      <>
                        <td className="py-4 px-4" data-testid={`project-tipo-${project.id}`}>
                          {project.manutenzione ? (
                            <span className="text-xs px-2 py-1 rounded-full font-medium bg-orange-100 text-orange-800 whitespace-nowrap inline-flex items-center gap-1">
                              <Wrench className="h-3 w-3" aria-hidden="true" />
                              Manutenzione
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded-full font-medium bg-blue-100 text-blue-800 whitespace-nowrap inline-flex items-center gap-1">
                              <Hammer className="h-3 w-3" aria-hidden="true" />
                              Lavoro Professionale
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4" data-testid={`project-categoria-${project.id}`}>
                          {!project.manutenzione && project.categoriaLavoro ? (
                            <span className="text-xs px-2 py-1 rounded-full font-medium bg-indigo-100 text-indigo-800 font-mono">
                              {project.categoriaLavoro}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-sm text-gray-600" data-testid={`project-year-${project.id}`}>
                          {project.year < 100 ? 2000 + project.year : project.year}
                        </td>
                        <td className="py-4 px-4" data-testid={`project-template-${project.id}`}>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            project.template === 'LUNGO'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {project.template}
                          </span>
                        </td>
                      </>
                    )}
                    <td className="py-4 px-4" data-testid={`project-status-${project.id}`}>
                      <Select
                        value={project.status}
                        onValueChange={(value) => {
                          if (value === 'conclusa') {
                            const fatt = getProjectFatturazione(project.id);
                            if (fatt.count === 0 || !fatt.tutteIncassate) {
                              setPendingStatusChange({ id: project.id, status: value });
                              return;
                            }
                          }
                          updateStatusMutation.mutate({ id: project.id, status: value });
                        }}
                      >
                        <SelectTrigger className={`w-[140px] h-8 text-xs font-medium rounded-full border-0 ${
                          project.status === 'in_corso'
                            ? 'bg-yellow-100 text-yellow-800'
                            : project.status === 'conclusa'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="in_corso">In Corso</SelectItem>
                          <SelectItem value="conclusa">Conclusa</SelectItem>
                          <SelectItem value="sospesa">Sospesa</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    {showFatturazione && (() => {
                      const fatt = getProjectFatturazione(project.id);
                      const concordato = project.budget || 0;
                      const residuoDaFatturare = Math.max(0, concordato - fatt.totaleEmesso);
                      const fmtEur = (v: number) => v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
                      const sforamento = concordato > 0 && fatt.totaleEmesso > concordato;
                      const concordatoRaggiunto = concordato > 0 && fatt.totaleEmesso >= concordato && !sforamento;
                      return (
                        <td className="py-4 px-4" data-testid={`project-fatturazione-${project.id}`}>
                          <div className="flex flex-col gap-1">
                            {fatt.count === 0 ? (
                              <>
                                <span className="text-xs text-gray-500 italic">Nessuna fattura</span>
                                {concordato > 0 && (
                                  <span className="text-xs text-indigo-600 font-medium whitespace-nowrap inline-flex items-center gap-1">
                                    <ClipboardList className="h-3 w-3" aria-hidden="true" />
                                    Da fatturare: {fmtEur(concordato)}
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                <div className="flex items-center gap-1">
                                  <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-md font-medium whitespace-nowrap">
                                    {fatt.count} fattur{fatt.count === 1 ? 'a' : 'e'}
                                  </span>
                                  <span className="text-xs text-gray-600 whitespace-nowrap">
                                    {fmtEur(fatt.totaleEmesso)}
                                  </span>
                                </div>
                                {/* Avanzamento rispetto al concordato */}
                                {sforamento ? (
                                  <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-800 rounded-md font-medium whitespace-nowrap inline-flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                    Eccedenza {fmtEur(fatt.totaleEmesso - concordato)}
                                  </span>
                                ) : concordatoRaggiunto ? (
                                  <span className="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded-md font-medium whitespace-nowrap inline-flex items-center gap-1">
                                    <Check className="h-3 w-3" aria-hidden="true" />
                                    Concordato raggiunto
                                  </span>
                                ) : residuoDaFatturare > 0 ? (
                                  <span className="text-xs text-indigo-600 font-medium whitespace-nowrap inline-flex items-center gap-1">
                                    <ClipboardList className="h-3 w-3" aria-hidden="true" />
                                    Residuo: {fmtEur(residuoDaFatturare)}
                                  </span>
                                ) : null}
                                {/* Stato incasso */}
                                {fatt.tutteIncassate ? (
                                  <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-800 rounded-md font-medium whitespace-nowrap inline-flex items-center gap-1">
                                    <Check className="h-3 w-3" aria-hidden="true" />
                                    Tutto incassato
                                  </span>
                                ) : fatt.totaleIncassato > 0 ? (
                                  <span className="text-xs text-orange-600 font-medium whitespace-nowrap inline-flex items-center gap-1">
                                    <Loader2 className="h-3 w-3" aria-hidden="true" />
                                    Da incassare {fmtEur(fatt.daIncassare)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-orange-600 font-medium whitespace-nowrap inline-flex items-center gap-1">
                                    <Loader2 className="h-3 w-3" aria-hidden="true" />
                                    Da incassare {fmtEur(fatt.totaleEmesso)}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      );
                    })()}
                    {showComunicazioni && (
                      <td className="py-4 px-4" data-testid={`project-last-communication-${project.id}`}>
                        {(() => {
                          const lastComm = getLastCommunication(project.id);
                          if (!lastComm) {
                            return <span className="text-xs text-gray-500 italic">Nessuna comunicazione</span>;
                          }

                          const commDate = new Date(lastComm.data);
                          const typeLabel = lastComm.tipo === 'email' ? 'Email' :
                                           lastComm.tipo === 'telefono' ? 'Tel' :
                                           lastComm.tipo === 'riunione' ? 'Riunione' :
                                           lastComm.tipo === 'verbale' ? 'Verbale' : 'Altro';
                          const Icon = lastComm.tipo === 'email' ? Mail : Send;

                          return (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1">
                                <Icon className="h-3.5 w-3.5 text-gray-600" aria-hidden="true" />
                                <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded-md font-medium">
                                  {typeLabel}
                                </span>
                              </div>
                              <div className="text-xs text-gray-600 truncate max-w-[200px]" title={lastComm.oggetto}>
                                {lastComm.oggetto}
                              </div>
                              <div className="text-xs text-gray-400">
                                {commDate.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                    )}
                    {showScadenze && (
                      <td className="py-4 px-4" data-testid={`project-next-deadline-${project.id}`}>
                        {(() => {
                          const nextDeadline = getNextDeadline(project.id);
                          if (!nextDeadline) {
                            return <span className="text-xs text-gray-500 italic">Nessuna scadenza</span>;
                          }

                          const deadlineDate = new Date(nextDeadline.data);
                          const now = new Date();
                          const daysUntil = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                          const priorityConfig: Record<string, { color: string; dotColor: string }> = {
                            bassa: { color: 'bg-gray-100 text-gray-700', dotColor: 'bg-gray-400' },
                            media: { color: 'bg-blue-100 text-blue-700', dotColor: 'bg-blue-500' },
                            alta:  { color: 'bg-orange-100 text-orange-700', dotColor: 'bg-orange-500' },
                          };

                          const typeIconMap: Record<string, typeof Target> = {
                            milestone: Target,
                            deadline:  Pin,
                            reminder:  Bell,
                            altro:     ClipboardList,
                          };
                          const TypeIcon = typeIconMap[nextDeadline.tipo] || Pin;

                          const priority = priorityConfig[nextDeadline.priorita] || priorityConfig.media;

                          return (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1">
                                <TypeIcon className="h-3.5 w-3.5 text-gray-700" aria-hidden="true" />
                                <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium inline-flex items-center gap-1 ${priority.color}`}>
                                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${priority.dotColor}`} aria-hidden="true" />
                                  {nextDeadline.priorita === 'bassa' ? 'Bassa' :
                                     nextDeadline.priorita === 'media' ? 'Media' : 'Alta'}
                                </span>
                              </div>
                              <div className="text-xs font-medium text-gray-700 truncate max-w-[180px]" title={nextDeadline.titolo}>
                                {nextDeadline.titolo}
                              </div>
                              <div className={`text-xs font-medium flex items-center gap-1 ${daysUntil <= 7 ? 'text-red-600' : 'text-gray-500'}`}>
                                <span>{deadlineDate.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                                {daysUntil <= 7 && (
                                  <span className="inline-flex items-center gap-0.5 ml-1">
                                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                    {daysUntil}gg
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                    )}
                    <td className="py-4 px-4">
                      <div className="flex gap-2">
                        <EditProjectForm project={project}>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Modifica"
                            aria-label="Modifica commessa"
                            data-testid={`edit-project-${project.id}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </EditProjectForm>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenSummary(project)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Riepilogo Economico"
                          aria-label="Riepilogo economico"
                          data-testid={`summary-project-${project.id}`}
                        >
                          <BarChart3 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenPrestazioniModal(project)}
                          className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="Dettagli Prestazioni"
                          aria-label="Dettagli prestazioni"
                          data-testid={`prestazioni-details-${project.id}`}
                        >
                          <Hammer className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleExportProject(project)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Esporta"
                          aria-label="Esporta commessa"
                          data-testid={`export-project-${project.id}`}
                        >
                          <FileText className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteProject(project)}
                          disabled={deleteProjectMutation.isPending}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Elimina"
                          aria-label="Elimina commessa"
                          data-testid={`delete-project-${project.id}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <TablePagination pagination={pagination} scrollTopRef={tableTopRef} />

          <div className="mt-4 flex justify-between items-center text-sm text-gray-600">
            <span data-testid="projects-count">
              Totale filtrato: <strong>{filteredProjects.length}</strong> di <strong>{projects.length}</strong> commesse
            </span>
          </div>
        </>
      )}
      
      {/* Prestazioni Modal */}
      {selectedProjectForPrestazioni && (
        <PrestazioniModal
          project={selectedProjectForPrestazioni}
          isOpen={true}
          onClose={handleClosePrestazioniModal}
        />
      )}

      {/* Riepilogo Economico Dialog */}
      <Dialog open={!!summaryProject} onOpenChange={(open) => { if (!open) { setSummaryProject(null); setSummaryData(null); } }}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
              Riepilogo Economico — {summaryProject?.code}
            </DialogTitle>
          </DialogHeader>
          {summaryLoading ? (
            <div className="flex justify-center py-8">
              <span className="text-gray-500">Caricamento...</span>
            </div>
          ) : summaryData ? (() => {
            // Il server invia un payload ridotto per i non-admin: mancano
            // `margine`, `marginePercentuale`, `costi.totale`, `costi.fattureConsulenti`,
            // `costi.prestazioni`, `usciteBreakdown`. Usiamo `hasFullFinancials`
            // come flag per nascondere le sezioni che richiedono quei campi.
            const hasFullFinancials = typeof summaryData.margine === 'number';
            const marginePositivo = hasFullFinancials ? summaryData.margine >= 0 : true;
            const fmt = (v: number) => v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

            // Breakdown per cliente/fornitore (servito dall'endpoint /summary).
            // Fallback per payload legacy: lista vuota → il componente mostra l'empty state.
            const entrateBreakdown: PieDatum[] = summaryData.entrateBreakdown ?? [];
            const usciteBreakdown: PieDatum[] = summaryData.usciteBreakdown ?? [];
            const hasBreakdown = entrateBreakdown.length > 0 || usciteBreakdown.length > 0;

            // Dati per grafico andamento temporale
            const timelineData: { data: string; entrate: number; uscite: number }[] = [];
            if (summaryData.timeline?.length > 0) {
              let entrCum = 0;
              let uscCum = 0;
              for (const event of summaryData.timeline) {
                if (event.tipo === 'emessa') {
                  entrCum += event.importo;
                } else {
                  uscCum += event.importo;
                }
                timelineData.push({
                  data: new Date(event.data).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
                  entrate: Math.round(entrCum * 100) / 100,
                  uscite: Math.round(uscCum * 100) / 100,
                });
              }
            }

            const importoConcordato = summaryProject?.budget || 0;
            const fatturato = summaryData.fattureEmesse.totale;
            const residuoDaFatturare = Math.max(0, importoConcordato - fatturato);
            const percentualeFatturato = importoConcordato > 0 ? Math.min(100, (fatturato / importoConcordato) * 100) : 0;
            const sforamento = importoConcordato > 0 && fatturato > importoConcordato;

            return (
              <div className="space-y-4 overflow-y-auto overflow-x-hidden px-1 py-1 flex-1">
                {/* Avanzamento fatturazione vs importo concordato */}
                {importoConcordato > 0 && (
                  <div className={`p-4 rounded-lg border ${sforamento ? 'bg-red-50 border-red-300' : 'bg-indigo-50 border-indigo-200'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <h4 className={`font-semibold text-sm flex items-center gap-2 ${sforamento ? 'text-red-800' : 'text-indigo-800'}`}>
                        {sforamento ? (
                          <>
                            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                            Fatturato oltre l'importo concordato
                          </>
                        ) : (
                          <>
                            <ClipboardList className="h-4 w-4" aria-hidden="true" />
                            Avanzamento fatturazione
                          </>
                        )}
                      </h4>
                      <span className={`text-sm font-bold ${sforamento ? 'text-red-700' : 'text-indigo-700'}`}>
                        {percentualeFatturato.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                      <div
                        className={`h-2 rounded-full transition-all ${sforamento ? 'bg-red-500' : 'bg-indigo-500'}`}
                        style={{ width: `${percentualeFatturato}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-gray-500">Concordato</p>
                        <p className="font-semibold text-gray-800">{fmt(importoConcordato)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Fatturato</p>
                        <p className="font-semibold text-gray-800">{fmt(fatturato)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">{sforamento ? 'Eccedenza' : 'Residuo'}</p>
                        <p className={`font-semibold ${sforamento ? 'text-red-600' : 'text-gray-800'}`}>
                          {fmt(sforamento ? fatturato - importoConcordato : residuoDaFatturare)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Riepilogo numerico: Costi/Margine visibili solo con payload admin */}
                <div className={hasFullFinancials ? "grid grid-cols-3 gap-3" : "grid grid-cols-1 gap-3"}>
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-center">
                    <p className="text-xs text-green-700">Fatturato</p>
                    <p className="font-bold text-green-800">{fmt(summaryData.fattureEmesse.totale)}</p>
                    <p className="text-xs text-green-600">Incassato: {fmt(summaryData.fattureEmesse.incassato)}</p>
                  </div>
                  {hasFullFinancials && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-center">
                      <p className="text-xs text-red-700">Costi</p>
                      <p className="font-bold text-red-800">{fmt(summaryData.costi.totale)}</p>
                    </div>
                  )}
                  {hasFullFinancials && (
                    <div className={`p-3 rounded-lg border text-center ${marginePositivo ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
                      <p className={`text-xs ${marginePositivo ? 'text-blue-700' : 'text-orange-700'}`}>{marginePositivo ? 'Guadagno' : 'Perdita'}</p>
                      <p className={`font-bold ${marginePositivo ? 'text-blue-800' : 'text-red-600'}`}>{fmt(summaryData.margine)}</p>
                      {summaryData.fattureEmesse.totale > 0 && typeof summaryData.marginePercentuale === 'number' && (
                        <p className={`text-xs ${marginePositivo ? 'text-blue-600' : 'text-orange-600'}`}>{summaryData.marginePercentuale.toFixed(1)}%</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Dettaglio costi: le voci admin-only sono guardate con optional chaining */}
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <h4 className="font-semibold text-gray-700 text-sm mb-2">Dettaglio costi</h4>
                  <div className="space-y-1 text-sm">
                    {summaryData.costi.fattureIngresso?.totale > 0 && (
                      <div className="flex justify-between"><span>Fornitori ({summaryData.costi.fattureIngresso.count})</span><span className="font-medium">{fmt(summaryData.costi.fattureIngresso.totale)}</span></div>
                    )}
                    {summaryData.costi.fattureConsulenti?.totale > 0 && (
                      <div className="flex justify-between"><span>Consulenti ({summaryData.costi.fattureConsulenti.count})</span><span className="font-medium">{fmt(summaryData.costi.fattureConsulenti.totale)}</span></div>
                    )}
                    {summaryData.costi.costiVivi?.totale > 0 && (
                      <div className="flex justify-between"><span>Costi vivi ({summaryData.costi.costiVivi.count})</span><span className="font-medium">{fmt(summaryData.costi.costiVivi.totale)}</span></div>
                    )}
                    {summaryData.costi.prestazioni?.totale > 0 && (
                      <div className="flex justify-between"><span>Manodopera ({summaryData.costi.prestazioni.count})</span><span className="font-medium">{fmt(summaryData.costi.prestazioni.totale)}</span></div>
                    )}
                    {!summaryData.costi.fattureIngresso?.totale && !summaryData.costi.fattureConsulenti?.totale && !summaryData.costi.costiVivi?.totale && !summaryData.costi.prestazioni?.totale && summaryData.fattureEmesse.totale === 0 && (
                      <p className="text-gray-500 text-center">Nessun dato economico registrato</p>
                    )}
                  </div>
                </div>

                {/* Pie unificato con voci dettagliate: ↑ entrate per fattura emessa, ↓ uscite per fornitore/consulente/costo vivo/risorsa */}
                {hasBreakdown && (
                  <div className="p-3 rounded-lg border border-gray-200">
                    <h4 className="font-semibold text-gray-700 text-sm mb-2">Distribuzione entrate/uscite</h4>
                    <p className="text-xs text-gray-500 mb-2">↑ entrate &nbsp;·&nbsp; ↓ uscite</p>
                    <EntrateUsciteCombinedPie
                      entrate={entrateBreakdown}
                      uscite={usciteBreakdown}
                      emptyMessage="Nessun dato economico"
                      height={360}
                    />
                  </div>
                )}

                {/* Grafico andamento temporale */}
                {timelineData.length > 1 && (
                  <div className="p-3 rounded-lg border border-gray-200">
                    <h4 className="font-semibold text-gray-700 text-sm mb-2">Andamento nel tempo</h4>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={timelineData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis dataKey="data" tick={{ fontSize: 11 }} stroke="#6B7280" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#6B7280" tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(value: number) => fmt(value)} contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                        <Legend />
                        <Line type="monotone" dataKey="entrate" stroke="#22C55E" strokeWidth={2} name="Entrate cumulative" dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="uscite" stroke="#EF4444" strokeWidth={2} name="Uscite cumulative" dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            );
          })() : null}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la commessa?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <div>Sei sicuro di voler eliminare questa commessa?</div>
              {projectToDelete && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="font-mono font-semibold text-primary text-sm mb-1">
                    {projectToDelete.code}
                  </div>
                  <div className="text-sm text-gray-700">
                    <strong>{projectToDelete.client}</strong> - {projectToDelete.city}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {projectToDelete.object}
                  </div>
                </div>
              )}
              <div className="text-red-600 font-medium mt-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Questa azione non può essere annullata.</span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteProject}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Elimina commessa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Warning: concludere senza fatture o con fatture non incassate */}
      <AlertDialog open={!!pendingStatusChange} onOpenChange={(open) => !open && setPendingStatusChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Concludere la commessa?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                if (!pendingStatusChange) return null;
                const fatt = getProjectFatturazione(pendingStatusChange.id);
                if (fatt.count === 0) {
                  return (
                    <span className="text-orange-600 font-medium inline-flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                      <span>Questa commessa non ha fatture emesse. Sei sicuro di volerla concludere?</span>
                    </span>
                  );
                }
                return (
                  <span className="text-orange-600 font-medium inline-flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                    <span>Questa commessa ha {fatt.count} fattur{fatt.count === 1 ? 'a' : 'e'} emess{fatt.count === 1 ? 'a' : 'e'} di cui {fatt.daIncassare.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} ancora da incassare. Sei sicuro di volerla concludere?</span>
                  </span>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingStatusChange) {
                  updateStatusMutation.mutate(pendingStatusChange);
                  setPendingStatusChange(null);
                }
              }}
            >
              Concludi comunque
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Nuova Commessa */}
      <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crea Nuova Commessa</DialogTitle>
          </DialogHeader>
          <NewProjectForm
            variant="dialog"
            onProjectSaved={() => setShowNewProjectDialog(false)}
            onCancel={() => setShowNewProjectDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
