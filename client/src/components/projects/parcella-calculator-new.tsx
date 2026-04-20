import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calculator, FileText, Copy, Check, Ruler, HardHat, CheckCircle2, ClipboardList } from "lucide-react";
import {
  CATEGORIE_DM143,
  calcolaParcella,
  calcolaFattura,
  formatEuro,
  type ParcellaInput,
  type ParcellaResult,
  type FatturaCalculation
} from "@/lib/parcella-calculator-complete";

type WizardStep = 'categoria' | 'prestazioni' | 'calcolo' | 'risultato';

export default function ParcellaCalculator() {
  const [currentStep, setCurrentStep] = useState<WizardStep>('categoria');
  const [copied, setCopied] = useState(false);

  // Dati input
  const [importoOpere, setImportoOpere] = useState<number>(0);
  const [categoria, setCategoria] = useState<string>('E');
  const [articolazione, setArticolazione] = useState<string>('01');
  const [complessita, setComplessita] = useState<'minima' | 'bassa' | 'media' | 'alta' | 'altissima'>('media');

  // Prestazioni selezionate
  const [prestazioni, setPrestazioni] = useState<ParcellaInput['prestazioni']>({});

  // Risultati
  const [risultatoParcella, setRisultatoParcella] = useState<ParcellaResult | null>(null);
  const [risultatoFattura, setRisultatoFattura] = useState<FatturaCalculation | null>(null);

  // Parametri fattura
  const [aliquotaCPA, setAliquotaCPA] = useState(4);
  const [aliquotaIVA, setAliquotaIVA] = useState(22);
  const [aliquotaRitenuta, setAliquotaRitenuta] = useState(20);

  const handlePrestazioneToggle = (key: string) => {
    setPrestazioni(prev => ({
      ...prev,
      [key]: !prev[key as keyof typeof prev]
    }));
  };

  const handleCalcola = () => {
    const input: ParcellaInput = {
      importoOpere,
      categoria,
      articolazione,
      prestazioni,
      complessita
    };

    const risultato = calcolaParcella(input);
    setRisultatoParcella(risultato);

    const fattura = calcolaFattura(
      risultato.compensoTotale,
      aliquotaCPA,
      aliquotaIVA,
      aliquotaRitenuta
    );
    setRisultatoFattura(fattura);

    setCurrentStep('risultato');
  };

  const handleReset = () => {
    setCurrentStep('categoria');
    setImportoOpere(0);
    setCategoria('E');
    setArticolazione('01');
    setComplessita('media');
    setPrestazioni({});
    setRisultatoParcella(null);
    setRisultatoFattura(null);
  };

  const handleCopyRiepilogo = () => {
    if (!risultatoParcella || !risultatoFattura) return;

    const testo = `
CALCOLO PARCELLA PROFESSIONALE - DM 143/2013

${risultatoParcella.note.join('\n')}

PRESTAZIONI RICHIESTE:
${Object.values(risultatoParcella.compensi).map(c =>
  `- ${c.prestazione}: ${c.percentuale.toFixed(2)}% = ${formatEuro(c.importo)}`
).join('\n')}

COMPENSO TOTALE: ${formatEuro(risultatoParcella.compensoTotale)}

FATTURA:
Compenso netto: ${formatEuro(risultatoFattura.compensoNetto)}
CPA (${aliquotaCPA}%): ${formatEuro(risultatoFattura.cpa)}
Imponibile: ${formatEuro(risultatoFattura.imponibile)}
IVA (${aliquotaIVA}%): ${formatEuro(risultatoFattura.iva)}
Totale con IVA: ${formatEuro(risultatoFattura.totaleConIVA)}
Ritenuta d'acconto (${aliquotaRitenuta}%): ${formatEuro(risultatoFattura.ritenutaAcconto)}
NETTO A PAGARE: ${formatEuro(risultatoFattura.nettoAPagare)}
    `.trim();

    navigator.clipboard.writeText(testo);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const categoriaSelezionata = CATEGORIE_DM143[categoria as keyof typeof CATEGORIE_DM143];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calculator className="w-6 h-6" />
            Calcolatore Parcella Professionale
          </h2>
          <p className="text-gray-600 mt-1">DM 17 giugno 2016 (ex DM 143/2013)</p>
        </div>
        {currentStep === 'risultato' && (
          <Button onClick={handleReset} variant="outline">
            Nuovo Calcolo
          </Button>
        )}
      </div>

      {/* Progress Indicator */}
      <div className="flex items-center gap-2">
        {['categoria', 'prestazioni', 'calcolo', 'risultato'].map((step, index) => (
          <div key={step} className="flex items-center flex-1">
            <div className={`flex-1 h-2 rounded-full ${
              currentStep === step ? 'bg-secondary' :
              index < ['categoria', 'prestazioni', 'calcolo', 'risultato'].indexOf(currentStep) ? 'bg-secondary/50' : 'bg-gray-200'
            }`} />
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          {/* Step 1: Categoria e Importo */}
          {currentStep === 'categoria' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">1. Seleziona Categoria e Importo Opere</h3>

                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <Label htmlFor="importoOpere">Importo Opere (€) *</Label>
                    <Input
                      id="importoOpere"
                      type="number"
                      value={importoOpere || ''}
                      onChange={(e) => setImportoOpere(parseFloat(e.target.value) || 0)}
                      placeholder="es. 500000"
                      className="text-lg font-semibold"
                    />
                  </div>

                  <div>
                    <Label htmlFor="categoria">Categoria Opera *</Label>
                    <Select value={categoria} onValueChange={(v) => {
                      setCategoria(v);
                      setArticolazione('01');
                    }}>
                      <SelectTrigger id="categoria">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORIE_DM143).map(([key, cat]) => (
                          <SelectItem key={key} value={key}>
                            {key} - {cat.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {categoriaSelezionata && (
                      <p className="text-xs text-gray-600 mt-1">{categoriaSelezionata.descrizione}</p>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <Label htmlFor="articolazione">Articolazione / Fascia di Importo *</Label>
                  <Select value={articolazione} onValueChange={setArticolazione}>
                    <SelectTrigger id="articolazione">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriaSelezionata && Object.entries(categoriaSelezionata.articolazioni).map(([key, desc]) => (
                        <SelectItem key={key} value={key}>
                          {categoria}.{key} - {desc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-4">
                  <Label htmlFor="complessita">Grado di Complessità *</Label>
                  <Select value={complessita} onValueChange={(v: any) => setComplessita(v)}>
                    <SelectTrigger id="complessita">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minima">Minima (0.75x)</SelectItem>
                      <SelectItem value="bassa">Bassa (0.85x)</SelectItem>
                      <SelectItem value="media">Media (1.0x)</SelectItem>
                      <SelectItem value="alta">Alta (1.2x)</SelectItem>
                      <SelectItem value="altissima">Altissima (1.4x)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => setCurrentStep('prestazioni')}
                  disabled={importoOpere <= 0}
                >
                  Avanti: Seleziona Prestazioni
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Prestazioni */}
          {currentStep === 'prestazioni' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">2. Seleziona Prestazioni</h3>
                <Button variant="outline" size="sm" onClick={() => setCurrentStep('categoria')}>
                  Indietro
                </Button>
              </div>

              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-6">
                  {/* Progettazione */}
                  <div>
                    <h4 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2">
                      <Ruler className="h-4 w-4 text-gray-500" aria-hidden="true" />
                      PROGETTAZIONE
                    </h4>
                    <div className="space-y-2">
                      {[
                        { key: 'rp', label: 'Relazione Paesaggistica' },
                        { key: 'rilievo', label: 'Rilievo e Restituzione Grafica' },
                        { key: 'pfte', label: 'Progetto di Fattibilità Tecnico-Economica (PFTE)' },
                        { key: 'definitivo', label: 'Progettazione Definitiva' },
                        { key: 'esecutivo', label: 'Progettazione Esecutiva' }
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={prestazioni[key as keyof typeof prestazioni] || false}
                            onChange={() => handlePrestazioneToggle(key)}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Direzione e Coordinamento */}
                  <div>
                    <h4 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2">
                      <HardHat className="h-4 w-4 text-gray-500" aria-hidden="true" />
                      DIREZIONE E COORDINAMENTO
                    </h4>
                    <div className="space-y-2">
                      {[
                        { key: 'dl', label: 'Direzione Lavori' },
                        { key: 'dlStrutture', label: 'Direzione Lavori Strutture' },
                        { key: 'dlImpianti', label: 'Direzione Lavori Impianti' },
                        { key: 'mis', label: 'Misura e Contabilità Lavori' },
                        { key: 'coordinamento', label: 'Coordinamento Sicurezza Progettazione (CSP)' },
                        { key: 'coordinamentoEsecuzione', label: 'Coordinamento Sicurezza Esecuzione (CSE)' }
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={prestazioni[key as keyof typeof prestazioni] || false}
                            onChange={() => handlePrestazioneToggle(key)}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Collaudi e Verifiche */}
                  <div>
                    <h4 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-gray-500" aria-hidden="true" />
                      COLLAUDI E VERIFICHE
                    </h4>
                    <div className="space-y-2">
                      {[
                        { key: 'collaudo', label: 'Collaudo Tecnico-Amministrativo' },
                        { key: 'collaudoStatico', label: 'Collaudo Statico' },
                        { key: 'verificaProgetto', label: 'Verifica di Progetto' }
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={prestazioni[key as keyof typeof prestazioni] || false}
                            onChange={() => handlePrestazioneToggle(key)}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Altre Prestazioni */}
                  <div>
                    <h4 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-gray-500" aria-hidden="true" />
                      ALTRE PRESTAZIONI
                    </h4>
                    <div className="space-y-2">
                      {[
                        { key: 'durc', label: 'Attestazione Rispetto Norme Sicurezza (DURC)' },
                        { key: 'praticheVVF', label: 'Pratiche Vigili del Fuoco (VVF)' },
                        { key: 'certificazioneEnergetica', label: 'Certificazione Energetica (APE)' },
                        { key: 'sue', label: 'Sicurezza e Salute (SUE)' },
                        { key: 'pareriEnti', label: 'Acquisizione Pareri Enti e Autorità' },
                        { key: 'perizia', label: 'Perizia Estimativa / CTU' },
                        { key: 'valutatoreImmobiliare', label: 'Valutazione Immobiliare' },
                        { key: 'due', label: 'Documento Unico Regolarità Edilizia (DUE)' }
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={prestazioni[key as keyof typeof prestazioni] || false}
                            onChange={() => handlePrestazioneToggle(key)}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollArea>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep('categoria')}>
                  Indietro
                </Button>
                <Button
                  onClick={() => setCurrentStep('calcolo')}
                  disabled={Object.values(prestazioni).filter(Boolean).length === 0}
                >
                  Avanti: Parametri Fattura
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Parametri Fattura */}
          {currentStep === 'calcolo' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">3. Parametri Fatturazione</h3>
                <Button variant="outline" size="sm" onClick={() => setCurrentStep('prestazioni')}>
                  Indietro
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="cpa">Aliquota CPA (%)</Label>
                  <Input
                    id="cpa"
                    type="number"
                    value={aliquotaCPA}
                    onChange={(e) => setAliquotaCPA(parseFloat(e.target.value) || 0)}
                    min="0"
                    max="100"
                    step="0.1"
                  />
                  <p className="text-xs text-gray-500 mt-1">Cassa Previdenziale (di solito 4%)</p>
                </div>

                <div>
                  <Label htmlFor="iva">Aliquota IVA (%)</Label>
                  <Input
                    id="iva"
                    type="number"
                    value={aliquotaIVA}
                    onChange={(e) => setAliquotaIVA(parseFloat(e.target.value) || 0)}
                    min="0"
                    max="100"
                    step="1"
                  />
                  <p className="text-xs text-gray-500 mt-1">Di solito 22%</p>
                </div>

                <div>
                  <Label htmlFor="ritenuta">Ritenuta d'Acconto (%)</Label>
                  <Input
                    id="ritenuta"
                    type="number"
                    value={aliquotaRitenuta}
                    onChange={(e) => setAliquotaRitenuta(parseFloat(e.target.value) || 0)}
                    min="0"
                    max="100"
                    step="1"
                  />
                  <p className="text-xs text-gray-500 mt-1">Di solito 20%</p>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep('prestazioni')}>
                  Indietro
                </Button>
                <Button onClick={handleCalcola} className="bg-secondary hover:bg-secondary/90">
                  <Calculator className="w-4 h-4 mr-2" />
                  Calcola Parcella
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Risultato */}
          {currentStep === 'risultato' && risultatoParcella && risultatoFattura && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Risultato Calcolo</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyRiepilogo}
                  className="gap-2"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copiato!' : 'Copia Riepilogo'}
                </Button>
              </div>

              {/* Note */}
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <div className="space-y-1 text-sm">
                    {risultatoParcella.note.map((nota, i) => (
                      <p key={i} className="text-blue-900">{nota}</p>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Compensi per Gruppo */}
              <Tabs defaultValue="all">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="all">Tutte</TabsTrigger>
                  <TabsTrigger value="progettazione">Prog.</TabsTrigger>
                  <TabsTrigger value="direzione">Dir.</TabsTrigger>
                  <TabsTrigger value="sicurezza">Sic.</TabsTrigger>
                  <TabsTrigger value="altro">Altro</TabsTrigger>
                </TabsList>

                {['all', 'progettazione', 'direzione', 'sicurezza', 'altro'].map(gruppo => (
                  <TabsContent key={gruppo} value={gruppo} className="space-y-2 mt-4">
                    {Object.values(risultatoParcella.compensi)
                      .filter(c => gruppo === 'all' || c.gruppo === gruppo)
                      .map((compenso, i) => (
                        <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <div className="font-medium">{compenso.prestazione}</div>
                            <div className="text-sm text-gray-600">
                              {compenso.percentuale.toFixed(2)}% su €{importoOpere.toLocaleString('it-IT')}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-lg">{formatEuro(compenso.importo)}</div>
                            <Badge variant="secondary" className="text-xs">
                              {compenso.gruppo}
                            </Badge>
                          </div>
                        </div>
                      ))}
                  </TabsContent>
                ))}
              </Tabs>

              <Separator />

              {/* Riepilogo Compenso */}
              <Card className="bg-secondary/10">
                <CardHeader>
                  <CardTitle>Compenso Totale</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-secondary">
                    {formatEuro(risultatoParcella.compensoTotale)}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Percentuale totale: {risultatoParcella.percentualeTotale.toFixed(2)}%
                  </p>
                </CardContent>
              </Card>

              {/* Calcolo Fattura */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Calcolo Fattura
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>Compenso netto:</span>
                    <span className="font-semibold">{formatEuro(risultatoFattura.compensoNetto)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>CPA ({aliquotaCPA}%):</span>
                    <span className="font-semibold">{formatEuro(risultatoFattura.cpa)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Imponibile:</span>
                    <span>{formatEuro(risultatoFattura.imponibile)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>IVA ({aliquotaIVA}%):</span>
                    <span className="font-semibold">{formatEuro(risultatoFattura.iva)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Totale con IVA:</span>
                    <span>{formatEuro(risultatoFattura.totaleConIVA)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-red-600">
                    <span>Ritenuta d'acconto ({aliquotaRitenuta}%):</span>
                    <span className="font-semibold">-{formatEuro(risultatoFattura.ritenutaAcconto)}</span>
                  </div>
                  <Separator className="border-2" />
                  <div className="flex justify-between text-xl font-bold text-green-600">
                    <span>NETTO A PAGARE:</span>
                    <span>{formatEuro(risultatoFattura.nettoAPagare)}</span>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={handleReset}>
                  Nuovo Calcolo
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
