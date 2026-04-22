import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, invalidateDashboard } from "@/lib/queryClient";
import { Plus, Pencil, Trash2, Building, Check, Clock, Euro, Download, ArrowUp, ArrowDown, X, Users } from "lucide-react";
import type { CostoGenerale, Collaboratore } from "@shared/schema";
import { formatCurrency, formatCurrencyFromCents, formatDate, toCents, fromCents } from "@/lib/financial-utils";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/table-pagination";
import { useAuth } from "@/hooks/useAuth";

const CATEGORIE = {
  noleggio_auto: "Noleggio Auto",
  fitto_ufficio: "Fitto Ufficio",
  energia: "Energia",
  internet_dati: "Internet/Dati",
  giardiniere: "Giardiniere",
  pulizie: "Pulizie",
  multe: "Multe",
  assicurazioni: "Assicurazioni",
  commercialista: "Commercialista",
  stipendi: "Stipendi/Buste Paga",
  altro: "Altro"
};

// Categoria "stipendi" è payroll sensibile e va mostrata solo agli admin:
// nei dropdown (creazione + filtri) e come label nelle righe (il server
// già filtra le righe stipendi dalla lista per non-admin, ma questo evita
// che rimangano voci "fantasma" se il server dovesse cambiare risposta).
const CATEGORIE_ADMIN_ONLY: Array<keyof typeof CATEGORIE> = ["stipendi"];

