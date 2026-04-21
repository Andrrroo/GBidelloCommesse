import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar, Copy, RefreshCw, Check, Loader2, Smartphone, Eye, EyeOff } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CalendarToken {
  token: string;
  feedUrl: string;
}

export default function CalendarFeedPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  // URL e QR code sono nascosti di default per evitare che qualcuno di
  // passaggio davanti allo schermo (o uno screenshot condiviso) veda il
  // token. L'utente deve cliccare "Mostra" per rivelarli.
  const [revealed, setRevealed] = useState(false);

  const { data, isLoading } = useQuery<CalendarToken>({
    queryKey: ["/api/calendar/token"],
    queryFn: async () => (await apiRequest("GET", "/api/calendar/token")).json(),
  });

  const regenerate = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/calendar/token/regenerate")).json(),
    onSuccess: (fresh: CalendarToken) => {
      queryClient.setQueryData(["/api/calendar/token"], fresh);
      toast({
        title: "Token rigenerato",
        description: "Il vecchio URL non funziona più. Aggiorna la sottoscrizione nel tuo calendar.",
      });
      setShowRegenerateConfirm(false);
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile rigenerare il token", variant: "destructive" });
    },
  });

  const copyUrl = async () => {
    if (!data?.feedUrl) return;
    try {
      await navigator.clipboard.writeText(data.feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Errore", description: "Impossibile copiare l'URL", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-secondary" />
            Calendario personale
          </CardTitle>
          <CardDescription>
            Sottoscrivi questo URL nel tuo Google Calendar / Apple Calendar / Outlook per
            vedere scadenze, fatture in scadenza, costi e comunicazioni nel calendar. Il
            feed è in sola lettura e si aggiorna automaticamente ogni ora circa. Non contiene
            importi in euro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Caricamento…
            </div>
          ) : !revealed ? (
            /* Stato nascosto: un solo bottone "Mostra" al centro.
               Protegge il token da sguardi casuali / screenshot. */
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-8">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <EyeOff className="h-4 w-4" />
                URL e QR code nascosti
              </div>
              <Button
                onClick={() => setRevealed(true)}
                className="gap-2"
                data-testid="reveal-calendar-feed"
              >
                <Eye className="h-4 w-4" />
                Mostra URL calendario
              </Button>
              <p className="text-xs text-gray-500 text-center max-w-sm px-4">
                Tienilo nascosto se condividi lo schermo o fai screenshot: chiunque veda
                l'URL può sottoscrivere il tuo calendario.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-start">
                {/* Colonna sinistra: URL + istruzioni copia */}
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-gray-600">URL del feed iCal</label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevealed(false)}
                      className="h-7 gap-1.5 text-xs text-gray-500"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                      Nascondi
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={data?.feedUrl ?? ""}
                      className="font-mono text-xs"
                      onFocus={(e) => e.currentTarget.select()}
                      data-testid="calendar-feed-url"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={copyUrl}
                      title="Copia URL"
                      aria-label="Copia URL"
                    >
                      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    L'URL è personale: non condividerlo. Chi lo conosce può vedere le tue scadenze.
                  </p>
                </div>

                {/* Colonna destra: QR code webcal:// per sottoscrizione mobile */}
                {data?.feedUrl && (
                  <div className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                      <Smartphone className="h-3.5 w-3.5" />
                      Scansiona dal telefono
                    </div>
                    <div className="rounded-md bg-white p-2">
                      <QRCodeSVG
                        value={data.feedUrl.replace(/^https?:/, "webcal:")}
                        size={140}
                        level="M"
                        marginSize={0}
                      />
                    </div>
                    <p className="text-xs text-gray-500 text-center max-w-[180px] leading-snug">
                      iOS/macOS aprono direttamente il prompt di sottoscrizione calendario.
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-gray-100">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRegenerateConfirm(true)}
                  disabled={regenerate.isPending}
                  className="gap-2"
                >
                  {regenerate.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Rigenera token
                </Button>
                <p className="text-xs text-gray-500 mt-2">
                  Rigenera se pensi che qualcuno abbia l'URL. Il vecchio link smette di
                  funzionare: dovrai risottoscriverti nel calendar con il nuovo URL.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Come sottoscrivere</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible>
            <AccordionItem value="google">
              <AccordionTrigger>Google Calendar</AccordionTrigger>
              <AccordionContent>
                <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                  <li>Apri Google Calendar su desktop (calendar.google.com)</li>
                  <li>Nel menu a sinistra, accanto a "Altri calendari", clicca <b>+</b></li>
                  <li>Scegli <b>Da URL</b></li>
                  <li>Incolla l'URL del feed e conferma</li>
                  <li>Il calendario appare tra "Altri calendari" entro pochi minuti</li>
                </ol>
                <p className="text-xs text-gray-500 mt-2">
                  Google ricarica il feed ogni ~4-24 ore. Per un aggiornamento immediato,
                  rimuovi e riaggiungi la sottoscrizione.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="apple">
              <AccordionTrigger>Apple Calendar (macOS / iOS)</AccordionTrigger>
              <AccordionContent>
                <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                  <li>Apri l'app Calendario</li>
                  <li>Menu <b>File → Nuova sottoscrizione calendario</b> (macOS) oppure <b>Impostazioni → Account → Aggiungi account → Altro → Sottoscrizione calendario</b> (iOS)</li>
                  <li>Incolla l'URL e scegli la frequenza di aggiornamento</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="outlook">
              <AccordionTrigger>Outlook</AccordionTrigger>
              <AccordionContent>
                <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                  <li>In Outlook Web: <b>Calendario → Aggiungi calendario → Sottoscrivi da web</b></li>
                  <li>Incolla l'URL, assegna un nome e conferma</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <AlertDialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rigenerare il token?</AlertDialogTitle>
            <AlertDialogDescription>
              Il link attuale smetterà immediatamente di funzionare. Se hai già sottoscritto
              il calendar in Google / Apple / Outlook, dovrai rimuoverlo e risottoscriverlo
              con il nuovo URL.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => regenerate.mutate()}>
              Rigenera
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
