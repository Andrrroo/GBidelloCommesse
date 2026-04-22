import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { UserPlus, Users, Clock, TrendingUp, Trash2, Edit, Wallet } from "lucide-react";
import { type Project, type Dipendente } from "@shared/schema";
import { DIPENDENTE_ROLES as ROLES, getRoleLabel } from "@/lib/dipendenti-roles";

interface ProjectResource {
  id: string;
  projectId: string;
  userName: string;
  userEmail?: string;
  role: string;
  oreAssegnate: number;
  oreLavorate: number;
  orePagate?: number;
  costoOrario: number;
  isResponsabile: boolean;
  dataInizio?: string;
  dataFine?: string;
  dipendenteId?: string;
}


type ResourceSource = 'anagrafica' | 'esterna';

export default function GestioneRisorse() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<ProjectResource | null>(null);
  const [resourceIdToDelete, setResourceIdToDelete] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string>("");
  // Distinzione tra risorsa dall'anagrafica dipendenti (default) e risorsa
  // "esterna" inserita a mano (es. freelance occasionale, consulente una tantum)
  // per cui non ha senso creare un record in anagrafica.
  const [resourceSource, setResourceSource] = useState<ResourceSource>('anagrafica');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin: isAdminFn } = useAuth();
  const isAdmin = isAdminFn();

  const [formData, setFormData] = useState({
    dipendenteId: "",
    userName: "",
    userEmail: "",
    role: "progettista",
    oreAssegnate: "" as string | number,
    oreLavorate: "" as string | number,
    orePagate: "" as string | number,
    costoOrario: "" as string | number,
    isResponsabile: false,
    dataInizio: "",
    dataFine: ""
  });

  // Fetch collaboratori anagrafica
  const { data: collaboratori = [] } = useQuery<Dipendente[]>({
    queryKey: ["/api/dipendenti"]
  });

  // Fetch progetti
  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"]
  });

  // Fetch risorse
  const { data: resources, isLoading } = useQuery<ProjectResource[]>({
    queryKey: ["/api/project-resources"]
  });

  // Create/Update resource mutation
  const saveResourceMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = editingResource
        ? `/api/project-resources/${editingResource.id}`
        : "/api/project-resources";
      const method = editingResource ? "PUT" : "POST";
      const res = await apiRequest(method, url, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-resources"] });
      toast({
        title: editingResource ? "Risorsa aggiornata" : "Risorsa aggiunta",
        description: "La risorsa è stata salvata con successo"
      });
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Delete resource mutation
  const deleteResourceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/project-resources/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-resources"] });
      toast({
        title: "Risorsa eliminata",
        description: "La risorsa è stata rimossa con successo"
      });
    }
  });

  const resetForm = () => {
    setFormData({
      dipendenteId: "",
      userName: "",
      userEmail: "",
      role: "progettista",
      oreAssegnate: "",
      oreLavorate: "",
      orePagate: "",
      costoOrario: "",
      isResponsabile: false,
      dataInizio: "",
      dataFine: ""
    });
    setSelectedProject("");
    setEditingResource(null);
    setResourceSource('anagrafica');
    setIsDialogOpen(false);
  };

  const handleSelectCollaboratore = (dipendenteId: string) => {
    const c = collaboratori.find(x => x.id === dipendenteId);
    if (!c) return;
    setFormData(prev => ({
      ...prev,
      dipendenteId,
      userName: `${c.nome} ${c.cognome}`,
      userEmail: c.email || "",
      costoOrario: c.costoOrario,
      role: c.ruolo || prev.role,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProject) {
      toast({
        title: "Errore",
        description: "Seleziona una commessa",
        variant: "destructive"
      });
      return;
    }

    if (resourceSource === 'anagrafica' && !formData.dipendenteId) {
      toast({
        title: "Errore",
        description: "Seleziona un dipendente dall'anagrafica o passa a 'Risorsa esterna'",
        variant: "destructive",
      });
      return;
    }

    if (!formData.userName || !String(formData.userName).trim()) {
      toast({
        title: "Errore",
        description: "Il nome della risorsa è obbligatorio",
        variant: "destructive",
      });
      return;
    }

    const payload: any = {
      projectId: selectedProject,
      userName: String(formData.userName).trim(),
      role: formData.role,
      oreAssegnate: parseFloat(String(formData.oreAssegnate)) || 0,
      oreLavorate: parseFloat(String(formData.oreLavorate)) || 0,
      orePagate: parseFloat(String(formData.orePagate)) || 0,
      costoOrario: Math.round((parseFloat(String(formData.costoOrario)) || 0) * 100),
      isResponsabile: formData.isResponsabile,
    };
    if (formData.userEmail) payload.userEmail = formData.userEmail;
    if (formData.dataInizio) payload.dataInizio = formData.dataInizio;
    if (formData.dataFine) payload.dataFine = formData.dataFine;
    // dipendenteId solo se in modalità anagrafica
    if (resourceSource === 'anagrafica' && formData.dipendenteId) {
      payload.dipendenteId = formData.dipendenteId;
    }

    saveResourceMutation.mutate(payload);
  };

  const handleEdit = (resource: ProjectResource) => {
    setEditingResource(resource);
    setSelectedProject(resource.projectId);
    // Se la risorsa ha un dipendenteId legato all'anagrafica la apriamo in
    // modalità "anagrafica", altrimenti è una risorsa esterna (inserita a mano)
    setResourceSource(resource.dipendenteId ? 'anagrafica' : 'esterna');
    setFormData({
      dipendenteId: resource.dipendenteId || "",
      userName: resource.userName,
      userEmail: resource.userEmail || "",
      role: resource.role,
      oreAssegnate: resource.oreAssegnate,
      oreLavorate: resource.oreLavorate,
      orePagate: resource.orePagate ?? 0,
      costoOrario: resource.costoOrario / 100,
      isResponsabile: resource.isResponsabile,
      dataInizio: resource.dataInizio?.split('T')[0] || "",
      dataFine: resource.dataFine?.split('T')[0] || ""
    });
    setIsDialogOpen(true);
  };

  // Calcola statistiche
  const projectResourceStats = projects?.map(project => {
    const projectResources = resources?.filter(r => r.projectId === project.id) || [];
    const totalOreAssegnate = projectResources.reduce((sum, r) => sum + r.oreAssegnate, 0);
    const totalOreLavorate = projectResources.reduce((sum, r) => sum + r.oreLavorate, 0);
    // costoOrario è rimosso dal payload per non-admin (sanitize server-side):
    // usiamo `|| 0` per evitare NaN nei calcoli, tanto la UI che usa questo
    // valore è gated dietro `isAdmin`.
    const totalCosti = projectResources.reduce((sum, r) => sum + (r.oreLavorate * (r.costoOrario || 0)), 0);
    const responsabile = projectResources.find(r => r.isResponsabile);

    return {
      project,
      resources: projectResources,
      totalOreAssegnate,
      totalOreLavorate,
      totalCosti,
      responsabile,
      percentualeCompletamento: totalOreAssegnate > 0
        ? Math.round((totalOreLavorate / totalOreAssegnate) * 100)
        : 0
    };
  }) || [];

  const overallStats = {
    totalRisorse: resources?.length || 0,
    totalOreAssegnate: resources?.reduce((sum, r) => sum + r.oreAssegnate, 0) || 0,
    totalOreLavorate: resources?.reduce((sum, r) => sum + r.oreLavorate, 0) || 0,
    totalCosti: resources?.reduce((sum, r) => sum + (r.oreLavorate * (r.costoOrario || 0)), 0) || 0
  };

  return (
    <div className="space-y-6">
      {/* Header con statistiche */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestione Risorse</h2>
          <p className="text-gray-600 mt-1">Assegnazione e monitoraggio risorse per commessa</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <UserPlus className="w-4 h-4 mr-2" />
              Assegna Risorsa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingResource ? "Modifica Risorsa" : "Assegna Nuova Risorsa"}</DialogTitle>
              <DialogDescription>
                Assegna una risorsa ad una commessa e definisci il ruolo e le ore stimate
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="project">Commessa *</Label>
                <Select
                  value={selectedProject}
                  onValueChange={setSelectedProject}
                  disabled={!!editingResource}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona commessa" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map(project => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.code} - {project.object}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Toggle tipo risorsa: anagrafica vs esterna */}
              <div>
                <Label>Tipo risorsa *</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResourceSource('anagrafica');
                      // Reset campi manuali se stai passando dall'esterna
                      setFormData(prev => ({
                        ...prev,
                        dipendenteId: "",
                        userName: "",
                        userEmail: "",
                        costoOrario: "",
                      }));
                    }}
                    className={`p-3 rounded-md border-2 text-left text-sm transition-all ${
                      resourceSource === 'anagrafica'
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                    data-testid="resource-source-anagrafica"
                  >
                    <div className="font-medium">Dall'anagrafica</div>
                    <div className="text-xs text-gray-600">Dipendente interno registrato</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResourceSource('esterna');
                      setFormData(prev => ({
                        ...prev,
                        dipendenteId: "",
                      }));
                    }}
                    className={`p-3 rounded-md border-2 text-left text-sm transition-all ${
                      resourceSource === 'esterna'
                        ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                    data-testid="resource-source-esterna"
                  >
                    <div className="font-medium">Esterna</div>
                    <div className="text-xs text-gray-600">Freelance o risorsa occasionale</div>
                  </button>
                </div>
              </div>

              {resourceSource === 'anagrafica' ? (
                <div>
                  <Label htmlFor="collaboratore">Dipendente *</Label>
                  <Select
                    value={formData.dipendenteId}
                    onValueChange={handleSelectCollaboratore}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona dall'anagrafica dipendenti" />
                    </SelectTrigger>
                    <SelectContent>
                      {collaboratori.filter(c => c.active).length === 0 ? (
                        <div className="px-2 py-3 text-sm text-gray-500">
                          Nessun dipendente in anagrafica. Chiedi all'admin di crearne uno
                          oppure passa a "Risorsa esterna".
                        </div>
                      ) : (
                        collaboratori.filter(c => c.active).map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome} {c.cognome} {c.ruolo ? `— ${c.ruolo}` : ""}{isAdmin && c.costoOrario !== undefined ? ` (${new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(c.costoOrario)}/h)` : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {formData.userName && (
                    <p className="text-xs text-gray-500 mt-1">Selezionato: <strong>{formData.userName}</strong></p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="userNameExt">Nome e cognome *</Label>
                    <Input
                      id="userNameExt"
                      placeholder="Es. Mario Rossi"
                      value={formData.userName}
                      onChange={(e) => setFormData({ ...formData, userName: e.target.value })}
                      data-testid="input-username-esterna"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Non verrà creato un record in anagrafica
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="userEmailExt">Email (opzionale)</Label>
                    <Input
                      id="userEmailExt"
                      type="email"
                      placeholder="mario.rossi@esempio.com"
                      value={formData.userEmail}
                      onChange={(e) => setFormData({ ...formData, userEmail: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="role">Ruolo *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map(role => {
                      const Icon = role.icon;
                      return (
                        <SelectItem key={role.value} value={role.value}>
                          <span className="inline-flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            {role.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Per collaboratori interni il costoOrario è gestito in anagrafica
                  (il server lo sovrascrive dal record anagrafica in POST/PUT)
                  quindi il campo è visibile solo per risorse esterne agli admin. */}
              <div className={isAdmin && resourceSource === 'esterna' ? "grid grid-cols-2 gap-4" : ""}>
                <div>
                  <Label htmlFor="oreAssegnate">Ore Assegnate</Label>
                  <Input
                    id="oreAssegnate"
                    type="number"
                    value={formData.oreAssegnate}
                    onChange={(e) => setFormData({ ...formData, oreAssegnate: e.target.value })}
                    min="0"
                  />
                </div>
                {isAdmin && resourceSource === 'esterna' && (
                  <div>
                    <Label htmlFor="costoOrario">Costo Orario (€)</Label>
                    <Input
                      id="costoOrario"
                      type="number"
                      step="5"
                      value={formData.costoOrario}
                      onChange={(e) => setFormData({ ...formData, costoOrario: e.target.value })}
                      min="0"
                      placeholder="Inserisci il costo orario"
                    />
                    <p className="text-xs text-gray-500 mt-1">Campo obbligatorio per risorse esterne (freelance/consulenti)</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="oreLavorate">Ore Lavorate</Label>
                  <Input
                    id="oreLavorate"
                    type="number"
                    value={formData.oreLavorate}
                    onChange={(e) => setFormData({ ...formData, oreLavorate: e.target.value })}
                    min="0"
                  />
                </div>
                <div>
                  <Label htmlFor="orePagate">Ore Pagate</Label>
                  <Input
                    id="orePagate"
                    type="number"
                    value={formData.orePagate}
                    onChange={(e) => setFormData({ ...formData, orePagate: e.target.value })}
                    min="0"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {(() => {
                      const lav = parseFloat(String(formData.oreLavorate)) || 0;
                      const pag = parseFloat(String(formData.orePagate)) || 0;
                      const diff = lav - pag;
                      if (diff > 0) return `${diff} ore ancora da pagare`;
                      if (diff < 0) return `${Math.abs(diff)} ore pagate in eccesso`;
                      return lav > 0 ? "Tutte le ore sono state pagate" : "";
                    })()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="dataInizio">Data Inizio</Label>
                  <Input
                    id="dataInizio"
                    type="date"
                    value={formData.dataInizio}
                    onChange={(e) => setFormData({ ...formData, dataInizio: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="dataFine">Data Fine Prevista</Label>
                  <Input
                    id="dataFine"
                    type="date"
                    value={formData.dataFine}
                    onChange={(e) => setFormData({ ...formData, dataFine: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isResponsabile"
                  checked={formData.isResponsabile}
                  onChange={(e) => setFormData({ ...formData, isResponsabile: e.target.checked })}
                  className="rounded"
                />
                <Label htmlFor="isResponsabile" className="font-normal">
                  Responsabile di Commessa
                </Label>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Annulla
                </Button>
                <Button type="submit" disabled={saveResourceMutation.isPending}>
                  {saveResourceMutation.isPending ? "Salvataggio..." : "Salva"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistiche Globali */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Risorse Totali</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{overallStats.totalRisorse}</div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Ore Assegnate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{overallStats.totalOreAssegnate}h</div>
              <Clock className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Ore Lavorate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{overallStats.totalOreLavorate}h</div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Costi Totali</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">
                  €{(overallStats.totalCosti / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                </div>
                <Wallet className="h-6 w-6 text-green-600" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabelle Risorse per Commessa */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">Tutte le Risorse</TabsTrigger>
          <TabsTrigger value="by-project">Per Commessa</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4 data-[state=active]:animate-fade-in">
          <Card>
            <CardHeader>
              <CardTitle>Tutte le Risorse</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center text-gray-500 py-8">Caricamento...</p>
              ) : resources?.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Nessuna risorsa assegnata</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4">Risorsa</th>
                        <th className="text-left py-3 px-4">Commessa</th>
                        <th className="text-left py-3 px-4">Ruolo</th>
                        <th className="text-right py-3 px-4">Ore Ass./Lav.</th>
                        {isAdmin && <th className="text-right py-3 px-4">Costo Orario</th>}
                        {isAdmin && <th className="text-right py-3 px-4">Costo Totale</th>}
                        <th className="text-center py-3 px-4">Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resources?.map(resource => {
                        const project = projects?.find(p => p.id === resource.projectId);
                        const roleInfo = ROLES.find(r => r.value === resource.role);
                        const costoTotale = resource.oreLavorate * resource.costoOrario;

                        return (
                          <tr key={resource.id} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4">
                              <div>
                                <div className="font-medium">{resource.userName}</div>
                                {resource.userEmail && (
                                  <div className="text-sm text-gray-500">{resource.userEmail}</div>
                                )}
                                {resource.isResponsabile && (
                                  <Badge variant="secondary" className="mt-1">Responsabile</Badge>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="text-sm">
                                <div className="font-medium">{project?.code}</div>
                                <div className="text-gray-500 truncate max-w-xs">{project?.object}</div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant="outline" className="inline-flex items-center gap-1">
                                {roleInfo && (() => {
                                  const Icon = roleInfo.icon;
                                  return <Icon className="h-3 w-3" aria-hidden="true" />;
                                })()}
                                {roleInfo?.label}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="text-sm">
                                <div>{resource.oreLavorate}h / {resource.oreAssegnate}h</div>
                                <div className="text-gray-500">
                                  {resource.oreAssegnate > 0
                                    ? Math.round((resource.oreLavorate / resource.oreAssegnate) * 100)
                                    : 0}%
                                </div>
                              </div>
                            </td>
                            {isAdmin && (
                              <td className="py-3 px-4 text-right">
                                €{(resource.costoOrario / 100).toFixed(2)}
                              </td>
                            )}
                            {isAdmin && (
                              <td className="py-3 px-4 text-right font-medium">
                                €{(costoTotale / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                              </td>
                            )}
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEdit(resource)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setResourceIdToDelete(resource.id)}
                                >
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-project" className="space-y-4 data-[state=active]:animate-fade-in">
          {projectResourceStats.map(stat => (
            <Card key={stat.project.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{stat.project.code}</CardTitle>
                    <CardDescription className="mt-1">{stat.project.object}</CardDescription>
                  </div>
                  <div className="text-right">
                    {stat.responsabile && (
                      <div className="text-sm">
                        <div className="font-medium">Responsabile:</div>
                        <div className="text-gray-600">{stat.responsabile.userName}</div>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {stat.resources.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">Nessuna risorsa assegnata</p>
                ) : (
                  <>
                    <div className={isAdmin ? "grid grid-cols-4 gap-4 mb-4" : "grid grid-cols-3 gap-4 mb-4"}>
                      <div className="text-center p-3 bg-blue-50 rounded-lg">
                        <div className="text-sm text-gray-600">Risorse</div>
                        <div className="text-xl font-bold">{stat.resources.length}</div>
                      </div>
                      <div className="text-center p-3 bg-orange-50 rounded-lg">
                        <div className="text-sm text-gray-600">Ore Assegnate</div>
                        <div className="text-xl font-bold">{stat.totalOreAssegnate}h</div>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <div className="text-sm text-gray-600">Ore Lavorate</div>
                        <div className="text-xl font-bold">{stat.totalOreLavorate}h</div>
                      </div>
                      {isAdmin && (
                        <div className="text-center p-3 bg-purple-50 rounded-lg">
                          <div className="text-sm text-gray-600">Costo Totale</div>
                          <div className="text-xl font-bold">
                            €{(stat.totalCosti / 100).toLocaleString('it-IT', { minimumFractionDigits: 0 })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      {stat.resources.map(resource => {
                        const roleInfo = ROLES.find(r => r.value === resource.role);
                        return (
                          <div key={resource.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                            <div className="flex items-center gap-3">
                              <div>
                                <div className="font-medium">{resource.userName}</div>
                                <div className="text-sm text-gray-500 inline-flex items-center gap-1">
                                  {roleInfo && (() => {
                                    const Icon = roleInfo.icon;
                                    return <Icon className="h-3 w-3" aria-hidden="true" />;
                                  })()}
                                  {roleInfo?.label}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right text-sm">
                                <div className="text-gray-600">Ore: {resource.oreLavorate}/{resource.oreAssegnate}</div>
                                {isAdmin && (
                                  <div className="font-medium">
                                    €{((resource.oreLavorate * resource.costoOrario) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEdit(resource)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setResourceIdToDelete(resource.id)}
                                >
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Conferma eliminazione risorsa */}
      <AlertDialog open={!!resourceIdToDelete} onOpenChange={(open) => !open && setResourceIdToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la risorsa?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (resourceIdToDelete) deleteResourceMutation.mutate(resourceIdToDelete);
                setResourceIdToDelete(null);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
