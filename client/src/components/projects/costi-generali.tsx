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
import { Plus, Pencil, Trash2, Building, Check, Clock, Euro, Download, ArrowUp, ArrowDown, X, Users, RefreshCcw, Upload } from "lucide-react";
import type { CostoGenerale, Dipendente } from "@shared/schema";
import { formatCurrency, formatCurrencyFromCents, formatDate, toCents, fromCents } from "@/lib/financial-utils";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/table-pagination";
import { useAuth } from "@/hooks/useAuth";
import { YearFilter, ALL_YEARS, getYearFromISO, collectYears } from "@/components/shared/year-filter";

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
  abbonamento: "Abbonamenti/Servizi",
  altro: "Altro"
};

// Categoria "stipendi" è payroll sensibile e va mostrata solo agli admin:
// nei dropdown (creazione + filtri) e come label nelle righe (il server
// già filtra le righe stipendi dalla lista per non-admin, ma questo evita
// che rimangano voci "fantasma" se il server dovesse cambiare risposta).
const CATEGORIE_ADMIN_ONLY: Array<keyof typeof CATEGORIE> = ["stipendi"];

// Opzioni periodicità per categoria "abbonamento".
const PERIODICITA_OPTIONS: Array<{ value: "mensile" | "bimestrale" | "trimestrale" | "semestrale" | "annuale"; label: string }> = [
  { value: "mensile", label: "Mensile" },
  { value: "bimestrale", label: "Bimestrale" },
  { value: "trimestrale", label: "Trimestrale" },
  { value: "semestrale", label: "Semestrale" },
  { value: "annuale", label: "Annuale" },
];
type Periodicita = (typeof PERIODICITA_OPTIONS)[number]["value"];

