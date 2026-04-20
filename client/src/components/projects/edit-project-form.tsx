import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertProjectSchema, categoriaLavoroRefinement, CATEGORIE_LAVORO_PROFESSIONALE, type Project, type InsertProject } from "@shared/schema";
import { TIPO_RAPPORTO_CONFIG, type TipoRapportoType } from "@/lib/prestazioni-utils";
import { Hammer, Wrench } from "lucide-react";

interface EditProjectFormProps {
  project: Project;
  children: React.ReactNode;
}

export default function EditProjectForm({ project, children }: EditProjectFormProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Converte una ISO string "2025-03-15T12:00:00.000Z" in formato "2025-03-15"
  // per il date picker. Se manca, restituisce stringa vuota.
  const isoToDateInput = (iso?: string): string => {
    if (!iso) return "";
    try { return new Date(iso).toISOString().slice(0, 10); } catch { return ""; }
  };

  const form = useForm<InsertProject>({
    resolver: zodResolver(insertProjectSchema.superRefine(categoriaLavoroRefinement)),
    defaultValues: {
      code: project.code,
      client: project.client,
      city: project.city,
      object: project.object,
      year: project.year,
      template: project.template,
      status: project.status,
      tipoRapporto: project.tipoRapporto || "diretto",
      tipoIntervento: project.tipoIntervento || "professionale",
      manutenzione: project.manutenzione ?? false,
      categoriaLavoro: project.categoriaLavoro || undefined,
      budget: project.budget || undefined,
      committenteFinale: project.committenteFinale || undefined,
      fsRoot: project.fsRoot || undefined,
      metadata: project.metadata || {},
      createdAt: isoToDateInput(project.createdAt),
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async (data: Partial<InsertProject>) => {
      const response = await apiRequest("PUT", `/api/projects/${project.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Commessa aggiornata",
        description: "La commessa è stata aggiornata con successo",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setOpen(false);
      form.reset();
    },
    onError: () => {
      toast({
        title: "Errore nell'aggiornamento",
        description: "Si è verificato un errore durante l'aggiornamento della commessa",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertProject) => {
    // Converte yyyy-mm-dd dal date picker in ISO string per il backend.
    const payload: Partial<InsertProject> = { ...data };
    if (payload.createdAt && /^\d{4}-\d{2}-\d{2}$/.test(payload.createdAt)) {
      payload.createdAt = new Date(payload.createdAt + 'T12:00:00').toISOString();
    } else if (!payload.createdAt) {
      delete payload.createdAt;
    }
    updateProjectMutation.mutate(payload);
  };

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        code: project.code,
        client: project.client,
        city: project.city,
        object: project.object,
        year: project.year,
        template: project.template,
        status: project.status,
        tipoRapporto: project.tipoRapporto || "diretto",
        tipoIntervento: project.tipoIntervento || "professionale",
        manutenzione: project.manutenzione ?? false,
        categoriaLavoro: project.categoriaLavoro || undefined,
        budget: project.budget || undefined,
        committenteFinale: project.committenteFinale || undefined,
        fsRoot: project.fsRoot || undefined,
        metadata: project.metadata || {},
        createdAt: isoToDateInput(project.createdAt),
      });
    }
  }, [open, project, form]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Modifica Commessa - {project.code}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 overflow-y-auto overflow-x-hidden px-1 py-1 flex-1">
            <FormField
              control={form.control}
              name="manutenzione"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipologia di commessa</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => field.onChange(false)}
                      className={`p-3 rounded-lg border-2 text-left text-sm transition-all ${
                        !field.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Hammer className="h-4 w-4" aria-hidden="true" />
                        <span className="font-semibold">Lavoro Professionale</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        field.onChange(true);
                        form.setValue("categoriaLavoro", undefined);
                      }}
                      className={`p-3 rounded-lg border-2 text-left text-sm transition-all ${
                        field.value ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Wrench className="h-4 w-4" aria-hidden="true" />
                        <span className="font-semibold">Manutenzione</span>
                      </span>
                    </button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!form.watch("manutenzione") && (
              <FormField
                control={form.control}
                name="categoriaLavoro"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="edit-categoria-lavoro">
                          <SelectValue placeholder="Seleziona una categoria..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIE_LAVORO_PROFESSIONALE.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Codice Commessa</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="edit-project-code" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="client"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="edit-project-client" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Città</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="edit-project-city" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="tipoRapporto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Tipo Rapporto
                    <span className="ml-1 text-xs text-gray-500 font-normal">Chi commissiona a G2?</span>
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="edit-project-tipo-rapporto">
                        <SelectValue placeholder="Seleziona tipo rapporto" />
                      </SelectTrigger>
                    </FormControl>
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
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {form.watch("tipoRapporto") && form.watch("tipoRapporto") !== "diretto" && (
              <FormField
                control={form.control}
                name="committenteFinale"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Committente Finale
                      <span className="ml-1 text-xs text-gray-500 font-normal">Proprietario/Ente finale dell'opera</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} data-testid="edit-project-committente-finale" placeholder="Es. Comune di Roma, Privato, etc." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            <FormField
              control={form.control}
              name="object"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Oggetto</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="edit-project-object" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="year"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Anno</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min="2000"
                      max="2099"
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 2025)}
                      data-testid="edit-project-year"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="createdAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data di creazione</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      data-testid="edit-project-createdAt"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="template"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Template</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="edit-project-template">
                        <SelectValue placeholder="Seleziona template" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="LUNGO">LUNGO</SelectItem>
                      <SelectItem value="BREVE">BREVE</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipoIntervento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipologia Intervento</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="edit-project-tipo-intervento">
                        <SelectValue placeholder="Seleziona tipologia" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="professionale">Professionale</SelectItem>
                      <SelectItem value="realizzativo">Realizzativo</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="budget"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Importo Concordato
                    <span className="ml-1 text-xs text-gray-500 font-normal">(opzionale)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min="0"
                      step="100"
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      data-testid="edit-project-budget"
                      placeholder="Es. 50000.00"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stato</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="edit-project-status">
                        <SelectValue placeholder="Seleziona stato" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="in_corso">In Corso</SelectItem>
                      <SelectItem value="conclusa">Conclusa</SelectItem>
                      <SelectItem value="sospesa">Sospesa</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="cancel-edit-project"
              >
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={updateProjectMutation.isPending}
                className="button-g2-primary"
                data-testid="save-edit-project"
              >
                {updateProjectMutation.isPending ? "Salvando..." : "Salva Modifiche"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}