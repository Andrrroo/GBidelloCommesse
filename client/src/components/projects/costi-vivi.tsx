import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Project } from "@shared/schema";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Trash2, Plus, Edit2, Car, CreditCard, Home, Coffee, MapPin, Route, Target, ArrowUp, ArrowDown, X } from "lucide-react";
import { User } from "@/hooks/useAuth";

interface CostoVivo {
  id: string;
  projectId: string;
  userId?: string;
  userName?: string;
  tipologia: 'viaggio' | 'parcheggio' | 'carburante' | 'alloggio' | 'vitto' | 'autostrada' | 'altro';
  data: string; // ISO date
  importo: number;
  descrizione: string;
  luogo?: string;
  km?: number; // per viaggi e carburante
  destinazione?: string; // per viaggi
  allegato?: string;
  note?: string;
}

interface CostiViviProps {
  user?: User | null;
}

const TIPOLOGIE_COSTO = [
  { value: 'viaggio', label: 'Viaggio', icon: <Car className="w-4 h-4" />, color: 'bg-blue-100 text-blue-700' },
  { value: 'parcheggio', label: 'Parcheggio', icon: <MapPin className="w-4 h-4" />, color: 'bg-purple-100 text-purple-700' },
  { value: 'carburante', label: 'Carburante', icon: <CreditCard className="w-4 h-4" />, color: 'bg-green-100 text-green-700' },
  { value: 'autostrada', label: 'Autostrada', icon: <Route className="w-4 h-4" />, color: 'bg-indigo-100 text-indigo-700' },
  { value: 'alloggio', label: 'Alloggio', icon: <Home className="w-4 h-4" />, color: 'bg-orange-100 text-orange-700' },
  { value: 'vitto', label: 'Vitto', icon: <Coffee className="w-4 h-4" />, color: 'bg-yellow-100 text-yellow-700' },
  { value: 'altro', label: 'Altro', icon: <CreditCard className="w-4 h-4" />, color: 'bg-gray-100 text-gray-700' },
];