export default function CostiGenerali() {
  const tableTopRef = useRef<HTMLDivElement>(null);
  const bustePagaInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCosto, setEditingCosto] = useState<CostoGenerale | null>(null);
  const [costoIdToDelete, setCostoIdToDelete] = useState<string | null>(null);
  const [filterCategoria, setFilterCategoria] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterFornitore, setFilterFornitore] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>(ALL_YEARS);
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
    dipendenteId: "" as string,
    periodicita: "" as Periodicita | "",
  });

  // Dipendenti per il Select "Stipendi" (solo attivi).
  // stipendioMensile è presente solo per admin (sanitize lato server).
  const { data: dipendenti = [] } = useQuery<Dipendente[]>({
    queryKey: ["/api/dipendenti"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/dipendenti");
      if (!response.ok) throw new Error("Failed to fetch dipendenti");
      return response.json();
    },
  });
  const dipendentiAttivi = dipendenti.filter(c => c.active);

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
    // Optimistic update: rimuovo la riga dalla cache subito così l'UI
    // reagisce immediatamente. Se il server risponde con errore, rollback.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/costi-generali"] });
      const prev = queryClient.getQueryData<CostoGenerale[]>(["/api/costi-generali"]);
      queryClient.setQueryData<CostoGenerale[]>(
        ["/api/costi-generali"],
        (old) => (old ?? []).filter(c => c.id !== id)
      );
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["/api/costi-generali"], context.prev);
      }
      toast({ title: "Errore", description: "Errore durante l'eliminazione", variant: "destructive" });
    },
    onSuccess: () => {
      invalidateDashboard();
      toast({ title: "Successo", description: "Costo eliminato con successo" });
    },
    onSettled: () => {
      // Refetch per riconciliare con lo stato del server (paranoia)
      queryClient.invalidateQueries({ queryKey: ["/api/costi-generali"] });
    }
  });

  // Upload a 2 fasi:
  //  1) uploadBustePagaMutation: invia i PDF, il server li parsea e ritorna
  //     un array di preview con i dati estratti (editabili in UI).
  //  2) commitBustePagaMutation: invia le preview finalizzate, il server
  //     crea/aggiorna i record stipendi.
  type PreviewItem = {
    fileUrl: string;
    filename: string;
    codiceFiscale: string;
    periodo: string;
    meseLabel: string;
    imponibileMensile: number;
    nomePdf: string | null;
    dipendenteId: string | null;
    collaboratoreNome: string | null;
    warning: string | null;
    // Marker locale: se true l'admin vuole includere questa riga nel commit.
    include: boolean;
  };
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [previewFailed, setPreviewFailed] = useState<Array<{ filename: string; reason: string }>>([]);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);

  const uploadBustePagaMutation = useMutation({
    // Accetto File[]: il chiamante deve fare Array.from(FileList) PRIMA di
    // chiamare mutate, perché reset dell'input file svuota il FileList
    // (la mutazione gira asincrona, il FileList sarebbe già vuoto).
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach(f => formData.append("files", f));
      const response = await fetch("/api/costi-generali/upload-buste-paga", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Errore upload" }));
        throw new Error(err.error || "Errore upload");
      }
      return response.json() as Promise<{
        previews: Omit<PreviewItem, "include">[];
        failed: Array<{ filename: string; reason: string }>;
      }>;
    },
    onSuccess: (data) => {
      const items: PreviewItem[] = data.previews.map(p => ({ ...p, include: true }));
      setPreviewItems(items);
      setPreviewFailed(data.failed);
      if (items.length === 0 && data.failed.length > 0) {
        // Nessuna preview, mostro solo toast con errori e non apro dialog.
        toast({
          title: "Nessun PDF elaborato",
          description: data.failed.map(f => `${f.filename}: ${f.reason}`).join("\n"),
          variant: "destructive",
        });
      } else {
        setPreviewDialogOpen(true);
      }
    },
    onError: (e: Error) => {
      toast({ title: "Errore upload", description: e.message, variant: "destructive" });
    }
  });

  const commitBustePagaMutation = useMutation({
    mutationFn: async (items: PreviewItem[]) => {
      const payload = {
        items: items.filter(i => i.include).map(i => ({
          fileUrl: i.fileUrl,
          dipendenteId: i.dipendenteId,
          periodo: i.periodo,
          imponibileMensile: i.imponibileMensile,
        })),
      };
      const response = await apiRequest("POST", "/api/costi-generali/upload-buste-paga/commit", payload);
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Errore commit" }));
        throw new Error(err.error || "Errore commit");
      }
      return response.json() as Promise<{
        processed: Array<{ fornitore: string; periodo: string; importo: number; action: "updated" | "created" }>;
        failed: Array<{ fileUrl: string; reason: string }>;
      }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/costi-generali"] });
      invalidateDashboard();
      const okCount = data.processed.length;
      const koCount = data.failed.length;
      if (koCount === 0) {
        toast({ title: "Buste paga confermate", description: `${okCount} ${okCount === 1 ? "record" : "record"} aggiornati/creati` });
      } else {
        toast({
          title: `${okCount} OK, ${koCount} falliti`,
          description: data.failed.map(f => f.reason).join("\n"),
          variant: "destructive",
        });
      }
      setPreviewDialogOpen(false);
      setPreviewItems([]);
      setPreviewFailed([]);
    },
    onError: (e: Error) => {
      toast({ title: "Errore conferma", description: e.message, variant: "destructive" });
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
      dipendenteId: "",
      periodicita: "",
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
      dipendenteId: costo.dipendenteId || "",
      periodicita: costo.periodicita || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Per gli stipendi il Select dipendenti è obbligatorio: feedback inline
    // invece che attendere il 400 del server.
    if (formData.categoria === "stipendi" && !formData.dipendenteId) {
      toast({
        title: "Dipendente non selezionato",
        description: "Seleziona un dipendente per registrare la busta paga.",
        variant: "destructive",
      });
      return;
    }

    // Per gli abbonamenti la periodicità è obbligatoria (senza periodicità
    // il cron non rigenera → non è una vera ricorrenza).
    if (formData.categoria === "abbonamento" && !formData.periodicita) {
      toast({
        title: "Periodicità non selezionata",
        description: "Seleziona ogni quanto si rinnova l'abbonamento.",
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
    // dipendenteId è valorizzato solo per categoria "stipendi". Se vuoto
    // non va inviato (il campo è opzionale nello schema).
    if (!cleanData.dipendenteId) delete cleanData.dipendenteId;
    // periodicita è valorizzata solo per categoria "abbonamento". Se vuota
    // (es. categoria diversa) non va inviata.
    if (!cleanData.periodicita) delete cleanData.periodicita;
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

  const availableYears = collectYears<CostoGenerale>([[costi, 'data']]);
  const yearNum = filterYear === ALL_YEARS ? null : Number(filterYear);

  const filteredCosti = costi.filter(c => {
    if (filterCategoria !== "all" && c.categoria !== filterCategoria) return false;
    if (filterFornitore !== "all" && (c.fornitore || '').trim() !== filterFornitore) return false;
    if (filterStatus === "pagati" && !c.pagato) return false;
    if (filterStatus === "da_pagare" && c.pagato) return false;
    if (yearNum !== null && getYearFromISO(c.data) !== yearNum) return false;
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
    resetKey: `${filterCategoria}|${filterFornitore}|${filterStatus}|${filterYear}|${sortBy}|${sortDirection}`,
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
          <YearFilter value={filterYear} onChange={setFilterYear} years={availableYears} data-testid="filter-year-costi-generali" />
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
          {(filterCategoria !== "all" || filterFornitore !== "all" || filterStatus !== "all" || filterYear !== ALL_YEARS) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterCategoria("all");
                setFilterFornitore("all");
                setFilterStatus("all");
                setFilterYear(ALL_YEARS);
              }}
              className="text-gray-500 hover:text-gray-700 gap-1"
              data-testid="reset-filters-costi-generali"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Pulisci filtri
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {admin && (
            <>
              <input
                ref={bustePagaInputRef}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  // Snapshot sincrono: il FileList dell'input diventa vuoto
                  // non appena resettiamo `.value = ""` sotto, e la mutation
                  // parte asincrona. Serve copiare in Array ORA.
                  const filesArray = e.target.files ? Array.from(e.target.files) : [];
                  if (filesArray.length > 0) {
                    uploadBustePagaMutation.mutate(filesArray);
                  }
                  // reset in modo da poter ricaricare lo stesso file se serve
                  if (bustePagaInputRef.current) bustePagaInputRef.current.value = "";
                }}
              />
              <Button
                variant="outline"
                onClick={() => bustePagaInputRef.current?.click()}
                disabled={uploadBustePagaMutation.isPending}
                title="Carica uno o più PDF di buste paga per aggiornare automaticamente gli importi del mese"
              >
                <Upload className="h-4 w-4 mr-1" />
                {uploadBustePagaMutation.isPending ? "Carico..." : "Carica buste paga"}
              </Button>
            </>
          )}
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuovo Costo Generale
          </Button>
        </div>
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
                        <div className="flex items-center gap-1.5">
                          {costo.categoria === "abbonamento" && (
                            <RefreshCcw className="h-3.5 w-3.5 text-indigo-600" aria-label="Ricorrente" />
                          )}
                          <span>{CATEGORIE[costo.categoria]}</span>
                          {costo.categoria === "abbonamento" && costo.periodicita && (
                            <span className="text-xs text-indigo-600/80">· {costo.periodicita}</span>
                          )}
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
                      // da un tipo all'altro resettiamo il payee + dipendenteId
                      // per evitare mismatch (es. "ENEL" come nome dipendente).
                      const changingFromOrToStipendi = (prev.categoria === "stipendi") !== (next === "stipendi");
                      // La periodicità ha senso solo per abbonamenti: quando
                      // si esce dalla categoria la reset, quando si entra
                      // resta vuota (verrà forzata dalla validazione submit).
                      const leavingAbbonamento = prev.categoria === "abbonamento" && next !== "abbonamento";
                      return {
                        ...prev,
                        categoria: next,
                        ...(changingFromOrToStipendi ? { fornitore: "", dipendenteId: "" } : {}),
                        ...(leavingAbbonamento ? { periodicita: "" as Periodicita | "" } : {}),
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
                  // per poter auto-popolare importo + dipendenteId.
                  <>
                  <Select
                    value={formData.dipendenteId || ""}
                    disabled={!!editingCosto}
                    onValueChange={(value) => {
                      const c = dipendentiAttivi.find(d => d.id === value);
                      if (!c) return;
                      setFormData(prev => ({
                        ...prev,
                        dipendenteId: c.id,
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
                          Nessun dipendente attivo. Vai in Anagrafica Dipendenti per configurarli.
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

            {formData.categoria === "abbonamento" && (
              <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/60 p-3 space-y-2">
                <Label htmlFor="periodicita" className="font-semibold text-indigo-900">
                  Periodicità rinnovo <span className="text-red-500">*</span>
                </Label>
                <p className="text-xs text-indigo-700/80">
                  Ogni quanto il sistema crea automaticamente la prossima scadenza.
                </p>
                <Select
                  value={formData.periodicita}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, periodicita: value as Periodicita }))}
                >
                  <SelectTrigger id="periodicita">
                    <SelectValue placeholder="Seleziona periodicità..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIODICITA_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editingCosto && editingCosto.ricorrenzaId && (
                  <p className="text-xs text-gray-500">
                    Per interrompere la ricorrenza, rimuovi la periodicità (non disponibile qui) oppure elimina questo record dall'elenco.
                  </p>
                )}
              </div>
            )}

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
                {/*
                  Stipendi importo:
                   - creazione (no editing): bloccato, server deriva da anagrafica
                   - editing busta paga NON pagata: EDITABILE (correzione puntuale)
                   - editing busta paga PAGATA: bloccato (storica, immutabile)
                */}
                {(() => {
                  const isStipendiLocked = formData.categoria === "stipendi"
                    && (!editingCosto || editingCosto.pagato);
                  return (
                    <>
                      <Euro className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isStipendiLocked ? "text-gray-300" : "text-gray-400"}`} />
                      <Input
                        id="importo"
                        type="number"
                        step="10"
                        className="pl-9"
                        value={formData.importo}
                        onChange={(e) => setFormData(prev => ({ ...prev, importo: e.target.value }))}
                        disabled={isStipendiLocked}
                        required
                      />
                    </>
                  );
                })()}
              </div>
              {formData.categoria === "stipendi" && (
                <p className="text-xs text-gray-500">
                  {!editingCosto
                    ? "L'importo sarà lo stipendio mensile del dipendente selezionato. Per modificarlo vai in Anagrafica → Dipendenti."
                    : editingCosto.pagato
                      ? "Busta paga già pagata: importo bloccato (record storico, non modificabile)."
                      : "Correggi qui l'importo se diverso dal netto effettivo di questa busta paga. Le altre buste paga dello stesso dipendente non vengono toccate."}
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

      {/* Dialog di review buste paga prima del commit */}
      <Dialog
        open={previewDialogOpen}
        onOpenChange={(open) => {
          if (!open && !commitBustePagaMutation.isPending) {
            setPreviewDialogOpen(false);
            setPreviewItems([]);
            setPreviewFailed([]);
          }
        }}
      >
        <DialogContent
          className="max-w-4xl max-h-[90vh] flex flex-col"
          // Durante il commit, blocchiamo sia ESC che click sull'overlay:
          // altrimenti il dialog chiude ma la mutation continua in background
          // e l'utente crede di aver annullato mentre i record vengono creati.
          onEscapeKeyDown={(e) => {
            if (commitBustePagaMutation.isPending) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (commitBustePagaMutation.isPending) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Riepilogo buste paga da confermare
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto px-1 py-2 flex-1">
            {previewFailed.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
                <p className="text-sm font-semibold text-red-800">File non elaborati ({previewFailed.length}):</p>
                <ul className="text-xs text-red-700 list-disc list-inside space-y-0.5">
                  {previewFailed.map((f, i) => (
                    <li key={i}><span className="font-mono">{f.filename}</span> — {f.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {previewItems.length === 0 ? (
              <p className="text-sm text-gray-500 italic">Nessun PDF da confermare.</p>
            ) : (
              <div className="space-y-3">
                {previewItems.map((item, idx) => {
                  const updateItem = (patch: Partial<PreviewItem>) => {
                    setPreviewItems(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));
                  };
                  return (
                    <div
                      key={item.fileUrl}
                      className={`rounded-lg border p-3 space-y-3 ${item.include ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-60'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={item.include}
                            onChange={(e) => updateItem({ include: e.target.checked })}
                            className="mt-1 h-4 w-4"
                            aria-label="Includi nel commit"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium font-mono truncate">{item.filename}</p>
                            {item.nomePdf && <p className="text-xs text-gray-500">PDF: {item.nomePdf} · CF {item.codiceFiscale}</p>}
                          </div>
                        </div>
                        {item.warning && (
                          <Badge variant="destructive" className="shrink-0 text-xs">Attenzione</Badge>
                        )}
                      </div>

                      {item.warning && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">{item.warning}</p>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Dipendente *</Label>
                          <Select
                            value={item.dipendenteId || ""}
                            onValueChange={(value) => {
                              const c = dipendentiAttivi.find(d => d.id === value);
                              updateItem({
                                dipendenteId: c?.id || null,
                                collaboratoreNome: c ? `${c.nome} ${c.cognome}`.trim() : null,
                                warning: c ? null : item.warning,
                              });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleziona dipendente..." />
                            </SelectTrigger>
                            <SelectContent>
                              {dipendentiAttivi.length === 0 ? (
                                <div className="px-2 py-2 text-xs text-gray-500">Nessun dipendente attivo</div>
                              ) : (
                                dipendentiAttivi.map(c => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.nome} {c.cognome}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Periodo (YYYY-MM) *</Label>
                          <Input
                            type="text"
                            pattern="\d{4}-(0[1-9]|1[0-2])"
                            value={item.periodo}
                            onChange={(e) => updateItem({ periodo: e.target.value })}
                            className="font-mono"
                          />
                          <p className="text-xs text-gray-400">{item.meseLabel}</p>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Imponibile mensile (€) *</Label>
                          <div className="relative">
                            <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="pl-9"
                              value={item.imponibileMensile}
                              onChange={(e) => updateItem({ imponibileMensile: parseFloat(e.target.value) || 0 })}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="border-t pt-3">
            <Button
              variant="outline"
              onClick={() => {
                setPreviewDialogOpen(false);
                setPreviewItems([]);
                setPreviewFailed([]);
              }}
              disabled={commitBustePagaMutation.isPending}
            >
              Annulla
            </Button>
            <Button
              onClick={() => commitBustePagaMutation.mutate(previewItems)}
              disabled={
                commitBustePagaMutation.isPending ||
                previewItems.filter(i => i.include).length === 0 ||
                previewItems.some(i => i.include && (!i.dipendenteId || !i.periodo || !i.imponibileMensile))
              }
            >
              {commitBustePagaMutation.isPending
                ? "Conferma in corso..."
                : `Conferma ${previewItems.filter(i => i.include).length} ${previewItems.filter(i => i.include).length === 1 ? 'busta paga' : 'buste paga'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