export default function CostiGenerali() {
  const tableTopRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCosto, setEditingCosto] = useState<CostoGenerale | null>(null);
  const [costoIdToDelete, setCostoIdToDelete] = useState<string | null>(null);
  const [filterCategoria, setFilterCategoria] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterFornitore, setFilterFornitore] = useState<string>("all");
  const [sortBy, setSortBy] = useState<'data' | 'importo'>('data');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Categorie effettivamente visibili all'utente corrente (stipendi solo admin).
  const admin = isAdmin();
  const visibleCategorie = Object.entries(CATEGORIE).filter(
    ([key]) => admin || !CATEGORIE_ADMIN_ONLY.includes(key as keyof typeof CATEGORIE)
  );

  const [formData, setFormData] = useState({
    categoria: "altro" as keyof typeof CATEGORIE,
    fornitore: "",
    descrizione: "",
    data: new Date().toISOString().split('T')[0],
    dataScadenza: "",
    importo: "" as string | number,
    pagato: false,
    dataPagamento: "",
    allegato: "",
    note: "",
    collaboratoreId: "" as string,
  });

  // Collaboratori dipendenti per il Select "Stipendi" (solo attivi + flag dipendente).
  // stipendioMensile è presente solo per admin (sanitize lato server).
  const { data: collaboratori = [] } = useQuery<Collaboratore[]>({
    queryKey: ["/api/collaboratori"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/collaboratori");
      if (!response.ok) throw new Error("Failed to fetch collaboratori");
      return response.json();
    },
  });
  const dipendentiAttivi = collaboratori.filter(c => c.active && c.isDipendente);

  const { data: costi = [], isLoading } = useQuery<CostoGenerale[]>({
    queryKey: ["/api/costi-generali"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/costi-generali");
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/costi-generali", data);
      if (!response.ok) throw new Error("Failed to create");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/costi-generali"] });
      invalidateDashboard();
      toast({ title: "Successo", description: "Costo creato con successo" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Errore", description: "Errore durante la creazione", variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const response = await apiRequest("PUT", `/api/costi-generali/${id}`, data);
      if (!response.ok) throw new Error("Failed to update");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/costi-generali"] });
      invalidateDashboard();
      toast({ title: "Successo", description: "Costo aggiornato con successo" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Errore", description: "Errore durante l'aggiornamento", variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/costi-generali/${id}`);
      if (!response.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/costi-generali"] });
      invalidateDashboard();
      toast({ title: "Successo", description: "Costo eliminato con successo" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Errore durante l'eliminazione", variant: "destructive" });
    }
  });

  const resetForm = () => {
    setFormData({
      categoria: "altro",
      fornitore: "",
      descrizione: "",
      data: new Date().toISOString().split('T')[0],
      dataScadenza: "",
      importo: "",
      pagato: false,
      dataPagamento: "",
      allegato: "",
      note: "",
      collaboratoreId: "",
    });
    setEditingCosto(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (costo: CostoGenerale) => {
    setEditingCosto(costo);
    setFormData({
      categoria: costo.categoria,
      fornitore: costo.fornitore,
      descrizione: costo.descrizione,
      data: costo.data,
      dataScadenza: costo.dataScadenza || "",
      importo: costo.importo,
      pagato: costo.pagato,
      dataPagamento: costo.dataPagamento || "",
      allegato: costo.allegato || "",
      note: costo.note || "",
      collaboratoreId: costo.collaboratoreId || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Per gli stipendi il Select dipendenti è obbligatorio: feedback inline
    // invece che attendere il 400 del server.
    if (formData.categoria === "stipendi" && !formData.collaboratoreId) {
      toast({
        title: "Dipendente non selezionato",
        description: "Seleziona un dipendente per registrare la busta paga.",
        variant: "destructive",
      });
      return;
    }

    const cleanData: Record<string, any> = {
      ...formData,
      importo: parseFloat(String(formData.importo)) || 0,
    };
    // Rimuovi campi vuoti per evitare errori di validazione Zod sugli enum opzionali
    if (!cleanData.dataScadenza) delete cleanData.dataScadenza;
    if (!cleanData.dataPagamento) delete cleanData.dataPagamento;
    if (!cleanData.allegato) delete cleanData.allegato;
    if (!cleanData.note) delete cleanData.note;
    // collaboratoreId è valorizzato solo per categoria "stipendi". Se vuoto
    // non va inviato (il campo è opzionale nello schema).
    if (!cleanData.collaboratoreId) delete cleanData.collaboratoreId;
    const submitData = cleanData;
    if (editingCosto) {
      updateMutation.mutate({ id: editingCosto.id, data: submitData as any });
    } else {
      createMutation.mutate(submitData as any);
    }
  };

  const togglePagato = async (costo: CostoGenerale) => {
    const newStatus = !costo.pagato;
    await updateMutation.mutateAsync({
      id: costo.id,
      data: {
        pagato: newStatus,
        dataPagamento: newStatus ? new Date().toISOString().split('T')[0] : ""
      }
    });
  };

  // Lista fornitori disponibili per il filtro (distinti, non vuoti, alfabetico)
  const availableFornitori = Array.from(
    new Set(costi.map(c => c.fornitore?.trim()).filter((v): v is string => !!v && v.length > 0))
  ).sort((a, b) => a.localeCompare(b, 'it'));

  const filteredCosti = costi.filter(c => {
    if (filterCategoria !== "all" && c.categoria !== filterCategoria) return false;
    if (filterFornitore !== "all" && (c.fornitore || '').trim() !== filterFornitore) return false;
    if (filterStatus === "pagati" && !c.pagato) return false;
    if (filterStatus === "da_pagare" && c.pagato) return false;
    return true;
  });

  // Ordinamento configurabile. Default: data decrescente (più recenti in alto),
  // coerente con l'uso tipico (ultime spese registrate prima).
  const sortedCosti = [...filteredCosti].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'data':
        cmp = new Date(a.data).getTime() - new Date(b.data).getTime();
        break;
      case 'importo':
        cmp = a.importo - b.importo;
        break;
    }
    // Tie-break stabile sulla data (più recente prima) quando il criterio primario è equivalente
    if (cmp === 0 && sortBy !== 'data') {
      cmp = new Date(a.data).getTime() - new Date(b.data).getTime();
    }
    return sortDirection === 'asc' ? cmp : -cmp;
  });

  const toggleSortDirection = () => setSortDirection(d => d === 'asc' ? 'desc' : 'asc');

  const pagination = usePagination<CostoGenerale>({
    data: sortedCosti,
    pageSize: 25,
    resetKey: `${filterCategoria}|${filterFornitore}|${filterStatus}|${sortBy}|${sortDirection}`,
  });

  const totaleCosti = filteredCosti.reduce((acc, c) => acc + c.importo, 0);
  const totalePagati = filteredCosti.filter(c => c.pagato).reduce((acc, c) => acc + c.importo, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={filterCategoria} onValueChange={setFilterCategoria}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tutte le categorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le categorie</SelectItem>
              {visibleCategorie.map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filterFornitore}
            onValueChange={setFilterFornitore}
            disabled={availableFornitori.length === 0}
          >
            <SelectTrigger className="w-[200px]" aria-label="Filtra per fornitore">
              <SelectValue placeholder="Tutti i fornitori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i fornitori</SelectItem>
              {availableFornitori.map(f => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Tutti" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              <SelectItem value="pagati">Pagati</SelectItem>
              <SelectItem value="da_pagare">Da pagare</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[180px]" aria-label="Criterio di ordinamento">
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
          {(filterCategoria !== "all" || filterFornitore !== "all" || filterStatus !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterCategoria("all");
                setFilterFornitore("all");
                setFilterStatus("all");
              }}
              className="text-gray-500 hover:text-gray-700 gap-1"
              data-testid="reset-filters-costi-generali"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Pulisci filtri
            </Button>
          )}
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nuovo Costo Generale
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Totale Costi</span>
              <Building className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totaleCosti)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Pagati</span>
              <Check className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalePagati)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Da Pagare</span>
              <Clock className="h-4 w-4 text-red-500" />
            </div>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totaleCosti - totalePagati)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 animate-pulse space-y-2">
              <div className="h-10 bg-gray-200 rounded-md"></div>
              <div className="h-10 bg-gray-200 rounded-md"></div>
            </div>
          ) : filteredCosti.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Nessun costo generale registrato</p>
          ) : (
            <div ref={tableTopRef} className="overflow-x-auto scroll-mt-24">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead>{admin ? "Fornitore / Dipendente" : "Fornitore"}</TableHead>
                    <TableHead>Descrizione</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Scadenza</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                    <TableHead className="text-center">Stato</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.pageItems.map((costo) => (
                    <TableRow key={costo.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {CATEGORIE[costo.categoria]}
                        </div>
                      </TableCell>
                      <TableCell>
                        {costo.categoria === "stipendi" ? (
                          <span className="inline-flex items-center gap-1.5 text-blue-700">
                            <Users className="h-3.5 w-3.5" aria-hidden="true" />
                            {costo.fornitore}
                          </span>
                        ) : (
                          costo.fornitore
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{costo.descrizione}</TableCell>
                      <TableCell>{formatDate(costo.data)}</TableCell>
                      <TableCell>{costo.dataScadenza ? formatDate(costo.dataScadenza) : "-"}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(costo.importo)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={costo.pagato ? "default" : "destructive"}
                          className="cursor-pointer"
                          onClick={() => togglePagato(costo)}
                        >
                          {costo.pagato ? "Pagato" : "Da pagare"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {costo.allegato && (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={costo.allegato} target="_blank" rel="noopener noreferrer">
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(costo)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCostoIdToDelete(costo.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination pagination={pagination} scrollTopRef={tableTopRef} />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCosto ? "Modifica Costo" : "Nuovo Costo Generale"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="categoria">Categoria *</Label>
                <Select
                  value={formData.categoria}
                  onValueChange={(value) => {
                    const next = value as keyof typeof CATEGORIE;
                    setFormData(prev => {
                      // Il payee ha regole diverse tra stipendi (select chiuso su
                      // dipendenti) e fornitori (free text). Quando si passa
                      // da un tipo all'altro resettiamo il payee + collaboratoreId
                      // per evitare mismatch (es. "ENEL" come nome dipendente).
                      const changingFromOrToStipendi = (prev.categoria === "stipendi") !== (next === "stipendi");
                      return {
                        ...prev,
                        categoria: next,
                        ...(changingFromOrToStipendi ? { fornitore: "", collaboratoreId: "" } : {}),
                      };
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleCategorie.map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fornitore">
                  {formData.categoria === "stipendi" ? "Dipendente *" : "Fornitore *"}
                </Label>
                {formData.categoria === "stipendi" ? (
                  // Per gli stipendi: select chiuso sui soli dipendenti attivi.
                  // Nessun testo libero per evitare errori di battitura e
                  // per poter auto-popolare importo + collaboratoreId.
                  <>
                  <Select
                    value={formData.collaboratoreId || ""}
                    disabled={!!editingCosto}
                    onValueChange={(value) => {
                      const c = dipendentiAttivi.find(d => d.id === value);
                      if (!c) return;
                      setFormData(prev => ({
                        ...prev,
                        collaboratoreId: c.id,
                        fornitore: `${c.nome} ${c.cognome}`.trim(),
                        // Auto-popola l'importo solo se lo stipendio è
                        // visibile (admin). Per i non-admin il campo rimane
                        // editabile manualmente.
                        importo: typeof c.stipendioMensile === 'number' && c.stipendioMensile > 0
                          ? c.stipendioMensile
                          : prev.importo,
                      }));
                    }}
                  >
                    <SelectTrigger id="fornitore" aria-label="Seleziona dipendente">
                      <SelectValue placeholder={dipendentiAttivi.length === 0
                        ? "Nessun dipendente configurato"
                        : "Seleziona un dipendente..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {dipendentiAttivi.length === 0 ? (
                        <div className="px-2 py-2 text-sm text-gray-500">
                          Nessun dipendente attivo. Vai in Anagrafica Collaboratori per configurarli.
                        </div>
                      ) : (
                        dipendentiAttivi.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome} {c.cognome}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {editingCosto && (
                    <p className="text-xs text-gray-500">
                      Il dipendente associato alla busta paga non è modificabile. Per cambiarlo, elimina e ricrea la busta.
                    </p>
                  )}
                  </>
                ) : (
                  <>
                    <Input
                      id="fornitore"
                      list="fornitori-costi-generali"
                      value={formData.fornitore}
                      onChange={(e) => setFormData(prev => ({ ...prev, fornitore: e.target.value }))}
                      placeholder="Inizia a scrivere o scegli uno già usato..."
                      autoComplete="off"
                      required
                    />
                    {/* Autocomplete nativo: elenco fornitori già presenti nei costi
                        generali. L'utente può comunque digitarne uno nuovo. */}
                    <datalist id="fornitori-costi-generali">
                      {Array.from(new Set(costi.map(c => c.fornitore?.trim()).filter(Boolean)))
                        .sort((a, b) => (a as string).localeCompare(b as string, 'it'))
                        .map(f => <option key={f} value={f} />)}
                    </datalist>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descrizione">Descrizione *</Label>
              <Textarea
                id="descrizione"
                value={formData.descrizione}
                onChange={(e) => setFormData(prev => ({ ...prev, descrizione: e.target.value }))}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="data">Data *</Label>
                <Input
                  id="data"
                  type="date"
                  value={formData.data}
                  onChange={(e) => setFormData(prev => ({ ...prev, data: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataScadenza">Data Scadenza</Label>
                <Input
                  id="dataScadenza"
                  type="date"
                  value={formData.dataScadenza}
                  onChange={(e) => setFormData(prev => ({ ...prev, dataScadenza: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="importo">Importo *</Label>
              <div className="relative">
                <Euro className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${formData.categoria === "stipendi" ? "text-gray-300" : "text-gray-400"}`} />
                <Input
                  id="importo"
                  type="number"
                  step="10"
                  className="pl-9"
                  value={formData.importo}
                  onChange={(e) => setFormData(prev => ({ ...prev, importo: e.target.value }))}
                  disabled={formData.categoria === "stipendi"}
                  required
                />
              </div>
              {formData.categoria === "stipendi" && (
                <p className="text-xs text-gray-500">
                  L'importo è lo stipendio del dipendente. Per modificarlo vai in Anagrafica → Collaboratori.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50">
              <Label htmlFor="pagato" className="font-medium cursor-pointer">Pagato</Label>
              <Switch
                id="pagato"
                className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-300"
                checked={formData.pagato}
                onCheckedChange={(checked) => setFormData(prev => ({
                  ...prev,
                  pagato: checked,
                  dataPagamento: checked ? new Date().toISOString().split('T')[0] : ""
                }))}
              />
            </div>

            {formData.pagato && (
              <div className="space-y-2">
                <Label htmlFor="dataPagamento">Data Pagamento</Label>
                <Input
                  id="dataPagamento"
                  type="date"
                  value={formData.dataPagamento}
                  onChange={(e) => setFormData(prev => ({ ...prev, dataPagamento: e.target.value }))}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="allegato">URL Allegato PDF</Label>
              <Input
                id="allegato"
                type="url"
                value={formData.allegato}
                onChange={(e) => setFormData(prev => ({ ...prev, allegato: e.target.value }))}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Textarea
                id="note"
                value={formData.note}
                onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm}>
                Annulla
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingCosto ? "Aggiorna" : "Crea"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Conferma eliminazione costo */}
      <AlertDialog open={!!costoIdToDelete} onOpenChange={(open) => !open && setCostoIdToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il costo?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (costoIdToDelete) deleteMutation.mutate(costoIdToDelete);
                setCostoIdToDelete(null);
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