export default function CostiVivi({ user }: CostiViviProps) {
  const isAdmin = user?.role === "amministratore";
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCosto, setEditingCosto] = useState<CostoVivo | null>(null);
  // Alert dialog di conferma eliminazione (sostituisce window.confirm)
  const [costoIdToDelete, setCostoIdToDelete] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filtri e ordinamento (pattern coerente con costi-generali e fatture)
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [filterTipologia, setFilterTipologia] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'data' | 'importo'>('data');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Form state
  const [formData, setFormData] = useState({
    projectId: '',
    tipologia: 'viaggio' as CostoVivo['tipologia'],
    data: format(new Date(), 'yyyy-MM-dd'),
    importo: '',
    descrizione: '',
    luogo: '',
    km: '',
    destinazione: '',
    note: '',
  });

  // Fetch projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Fetch costi vivi
  const { data: costiVivi = [] } = useQuery<CostoVivo[]>({
    queryKey: ["/api/costi-vivi"],
  });

  // Save mutation
  const saveCostoMutation = useMutation({
    mutationFn: async (data: Omit<CostoVivo, 'id'>) => {
      const url = editingCosto ? `/api/costi-vivi/${editingCosto.id}` : "/api/costi-vivi";
      const method = editingCosto ? "PUT" : "POST";
      const response = await apiRequest(method, url, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: editingCosto ? "Costo aggiornato" : "Costo registrato",
        description: editingCosto ? "Il costo vivo è stato aggiornato con successo" : "Il costo vivo è stato registrato con successo",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/costi-vivi"] });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante il salvataggio del costo",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteCostoMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/costi-vivi/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Costo eliminato",
        description: "Il costo vivo è stato eliminato con successo",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/costi-vivi"] });
    },
    onError: () => {
      toast({
        title: "Errore nell'eliminazione",
        description: "Si è verificato un errore durante l'eliminazione del costo",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const importoInCentesimi = Math.round(parseFloat(formData.importo) * 100);

    if (isNaN(importoInCentesimi) || importoInCentesimi <= 0) {
      toast({
        title: "Errore",
        description: "L'importo deve essere un numero positivo",
        variant: "destructive",
      });
      return;
    }

    const costoData: Omit<CostoVivo, 'id'> = {
      projectId: formData.projectId,
      userId: user?.id, // Traccia chi ha inserito il costo
      userName: user?.nome,
      tipologia: formData.tipologia,
      data: formData.data,
      importo: importoInCentesimi,
      descrizione: formData.descrizione,
      luogo: formData.luogo || undefined,
      km: formData.km ? parseInt(formData.km) : undefined,
      destinazione: formData.destinazione || undefined,
      note: formData.note || undefined,
    };

    saveCostoMutation.mutate(costoData);
  };

  const handleEdit = (costo: CostoVivo) => {
    setEditingCosto(costo);
    setFormData({
      projectId: costo.projectId,
      tipologia: costo.tipologia,
      data: costo.data,
      importo: (costo.importo / 100).toFixed(2),
      descrizione: costo.descrizione,
      luogo: costo.luogo || '',
      km: costo.km?.toString() || '',
      destinazione: costo.destinazione || '',
      note: costo.note || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setCostoIdToDelete(id);
  };

  const confirmDelete = () => {
    if (costoIdToDelete) {
      deleteCostoMutation.mutate(costoIdToDelete);
      setCostoIdToDelete(null);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingCosto(null);
    setFormData({
      projectId: '',
      tipologia: 'viaggio',
      data: format(new Date(), 'yyyy-MM-dd'),
      importo: '',
      descrizione: '',
      luogo: '',
      km: '',
      destinazione: '',
      note: '',
    });
  };

  // Filtro base per permessi: admin vede tutto, operativo solo i propri
  const visibleCostiVivi = isAdmin
    ? costiVivi
    : costiVivi.filter(c => c.userId === user?.id);

  // Filtri utente (applicati sopra quello permessi)
  const filteredCostiVivi = visibleCostiVivi.filter(c => {
    if (filterProjectId !== 'all' && c.projectId !== filterProjectId) return false;
    if (filterTipologia !== 'all' && c.tipologia !== filterTipologia) return false;
    return true;
  });

  // Ordinamento configurabile. Default: data decrescente (più recenti in alto).
  const sortedCostiVivi = [...filteredCostiVivi].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'data':
        cmp = new Date(a.data).getTime() - new Date(b.data).getTime();
        break;
      case 'importo':
        cmp = a.importo - b.importo;
        break;
    }
    if (cmp === 0 && sortBy !== 'data') {
      cmp = new Date(a.data).getTime() - new Date(b.data).getTime();
    }
    return sortDirection === 'asc' ? cmp : -cmp;
  });

  const toggleSortDirection = () => setSortDirection(d => d === 'asc' ? 'desc' : 'asc');

  // Calculate statistics sui costi filtrati
  const totaleSpese = filteredCostiVivi.reduce((sum, costo) => sum + costo.importo, 0);

  const speseTipologia = TIPOLOGIE_COSTO.map(tipo => ({
    ...tipo,
    totale: filteredCostiVivi
      .filter(c => c.tipologia === tipo.value)
      .reduce((sum, c) => sum + c.importo, 0),
    count: filteredCostiVivi.filter(c => c.tipologia === tipo.value).length,
  }));

  // Get project name
  const getProjectName = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    return project ? `${project.code} - ${project.client}` : projectId;
  };

  // Get tipologia config
  const getTipologiaConfig = (tipologia: string) => {
    return TIPOLOGIE_COSTO.find(t => t.value === tipologia) || TIPOLOGIE_COSTO[5];
  };

  // Group costs by project (usando i costi filtrati)
  const costiPerProgetto = projects.map(project => {
    const costiProgetto = filteredCostiVivi.filter(c => c.projectId === project.id);
    const totale = costiProgetto.reduce((sum, c) => sum + c.importo, 0);
    return {
      project,
      costi: costiProgetto,
      totale,
    };
  }).filter(item => item.costi.length > 0);

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Costi Vivi</h2>
          <p className="text-sm text-gray-500">Gestione spese dirette: viaggi, parcheggi, carburante, vitto e alloggio</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="button-g2-primary">
              <Plus className="w-4 h-4 mr-2" />
              Nuovo Costo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCosto ? "Modifica Costo Vivo" : "Registra Nuovo Costo Vivo"}</DialogTitle>
              <DialogDescription>
                Inserisci i dettagli del costo vivo da registrare
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="projectId">Commessa *</Label>
                <Select
                  value={formData.projectId}
                  onValueChange={(value) => setFormData({ ...formData, projectId: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona commessa" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.code} - {project.client}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipologia">Tipologia *</Label>
                <Select
                  value={formData.tipologia}
                  onValueChange={(value) => setFormData({ ...formData, tipologia: value as CostoVivo['tipologia'] })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona tipologia" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOLOGIE_COSTO.map((tipo) => (
                      <SelectItem key={tipo.value} value={tipo.value}>
                        <div className="flex items-center gap-2">
                          {tipo.icon}
                          <span>{tipo.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="data">Data *</Label>
                  <Input
                    id="data"
                    type="date"
                    value={formData.data}
                    onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="importo">Importo (€) *</Label>
                  <Input
                    id="importo"
                    type="number"
                    step="10"
                    min="0"
                    value={formData.importo}
                    onChange={(e) => setFormData({ ...formData, importo: e.target.value })}
                    placeholder="Es. 25.50"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="descrizione">Descrizione *</Label>
                <Input
                  id="descrizione"
                  value={formData.descrizione}
                  onChange={(e) => setFormData({ ...formData, descrizione: e.target.value })}
                  placeholder="Es. Autostrada Milano-Roma"
                  required
                />
              </div>

              {(formData.tipologia === 'viaggio' || formData.tipologia === 'carburante') && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="km">Chilometri</Label>
                    <Input
                      id="km"
                      type="number"
                      min="0"
                      value={formData.km}
                      onChange={(e) => setFormData({ ...formData, km: e.target.value })}
                      placeholder="Es. 250"
                    />
                  </div>
                  {formData.tipologia === 'viaggio' && (
                    <div className="space-y-2">
                      <Label htmlFor="destinazione">Destinazione</Label>
                      <Input
                        id="destinazione"
                        value={formData.destinazione}
                        onChange={(e) => setFormData({ ...formData, destinazione: e.target.value })}
                        placeholder="Es. Roma"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="luogo">Luogo</Label>
                <Input
                  id="luogo"
                  value={formData.luogo}
                  onChange={(e) => setFormData({ ...formData, luogo: e.target.value })}
                  placeholder="Es. Milano"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="note">Note</Label>
                <Textarea
                  id="note"
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  placeholder="Note aggiuntive..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDialog}
                >
                  Annulla
                </Button>
                <Button
                  type="submit"
                  className="button-g2-primary"
                  disabled={saveCostoMutation.isPending}
                >
                  {saveCostoMutation.isPending ? "Salvando..." : editingCosto ? "Salva Modifiche" : "Registra Costo"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filtri + Ordinamento */}
      <div className="flex gap-3 flex-wrap items-center">
        <Select value={filterProjectId} onValueChange={setFilterProjectId}>
          <SelectTrigger className="w-[200px]" aria-label="Filtra per commessa">
            <SelectValue placeholder="Tutte le commesse" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le commesse</SelectItem>
            {projects.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.code}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterTipologia} onValueChange={setFilterTipologia}>
          <SelectTrigger className="w-[180px]" aria-label="Filtra per tipologia">
            <SelectValue placeholder="Tutte le tipologie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le tipologie</SelectItem>
            {TIPOLOGIE_COSTO.map(tipo => (
              <SelectItem key={tipo.value} value={tipo.value}>
                <span className="inline-flex items-center gap-2">
                  {tipo.icon}
                  {tipo.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[200px]" aria-label="Criterio di ordinamento">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="data">Ordina per: Data</SelectItem>
              <SelectItem value="importo">Ordina per: Importo</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={toggleSortDirection}
            aria-label={sortDirection === 'asc' ? 'Ordine crescente' : 'Ordine decrescente'}
            title={sortDirection === 'asc' ? 'Ordine crescente' : 'Ordine decrescente'}
          >
            {sortDirection === 'asc'
              ? <ArrowUp className="h-4 w-4" aria-hidden="true" />
              : <ArrowDown className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </div>

        {(filterProjectId !== 'all' || filterTipologia !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setFilterProjectId('all'); setFilterTipologia('all'); }}
            className="text-gray-500 hover:text-gray-700 gap-1"
            data-testid="reset-filters-costi-vivi"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Pulisci filtri
          </Button>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500">Totale Spese</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              € {(totaleSpese / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-gray-500 mt-1">{filteredCostiVivi.length} costi registrati</p>
          </CardContent>
        </Card>

        {speseTipologia.slice(0, 3).map((tipo) => (
          <Card key={tipo.value}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                {tipo.icon}
                {tipo.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                € {(tipo.totale / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-gray-500 mt-1">{tipo.count} costi</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">Tutti i Costi</TabsTrigger>
          <TabsTrigger value="by-project">Per Commessa</TabsTrigger>
          <TabsTrigger value="by-type">Per Tipologia</TabsTrigger>
        </TabsList>

        {/* All Costs Tab */}
        <TabsContent value="all" className="space-y-4">
          {filteredCostiVivi.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-500">Nessun costo vivo registrato</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sortedCostiVivi
                .map((costo) => {
                  const tipologiaConfig = getTipologiaConfig(costo.tipologia);
                  return (
                    <Card key={costo.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${tipologiaConfig.color}`}>
                                {tipologiaConfig.icon}
                                {tipologiaConfig.label}
                              </span>
                              <span className="text-sm text-gray-500">
                                {format(parseISO(costo.data), 'dd MMM yyyy', { locale: it })}
                              </span>
                            </div>
                            <h3 className="font-semibold text-gray-900 mb-1">{costo.descrizione}</h3>
                            <p className="text-sm text-gray-600 mb-2">{getProjectName(costo.projectId)}</p>
                            <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                              {costo.luogo && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                                  {costo.luogo}
                                </span>
                              )}
                              {costo.destinazione && (
                                <span className="inline-flex items-center gap-1">
                                  <Target className="h-3.5 w-3.5" aria-hidden="true" />
                                  {costo.destinazione}
                                </span>
                              )}
                              {costo.km && (
                                <span className="inline-flex items-center gap-1">
                                  <Route className="h-3.5 w-3.5" aria-hidden="true" />
                                  {costo.km} km
                                </span>
                              )}
                            </div>
                            {costo.note && (
                              <p className="text-sm text-gray-500 mt-2 italic">{costo.note}</p>
                            )}
                          </div>
                          <div className="flex items-start gap-3 ml-4">
                            <div className="text-right">
                              <div className="text-2xl font-bold text-gray-900">
                                € {(costo.importo / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleEdit(costo)}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleDelete(costo.id)}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          )}
        </TabsContent>

        {/* By Project Tab */}
        <TabsContent value="by-project" className="space-y-4">
          {costiPerProgetto.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-500">Nessun costo vivo registrato</p>
              </CardContent>
            </Card>
          ) : (
            costiPerProgetto.map(({ project, costi, totale }) => (
              <Card key={project.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{project.code} - {project.client}</CardTitle>
                      <CardDescription>{project.object}</CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">
                        € {(totale / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <p className="text-sm text-gray-500">{costi.length} costi</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {costi
                      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
                      .map((costo) => {
                        const tipologiaConfig = getTipologiaConfig(costo.tipologia);
                        return (
                          <div key={costo.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                            <div className="flex items-center gap-3 flex-1">
                              <span className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 ${tipologiaConfig.color}`}>
                                {tipologiaConfig.icon}
                                {tipologiaConfig.label}
                              </span>
                              <div>
                                <p className="font-medium text-gray-900">{costo.descrizione}</p>
                                <div className="flex gap-3 text-xs text-gray-500 mt-1">
                                  <span>{format(parseISO(costo.data), 'dd MMM yyyy', { locale: it })}</span>
                                  {costo.luogo && (
                                    <span className="inline-flex items-center gap-1">
                                      <MapPin className="h-3 w-3" aria-hidden="true" />
                                      {costo.luogo}
                                    </span>
                                  )}
                                  {costo.km && (
                                    <span className="inline-flex items-center gap-1">
                                      <Route className="h-3 w-3" aria-hidden="true" />
                                      {costo.km} km
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">
                                € {(costo.importo / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(costo)}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(costo.id)}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* By Type Tab */}
        <TabsContent value="by-type" className="space-y-4">
          {filteredCostiVivi.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-500">Nessun costo vivo registrato</p>
              </CardContent>
            </Card>
          ) : TIPOLOGIE_COSTO.map((tipo) => {
            const costiTipo = filteredCostiVivi.filter(c => c.tipologia === tipo.value);
            const totaleTipo = costiTipo.reduce((sum, c) => sum + c.importo, 0);

            if (costiTipo.length === 0) return null;

            return (
              <Card key={tipo.value}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="flex items-center gap-2">
                      {tipo.icon}
                      {tipo.label}
                    </CardTitle>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">
                        € {(totaleTipo / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <p className="text-sm text-gray-500">{costiTipo.length} costi</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {costiTipo
                      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
                      .map((costo) => (
                        <div key={costo.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{costo.descrizione}</p>
                            <div className="flex gap-3 text-xs text-gray-500 mt-1">
                              <span>{getProjectName(costo.projectId)}</span>
                              <span>•</span>
                              <span>{format(parseISO(costo.data), 'dd MMM yyyy', { locale: it })}</span>
                              {costo.luogo && (
                                <>
                                  <span>•</span>
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="h-3 w-3" aria-hidden="true" />
                                    {costo.luogo}
                                  </span>
                                </>
                              )}
                              {costo.km && (
                                <>
                                  <span>•</span>
                                  <span className="inline-flex items-center gap-1">
                                    <Route className="h-3 w-3" aria-hidden="true" />
                                    {costo.km} km
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">
                              € {(costo.importo / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(costo)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(costo.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      {/* Dialog di conferma eliminazione costo (sostituisce window.confirm) */}
      <AlertDialog open={!!costoIdToDelete} onOpenChange={(open) => !open && setCostoIdToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il costo?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione non può essere annullata. Il costo verrà rimosso definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
