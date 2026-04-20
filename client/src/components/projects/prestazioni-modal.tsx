import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIE_DM143 } from "@/lib/parcella-calculator-complete";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { type Project, type ProjectMetadata, type ProjectPrestazioni } from "@shared/schema";
import {
  getAllPrestazioni,
  getAllLivelliProgettazione,
  validatePrestazioniData,
  hasProgettazione,
  formatImporto
} from "@/lib/prestazioni-utils";
import { Loader2, Save } from "lucide-react";

interface PrestazioniModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
}

export default function PrestazioniModal({ project, isOpen, onClose }: PrestazioniModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState<ProjectPrestazioni>({
    prestazioni: [],
    livelloProgettazione: [],
    classeDM143: '',
    importoOpere: undefined,
    importoServizio: undefined,
    percentualeParcella: undefined,
  });

  // Initialize form with existing project data
  useEffect(() => {
    if (project && isOpen) {
      const metadata = project.metadata as ProjectMetadata;
      setFormData({
        prestazioni: metadata?.prestazioni || [],
        livelloProgettazione: metadata?.livelloProgettazione || [],
        classeDM143: metadata?.classeDM143 || '',
        importoOpere: metadata?.importoOpere,
        importoServizio: metadata?.importoServizio,
        percentualeParcella: metadata?.percentualeParcella,
      });
    }
  }, [project?.id, isOpen]);

  // Mutation for saving prestazioni
  const savePrestazioniMutation = useMutation({
    mutationFn: async (data: ProjectPrestazioni) => {
      const response = await apiRequest("PUT", `/api/projects/${project.id}/prestazioni`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Prestazioni aggiornate",
        description: `Le prestazioni della commessa ${project.code} sono state aggiornate con successo`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onClose();
    },
    onError: (error: any) => {
      console.error('Error saving prestazioni:', error);
      toast({
        title: "Errore nel salvataggio",
        description: "Si è verificato un errore durante il salvataggio delle prestazioni",
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handlePrestazioneChange = (prestazioneId: string, checked: boolean) => {
    setFormData((prev: ProjectPrestazioni) => ({
      ...prev,
      prestazioni: checked
        ? [...(prev.prestazioni || []), prestazioneId]
        : (prev.prestazioni || []).filter((p: string) => p !== prestazioneId)
    }));
  };

  const handleLivelloProgettazioneChange = (livelloId: string, checked: boolean) => {
    setFormData((prev: ProjectPrestazioni) => ({
      ...prev,
      livelloProgettazione: checked
        ? [...(prev.livelloProgettazione || []), livelloId]
        : (prev.livelloProgettazione || []).filter((l: string) => l !== livelloId)
    }));
  };

  const handleInputChange = (field: keyof ProjectPrestazioni, value: string | number) => {
    setFormData((prev: ProjectPrestazioni) => ({
      ...prev,
      [field]: value === '' ? undefined : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate data
    const validation = validatePrestazioniData(formData);
    if (!validation.isValid) {
      toast({
        title: "Dati non validi",
        description: validation.errors.join(', '),
        variant: "destructive",
      });
      return;
    }

    savePrestazioniMutation.mutate(formData);
  };

  const handleClose = () => {
    if (savePrestazioniMutation.isPending) return;
    onClose();
  };

  const prestazioniList = getAllPrestazioni();
  const livelliProgettazioneList = getAllLivelliProgettazione();
  const showLivelloProgettazione = hasProgettazione(formData.prestazioni);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !savePrestazioniMutation.isPending) handleClose();
      }}
    >
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        data-testid="prestazioni-modal"
      >
        <DialogHeader>
          <DialogTitle data-testid="modal-title">
            Dettagli Prestazioni Professionali
          </DialogTitle>
          <DialogDescription>
            Commessa:{" "}
            <span className="font-mono font-semibold text-primary">{project.code}</span>{" "}
            — {project.object}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Sezione Tipologia Prestazioni */}
          <div className="space-y-4">
            <div>
              <Label className="text-lg font-semibold text-gray-900">
                Tipologia Prestazioni <span className="text-red-500">*</span>
              </Label>
              <p className="text-sm text-gray-600 mt-1">
                Seleziona tutte le prestazioni professionali relative a questa commessa
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4" data-testid="prestazioni-checkboxes">
              {prestazioniList.map(({ id, config }) => (
                <div key={id} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <Checkbox
                    id={`prestazione-${id}`}
                    checked={formData.prestazioni?.includes(id) || false}
                    onCheckedChange={(checked) => handlePrestazioneChange(id, checked as boolean)}
                    data-testid={`checkbox-prestazione-${id}`}
                  />
                  <Label htmlFor={`prestazione-${id}`} className="flex items-center gap-2 cursor-pointer flex-1">
                    <config.Icon className="h-5 w-5 text-gray-600 shrink-0" aria-hidden="true" />
                    <div>
                      <div className="font-medium">{config.label}</div>
                      <div className="text-xs text-gray-500">{config.description}</div>
                    </div>
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Sezione Livello Progettazione (condizionale) */}
          {showLivelloProgettazione && (
            <div className="space-y-4 bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div>
                <Label className="text-lg font-semibold text-gray-900">
                  Livello Progettazione <span className="text-red-500">*</span>
                </Label>
                <p className="text-sm text-gray-600 mt-1">
                  Specifica il livello di progettazione secondo la normativa vigente
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4" data-testid="livello-progettazione-checkboxes">
                {livelliProgettazioneList.map(({ id, config }) => (
                  <div key={id} className="flex items-center space-x-3 p-3 bg-white border border-blue-200 rounded-lg">
                    <Checkbox
                      id={`livello-${id}`}
                      checked={formData.livelloProgettazione?.includes(id) || false}
                      onCheckedChange={(checked) => handleLivelloProgettazioneChange(id, checked as boolean)}
                      data-testid={`checkbox-livello-${id}`}
                    />
                    <Label htmlFor={`livello-${id}`} className="cursor-pointer flex-1">
                      <div className="font-medium">{config.label}</div>
                      <div className="text-xs text-gray-500">{config.description}</div>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sezione Classificazione DM 143/2013 */}
          <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div>
              <Label className="text-lg font-semibold text-gray-900">
                Classificazione DM 143/2013
              </Label>
              <p className="text-sm text-gray-600 mt-1">
                Parametri per la determinazione del compenso professionale
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Classe e Categoria</Label>
                {(() => {
                  // Parsing "IA04" -> { cat: "IA", art: "04" }
                  // Supporta anche lo stato intermedio "IA" (categoria selezionata,
                  // articolazione non ancora scelta).
                  const str = formData.classeDM143 || '';
                  const fullMatch = str.match(/^([A-Z]{1,2})(\d{2})$/);
                  const catMatch = fullMatch ?? str.match(/^([A-Z]{1,2})$/);
                  const selectedCat = catMatch?.[1] ?? '';
                  const selectedArt = fullMatch?.[2] ?? '';
                  const catInfo = selectedCat && selectedCat in CATEGORIE_DM143
                    ? CATEGORIE_DM143[selectedCat as keyof typeof CATEGORIE_DM143]
                    : null;

                  const setCat = (newCat: string) => {
                    // Cambio categoria: salva solo il prefisso, articolazione va ri-scelta
                    handleInputChange('classeDM143', newCat);
                  };

                  const setArt = (newArt: string) => {
                    // Richiede categoria già selezionata
                    if (!selectedCat) return;
                    handleInputChange('classeDM143', selectedCat + newArt);
                  };

                  return (
                    <div className="grid grid-cols-[140px_1fr] gap-2">
                      <Select value={selectedCat} onValueChange={setCat}>
                        <SelectTrigger data-testid="select-categoria-dm" aria-label="Categoria DM 143/2013">
                          <SelectValue placeholder="Categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(CATEGORIE_DM143).map(([key, cat]) => (
                            <SelectItem key={key} value={key}>
                              <span className="font-mono mr-2">{key}</span>
                              {cat.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={selectedArt}
                        onValueChange={setArt}
                        disabled={!catInfo}
                      >
                        <SelectTrigger
                          data-testid="select-articolazione-dm"
                          aria-label="Articolazione"
                        >
                          <SelectValue
                            placeholder={catInfo ? 'Seleziona articolazione…' : 'Prima seleziona la categoria'}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {catInfo && Object.entries(catInfo.articolazioni).map(([code, desc]) => (
                            <SelectItem key={code} value={code}>
                              <span className="font-mono mr-2">{code}</span>
                              <span className="text-xs text-gray-600">{desc}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}
                <p className="text-xs text-gray-500">
                  Codice secondo il Decreto Ministeriale 143/2013
                  {formData.classeDM143 && /^[A-Z]{1,2}\d{2}$/.test(formData.classeDM143) && (
                    <> · <span className="font-mono text-gray-700">{formData.classeDM143}</span></>
                  )}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="importo-opere" className="text-sm font-medium">
                  Importo Opere (€)
                </Label>
                <Input
                  id="importo-opere"
                  type="number"
                  placeholder="0"
                  min="0"
                  step="1000"
                  value={formData.importoOpere || ''}
                  onChange={(e) => handleInputChange('importoOpere', e.target.value === '' ? '' : parseFloat(e.target.value) || '')}
                  data-testid="input-importo-opere"
                />
                <p className="text-xs text-gray-500">
                  Importo dei lavori base per calcolo parcella
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="importo-servizio" className="text-sm font-medium">
                  Importo Servizio Professionale (€)
                </Label>
                <Input
                  id="importo-servizio"
                  type="number"
                  placeholder="0"
                  min="0"
                  step="100"
                  value={formData.importoServizio || ''}
                  onChange={(e) => handleInputChange('importoServizio', e.target.value === '' ? '' : parseFloat(e.target.value) || '')}
                  data-testid="input-importo-servizio"
                />
                <p className="text-xs text-gray-500">
                  Compenso professionale al netto di cassa e IVA
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="percentuale-parcella" className="text-sm font-medium">
                  Percentuale Parcella (%)
                </Label>
                <Input
                  id="percentuale-parcella"
                  type="number"
                  placeholder="0.00"
                  min="0"
                  max="100"
                  step="0.5"
                  value={formData.percentualeParcella || ''}
                  onChange={(e) => handleInputChange('percentualeParcella', e.target.value === '' ? '' : parseFloat(e.target.value) || '')}
                  data-testid="input-percentuale-parcella"
                />
                <p className="text-xs text-gray-500">
                  Percentuale applicata sull'importo opere
                </p>
              </div>
            </div>

            {/* Riepilogo importi */}
            {(formData.importoOpere || formData.importoServizio) && (
              <div className="mt-4 p-3 bg-white border border-gray-200 rounded-lg">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Riepilogo Economico</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Importo Opere:</span>
                    <div className="font-semibold text-blue-600">{formatImporto(formData.importoOpere || 0)}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Compenso Professionale:</span>
                    <div className="font-semibold text-green-600">{formatImporto(formData.importoServizio || 0)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={savePrestazioniMutation.isPending}
              data-testid="cancel-button"
            >
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={savePrestazioniMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
              data-testid="save-button"
            >
              {savePrestazioniMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                  Salva Classificazione
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}