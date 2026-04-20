import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertProjectSchema, categoriaLavoroRefinement, CATEGORIE_LAVORO_PROFESSIONALE, type InsertProject, type Client } from "@shared/schema";
import { TIPO_RAPPORTO_CONFIG, type TipoRapportoType } from "@/lib/prestazioni-utils";
import { CheckCircle, Loader2, Save, Building2, MapPin, FileText, Mail, Phone, Hammer, Wrench } from "lucide-react";
import { z } from "zod";

const formSchema = insertProjectSchema.extend({
  year: z.number().min(2000).max(2099),
  clientId: z.string().optional(),
}).superRefine(categoriaLavoroRefinement);

type FormData = z.infer<typeof formSchema>;

interface NewProjectFormProps {
  onProjectSaved: (project: any) => void;
  /** Callback opzionale chiamata quando l'utente annulla. In variant="dialog"
   * il parent lo usa per chiudere la dialog. In variant="page" può non essere
   * fornito: il bottone "Annulla" si limiterà a svuotare il form. */
  onCancel?: () => void;
  variant?: "page" | "dialog";
}

export default function NewProjectForm({ onProjectSaved, onCancel, variant = "page" }: NewProjectFormProps) {
  const [generatedCode, setGeneratedCode] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch clients
  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"]
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      client: "",
      city: "",
      object: "",
      year: new Date().getFullYear(),
      template: "LUNGO",
      status: "in_corso",
      tipoRapporto: "diretto",
      tipoIntervento: "professionale",
      manutenzione: false,
      categoriaLavoro: undefined,
      budget: undefined,
      committenteFinale: undefined,
      code: "",
      fsRoot: undefined,
      metadata: undefined,
      clientId: undefined,
      createdAt: undefined,
    },
  });

  // Auto-fill city when client is selected
  useEffect(() => {
    if (selectedClient) {
      form.setValue("client", selectedClient.name);
      if (selectedClient.city) {
        form.setValue("city", selectedClient.city);
      }
    }
  }, [selectedClient, form]);

  const handleClientSelect = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (client) {
      setSelectedClient(client);
      form.setValue("clientId", clientId);
      form.setValue("client", client.name);
      if (client.city) {
        form.setValue("city", client.city);
      }
    }
  };

  const generateCodeMutation = useMutation({
    mutationFn: async (data: { client: string; city: string; year: number }) => {
      const response = await apiRequest("POST", "/api/generate-code", data);
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedCode(data.code);
      form.setValue("code", data.code);
    },
    onError: () => {
      toast({
        title: "Errore nella generazione del codice",
        description: "Si è verificato un errore durante la generazione del codice commessa",
        variant: "destructive",
      });
    },
  });

  // Simple project creation
  const createProjectMutation = useMutation({
    mutationFn: async (data: InsertProject) => {
      const projectResponse = await apiRequest("POST", "/api/projects", data);
      const project = await projectResponse.json();
      return project;
    },
    onSuccess: (project) => {
      toast({
        title: "Commessa creata con successo",
        description: `Progetto ${project.code} creato con successo.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      onProjectSaved(project);
      form.reset();
      setGeneratedCode("");
      setSelectedClient(null);
    },
    onError: (error: any) => {
      console.error('Project creation error:', error);

      toast({
        title: "Errore nella creazione",
        description: "Si è verificato un errore durante la creazione della commessa",
        variant: "destructive",
      });
    },
  });

  const handleGenerateCode = () => {
    const { client, city, year } = form.getValues();
    if (!client || !city || year === undefined || year === null) {
      toast({
        title: "Campi mancanti",
        description: "Compilare Cliente, Città e Anno prima di generare il codice",
        variant: "destructive",
      });
      return;
    }

    generateCodeMutation.mutate({ client, city, year });
  };

  const onSubmit = (data: FormData) => {
    if (!data.code) {
      toast({
        title: "Codice mancante",
        description: "Generare prima il codice commessa",
        variant: "destructive",
      });
      return;
    }

    // Se l'utente ha indicato una data in formato yyyy-mm-dd dal date picker,
    // la converto in ISO string con ora 12:00 (mezzogiorno locale) per evitare
    // sfasamenti di fuso orario. Se il campo è vuoto, il backend imposta now().
    const payload = { ...data };
    if (payload.createdAt && /^\d{4}-\d{2}-\d{2}$/.test(payload.createdAt)) {
      payload.createdAt = new Date(payload.createdAt + 'T12:00:00').toISOString();
    } else if (!payload.createdAt) {
      delete payload.createdAt;
    }

    createProjectMutation.mutate(payload);
  };

  const onError = (errors: any) => {
    const firstError = Object.values(errors)[0] as any;
    toast({
      title: "Errore di validazione",
      description: firstError?.message || "Controlla i campi del form",
      variant: "destructive",
    });
  };

  const isManutenzione = form.watch("manutenzione");

  const isDialog = variant === "dialog";
  const wrapperClass = isDialog ? "" : "card-g2";

  const handleCancel = () => {
    form.reset();
    setGeneratedCode("");
    setSelectedClient(null);
    // In modalità dialog, il parent passa onCancel per chiudere la dialog;
    // in modalità page la dialog non esiste e il reset da solo è sufficiente.
    onCancel?.();
  };

  return (
    <div className={wrapperClass} data-testid="new-project-form">
      {!isDialog && (
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Crea Nuova Commessa</h2>
      )}

      <form className="space-y-4">
        {/* Tipologia commessa: manutenzione vs nuovo lavoro */}
        <div className="space-y-2">
          <Label>Tipologia di commessa *</Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => form.setValue("manutenzione", false)}
              className={`p-3 rounded-md border-2 text-left transition-all ${
                !isManutenzione
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
              data-testid="select-nuovo-lavoro"
            >
              <div className="flex items-center gap-2 mb-1">
                <Hammer className="h-4 w-4 text-gray-600" aria-hidden="true" />
                <span className="font-medium text-sm">Lavoro Professionale</span>
                {!isManutenzione && <CheckCircle className="w-4 h-4 text-blue-600 ml-auto" />}
              </div>
              <p className="text-xs text-gray-600">
                Progettazione/realizzazione di una nuova opera
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                form.setValue("manutenzione", true);
                form.setValue("categoriaLavoro", undefined);
              }}
              className={`p-3 rounded-md border-2 text-left transition-all ${
                isManutenzione
                  ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
              data-testid="select-manutenzione"
            >
              <div className="flex items-center gap-2 mb-1">
                <Wrench className="h-4 w-4 text-gray-600" aria-hidden="true" />
                <span className="font-medium text-sm">Manutenzione</span>
                {isManutenzione && <CheckCircle className="w-4 h-4 text-orange-600 ml-auto" />}
              </div>
              <p className="text-xs text-gray-600">
                Manutenzione, riparazione o intervento su opera esistente
              </p>
            </button>
          </div>
        </div>

        {/* Categoria — obbligatoria solo per Lavoro Professionale */}
        {!isManutenzione && (
          <div className="space-y-2">
            <Label htmlFor="categoriaLavoro">Categoria *</Label>
            <Select
              onValueChange={(value) => form.setValue("categoriaLavoro", value as typeof CATEGORIE_LAVORO_PROFESSIONALE[number], { shouldValidate: true })}
              value={form.watch("categoriaLavoro") ?? ""}
              data-testid="select-categoria-lavoro"
            >
              <SelectTrigger id="categoriaLavoro">
                <SelectValue placeholder="Seleziona una categoria..." />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIE_LAVORO_PROFESSIONALE.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.categoriaLavoro && (
              <p className="text-sm text-red-600">{form.formState.errors.categoriaLavoro.message}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="client">Cliente *</Label>
            {clients.length > 0 ? (
              <Select
                onValueChange={handleClientSelect}
                value={selectedClient?.id || ""}
                data-testid="select-client"
              >
                <SelectTrigger id="client">
                  <SelectValue placeholder="Seleziona un cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      <span className="font-medium">{client.sigla}</span> - {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-700">
                Nessun cliente presente. Vai in Anagrafica → Clienti per aggiungerne uno.
              </div>
            )}
            {form.formState.errors.client && (
              <p className="text-sm text-red-600">{form.formState.errors.client.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">Città *</Label>
            <Input
              id="city"
              placeholder="Es. Milano"
              data-testid="input-city"
              {...form.register("city")}
            />
            {form.formState.errors.city && (
              <p className="text-sm text-red-600">{form.formState.errors.city.message}</p>
            )}
          </div>
        </div>

        {/* Card informazioni cliente selezionato */}
        {selectedClient && (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <h4 className="font-semibold text-blue-900 text-sm">Informazioni Cliente</h4>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-600">Rag. Sociale:</span>
                  <span className="font-medium truncate">{selectedClient.name}</span>
                </div>
                {selectedClient.piva && (
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <span className="text-gray-600">P. IVA:</span>
                    <span className="font-medium">{selectedClient.piva}</span>
                  </div>
                )}
                {selectedClient.cf && (
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <span className="text-gray-600">C.F.:</span>
                    <span className="font-medium">{selectedClient.cf}</span>
                  </div>
                )}
                {selectedClient.address && (
                  <div className="flex items-center gap-1.5 col-span-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <span className="font-medium truncate">
                      {selectedClient.address}
                      {selectedClient.cap && `, ${selectedClient.cap}`}
                      {selectedClient.city && ` ${selectedClient.city}`}
                      {selectedClient.province && ` (${selectedClient.province})`}
                    </span>
                  </div>
                )}
                {selectedClient.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <span className="font-medium truncate">{selectedClient.email}</span>
                  </div>
                )}
                {selectedClient.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <span className="font-medium">{selectedClient.phone}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          <Label htmlFor="tipoRapporto">Tipo Rapporto *</Label>
          <Select
            onValueChange={(value) => form.setValue("tipoRapporto", value as TipoRapportoType)}
            defaultValue={form.getValues("tipoRapporto")}
            data-testid="select-tipo-rapporto"
          >
            <SelectTrigger id="tipoRapporto">
              <SelectValue placeholder="Seleziona tipo rapporto..." />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TIPO_RAPPORTO_CONFIG).map(([key, config]) => {
                const Icon = config.Icon;
                return (
                  <SelectItem key={key} value={key}>
                    <span className="inline-flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {config.label} — {config.description}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {form.formState.errors.tipoRapporto && (
            <p className="text-sm text-red-600">{form.formState.errors.tipoRapporto.message}</p>
          )}
        </div>

        {/* Campo Committente Finale - visibile solo se tipo != diretto */}
        {form.watch("tipoRapporto") && form.watch("tipoRapporto") !== "diretto" && (
          <div className="space-y-2">
            <Label htmlFor="committente-finale">Committente Finale</Label>
            <Input
              id="committente-finale"
              placeholder="Es. Comune di Roma, Privato, etc."
              data-testid="input-committente-finale"
              {...form.register("committenteFinale")}
            />
            {form.formState.errors.committenteFinale && (
              <p className="text-sm text-red-600">{form.formState.errors.committenteFinale.message}</p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="object">Oggetto Commessa *</Label>
          <Input
            id="object"
            placeholder="Descrizione sintetica del progetto"
            data-testid="input-object"
            {...form.register("object")}
          />
          {form.formState.errors.object && (
            <p className="text-sm text-red-600">{form.formState.errors.object.message}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="year">Anno *</Label>
            <Input
              id="year"
              type="number"
              min="2000"
              max="2099"
              placeholder="2025"
              data-testid="input-year"
              {...form.register("year", { valueAsNumber: true })}
            />
            {form.formState.errors.year && (
              <p className="text-sm text-red-600">{form.formState.errors.year.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="createdAt">Data di creazione</Label>
            <Input
              id="createdAt"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              placeholder="Oggi"
              data-testid="input-createdAt"
              {...form.register("createdAt")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template">Template *</Label>
            <Select
              onValueChange={(value) => form.setValue("template", value as "LUNGO" | "BREVE")}
              defaultValue={form.getValues("template")}
              data-testid="select-template"
            >
              <SelectTrigger id="template">
                <SelectValue placeholder="Seleziona template..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LUNGO">LUNGO - Progetti complessi</SelectItem>
                <SelectItem value="BREVE">BREVE - Progetti semplici</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="status">Stato *</Label>
            <Select
              onValueChange={(value) => form.setValue("status", value as "in_corso" | "conclusa" | "sospesa")}
              defaultValue={form.getValues("status")}
              data-testid="select-status"
            >
              <SelectTrigger id="status">
                <SelectValue placeholder="Seleziona stato..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_corso">In Corso</SelectItem>
                <SelectItem value="conclusa">Conclusa</SelectItem>
                <SelectItem value="sospesa">Sospesa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tipoIntervento">Tipologia Intervento *</Label>
            <Select
              onValueChange={(value) => form.setValue("tipoIntervento", value as "professionale" | "realizzativo")}
              defaultValue={form.getValues("tipoIntervento")}
              data-testid="select-tipo-intervento"
            >
              <SelectTrigger id="tipoIntervento">
                <SelectValue placeholder="Seleziona tipologia..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professionale">Professionale</SelectItem>
                <SelectItem value="realizzativo">Realizzativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="budget">Importo Concordato</Label>
          <Input
            id="budget"
            type="number"
            min="0"
            step="100"
            placeholder="Es. 50000.00 (opzionale)"
            data-testid="input-budget"
            {...form.register("budget", {
              setValueAs: (v) => v === '' || v === undefined ? undefined : Number(v)
            })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="code">Codice Commessa</Label>
          <div className="flex gap-2">
            <Input
              id="code"
              readOnly
              placeholder="Generato automaticamente..."
              className="flex-1 bg-gray-50 text-gray-600 font-mono"
              data-testid="input-generated-code"
              {...form.register("code")}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleGenerateCode}
              disabled={generateCodeMutation.isPending || !selectedClient}
              data-testid="button-generate-code"
            >
              {generateCodeMutation.isPending ? "Generando..." : "Genera"}
            </Button>
          </div>
          {!selectedClient && (
            <p className="text-xs text-amber-600">Seleziona prima un cliente per generare il codice</p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={createProjectMutation.isPending}
            onClick={handleCancel}
            data-testid="button-cancel-form"
          >
            Annulla
          </Button>
          <Button
            type="button"
            onClick={form.handleSubmit(onSubmit, onError)}
            disabled={createProjectMutation.isPending || !form.watch("code") || !selectedClient}
            data-testid="button-save-project"
          >
            {createProjectMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Crea Commessa
              </>
            )}
          </Button>
        </DialogFooter>
      </form>
    </div>
  );
}
