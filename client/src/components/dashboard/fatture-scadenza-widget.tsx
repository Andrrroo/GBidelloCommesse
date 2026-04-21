import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Calendar, ArrowDown, ArrowUp, Building2, UserSquare2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, formatDateShort } from "@/lib/financial-utils";

interface FatturaScadenza {
  id: string;
  tipo: 'ingresso' | 'consulente' | 'emessa' | 'costo_generale';
  dataScadenzaPagamento?: string;
  dataScadenza?: string;
  importo?: number;
  importoTotale?: number;
  fornitore?: string;
  consulente?: string;
  cliente?: string;
  categoria?: string;
  descrizione?: string;
  numeroFattura?: string;
}

interface PagamentoPendente {
  id: string;
  collaboratoreNome: string;
  projectCode: string;
  projectClient: string;
  role: string;
  oreDaPagare: number;
  importoDaPagare?: number; // opzionale: solo admin
}

export default function FattureScadenzaWidget() {
  const { data: scadenze = [], isLoading } = useQuery<FatturaScadenza[]>({
    queryKey: ["/api/fatture-in-scadenza"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/fatture-in-scadenza");
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    },
    refetchInterval: 60000
  });

  const { data: pagamentiPendenti = [], isLoading: isLoadingPagamenti } = useQuery<PagamentoPendente[]>({
    queryKey: ["/api/pagamenti-collaboratori-pendenti"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/pagamenti-collaboratori-pendenti");
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    },
    refetchInterval: 60000
  });

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  const getScadenzaStatus = (dataStr: string) => {
    const data = new Date(dataStr);
    data.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((data.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: "Scaduta", variant: "destructive" as const, icon: AlertTriangle };
    if (diffDays === 0) return { label: "Oggi", variant: "destructive" as const, icon: AlertTriangle };
    if (diffDays <= 7) return { label: `${diffDays}g`, variant: "outline" as const, icon: Calendar };
    return { label: `${diffDays}g`, variant: "secondary" as const, icon: Calendar };
  };

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case 'ingresso': return { label: 'Fatt. Ingresso', icon: ArrowDown, color: 'text-red-500' };
      case 'consulente': return { label: 'Consulente', icon: Building2, color: 'text-orange-500' };
      case 'emessa': return { label: 'Fatt. Emessa', icon: ArrowUp, color: 'text-green-500' };
      case 'costo_generale': return { label: 'Costo Generale', icon: Building2, color: 'text-blue-500' };
      default: return { label: tipo, icon: Calendar, color: 'text-gray-500' };
    }
  };


  const totalCount = scadenze.length + pagamentiPendenti.length;

  if (isLoading || isLoadingPagamenti) {
    return (
      <Card className="border-orange-200 bg-orange-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Scadenze Imminenti
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-gray-200 rounded-md w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded-md w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (totalCount === 0) {
    return (
      <Card className="border-green-200 bg-green-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-green-500" />
            Scadenze Imminenti
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-green-600">Nessuna scadenza o pagamento pendente</p>
        </CardContent>
      </Card>
    );
  }

  const scaduteCount = scadenze.filter(s => {
    const data = s.dataScadenzaPagamento || s.dataScadenza;
    return data && new Date(data) < oggi;
  }).length;

  const hasAlarms = scaduteCount > 0 || pagamentiPendenti.length > 0;

  return (
    <Card className={`${scaduteCount > 0 ? 'border-red-200 bg-red-50/50' : hasAlarms ? 'border-orange-200 bg-orange-50/50' : 'border-gray-200 bg-gray-50/50'}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className={`h-5 w-5 ${scaduteCount > 0 ? 'text-red-500' : 'text-orange-500'}`} />
            Scadenze Imminenti
          </span>
          <Badge variant={scaduteCount > 0 ? "destructive" : "secondary"}>
            {totalCount}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {/* Pagamenti collaboratori pendenti */}
          {pagamentiPendenti.slice(0, 5).map((pag) => (
            <div
              key={`pagamento-${pag.id}`}
              className="flex items-center justify-between p-2 bg-white rounded-lg border border-purple-100 hover:bg-gray-50"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <UserSquare2 className="h-4 w-4 flex-shrink-0 text-purple-500" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{pag.collaboratoreNome}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {pag.projectCode} — {pag.oreDaPagare}h da pagare
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {pag.importoDaPagare !== undefined && (
                  <span className="text-sm font-semibold">{formatCurrency(pag.importoDaPagare)}</span>
                )}
                <Badge variant="outline" className="text-xs bg-purple-50 border-purple-300 text-purple-700">
                  Pagare
                </Badge>
              </div>
            </div>
          ))}
          {pagamentiPendenti.length > 5 && (
            <p className="text-xs text-gray-500 text-center">
              + {pagamentiPendenti.length - 5} altri pagamenti pendenti
            </p>
          )}

          {/* Scadenze fatture */}
          {scadenze.slice(0, 10).map((scadenza) => {
            const dataScadenza = scadenza.dataScadenzaPagamento || scadenza.dataScadenza || '';
            const status = getScadenzaStatus(dataScadenza);
            const tipoInfo = getTipoLabel(scadenza.tipo);
            const TipoIcon = tipoInfo.icon;
            // Importo non presente = sanitizzato dal server per non-admin
            // (p.es. fattura emessa senza importi: il collaboratore vede la
            // scadenza ma non il guadagno).
            const importoRaw = scadenza.importoTotale ?? scadenza.importo;
            const soggetto = scadenza.fornitore || scadenza.consulente || scadenza.cliente || scadenza.descrizione;

            return (
              <div
                key={`${scadenza.tipo}-${scadenza.id}`}
                className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-100 hover:bg-gray-50"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <TipoIcon className={`h-4 w-4 flex-shrink-0 ${tipoInfo.color}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{soggetto}</p>
                    <p className="text-xs text-gray-500">
                      {scadenza.numeroFattura && `#${scadenza.numeroFattura} - `}
                      {formatDateShort(dataScadenza)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {importoRaw !== undefined && (
                    <span className="text-sm font-semibold">{formatCurrency(importoRaw)}</span>
                  )}
                  <Badge variant={status.variant} className="text-xs">
                    {status.label}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
        {scadenze.length > 10 && (
          <p className="text-xs text-gray-500 text-center mt-2">
            + {scadenze.length - 10} altre scadenze fatture
          </p>
        )}
      </CardContent>
    </Card>
  );
}
