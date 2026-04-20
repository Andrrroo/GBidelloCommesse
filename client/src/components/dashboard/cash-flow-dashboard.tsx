import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/financial-utils";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Building2,
  Receipt,
  Building
} from "lucide-react";

interface CashFlowData {
  entrate: {
    totaleEmesso: number;
    totaleIncassato: number;
    totaleDaIncassare: number;
    fatture: number;
  };
  uscite: {
    totale: number;
    pagate: number;
    daPagare: number;
    dettaglio: {
      fattureIngresso: { totale: number; pagate: number; daPagare: number };
      fattureConsulenti: { totale: number; pagate: number; daPagare: number };
      costiVivi: { totale: number };
      costiGenerali: { totale: number; pagati: number; daPagare: number };
    };
  };
  saldo: number;
  saldoPrevisionale: number;
}

interface CashFlowDashboardProps {
  isAdmin?: boolean;
}

export default function CashFlowDashboard({ isAdmin = false }: CashFlowDashboardProps) {
  // Endpoint admin-only: evita fetch 403 per i collaboratori e nasconde la card.
  const { data: cashFlow, isLoading } = useQuery<CashFlowData>({
    queryKey: ["cash-flow"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/cash-flow");
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    },
    enabled: isAdmin,
  });

  if (!isAdmin) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Cash Flow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!cashFlow) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Cash Flow
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Saldo principale */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`p-4 rounded-lg ${cashFlow.saldo >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Saldo Attuale</span>
              {cashFlow.saldo >= 0 ? (
                <TrendingUp className="h-5 w-5 text-green-500" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-500" />
              )}
            </div>
            <p className={`text-2xl font-bold ${cashFlow.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(cashFlow.saldo)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Incassato - Pagato</p>
          </div>

          <div className={`p-4 rounded-lg ${cashFlow.saldoPrevisionale >= 0 ? 'bg-blue-50 border border-blue-200' : 'bg-orange-50 border border-orange-200'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Saldo Previsionale</span>
              {cashFlow.saldoPrevisionale >= 0 ? (
                <TrendingUp className="h-5 w-5 text-blue-500" />
              ) : (
                <TrendingDown className="h-5 w-5 text-orange-500" />
              )}
            </div>
            <p className={`text-2xl font-bold ${cashFlow.saldoPrevisionale >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
              {formatCurrency(cashFlow.saldoPrevisionale)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Emesso - Totale Uscite</p>
          </div>
        </div>

        {/* Entrate (solo admin può vedere i dettagli delle fatture emesse) */}
        {isAdmin && (
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2 text-green-700">
              <ArrowUpRight className="h-4 w-4" />
              Entrate
            </h4>
            <div className="bg-green-50 rounded-lg p-4 border border-green-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">Fatture Emesse</span>
                </div>
                <Badge variant="secondary">{cashFlow.entrate.fatture}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-500">Totale</p>
                  <p className="font-semibold">{formatCurrency(cashFlow.entrate.totaleEmesso)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Incassato</p>
                  <p className="font-semibold text-green-600">{formatCurrency(cashFlow.entrate.totaleIncassato)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Da Incassare</p>
                  <p className="font-semibold text-orange-600">{formatCurrency(cashFlow.entrate.totaleDaIncassare)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Uscite */}
        <div className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2 text-red-700">
            <ArrowDownRight className="h-4 w-4" />
            Uscite
          </h4>

          {/* Riepilogo uscite */}
          <div className="bg-red-50 rounded-lg p-4 border border-red-100 mb-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-500">Totale</p>
                <p className="font-semibold">{formatCurrency(cashFlow.uscite.totale)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Pagate</p>
                <p className="font-semibold text-green-600">{formatCurrency(cashFlow.uscite.pagate)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Da Pagare</p>
                <p className="font-semibold text-red-600">{formatCurrency(cashFlow.uscite.daPagare)}</p>
              </div>
            </div>
          </div>

          {/* Dettaglio uscite */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Fatture Ingresso */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Receipt className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium">Fatture Fornitori</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Totale: {formatCurrency(cashFlow.uscite.dettaglio.fattureIngresso.totale)}</span>
                {cashFlow.uscite.dettaglio.fattureIngresso.daPagare > 0 && (
                  <span className="text-red-600">
                    -{formatCurrency(cashFlow.uscite.dettaglio.fattureIngresso.daPagare)}
                  </span>
                )}
              </div>
            </div>

            {/* Fatture Consulenti - solo admin */}
            {isAdmin && (
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium">Fatture Consulenti</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Totale: {formatCurrency(cashFlow.uscite.dettaglio.fattureConsulenti.totale)}</span>
                  {cashFlow.uscite.dettaglio.fattureConsulenti.daPagare > 0 && (
                    <span className="text-red-600">
                      -{formatCurrency(cashFlow.uscite.dettaglio.fattureConsulenti.daPagare)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Costi Vivi */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium">Costi Vivi</span>
              </div>
              <div className="text-sm">
                <span>Totale: {formatCurrency(cashFlow.uscite.dettaglio.costiVivi.totale)}</span>
              </div>
            </div>

            {/* Costi Generali - solo admin */}
            {isAdmin && (
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Building className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium">Costi Generali</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Totale: {formatCurrency(cashFlow.uscite.dettaglio.costiGenerali.totale)}</span>
                  {cashFlow.uscite.dettaglio.costiGenerali.daPagare > 0 && (
                    <span className="text-red-600">
                      -{formatCurrency(cashFlow.uscite.dettaglio.costiGenerali.daPagare)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
