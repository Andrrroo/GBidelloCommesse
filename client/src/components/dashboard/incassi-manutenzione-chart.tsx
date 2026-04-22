import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Wrench, HardHat } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/financial-utils";
import { useAuth } from "@/hooks/useAuth";
import type { FatturaEmessa, Project } from "@shared/schema";

const COLORS = {
  nuovoLavoro: "#3B82F6", // blu
  manutenzione: "#F97316", // arancione
};

export default function IncassiManutenzioneChart() {
  const { user } = useAuth();
  const isAdmin = user?.role === "amministratore";

  const { data: fattureEmesse = [] } = useQuery<FatturaEmessa[]>({
    queryKey: ["/api/fatture-emesse"],
    queryFn: async () => (await apiRequest("GET", "/api/fatture-emesse")).json(),
    enabled: isAdmin,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => (await apiRequest("GET", "/api/projects")).json(),
    enabled: isAdmin,
  });

  // Guard difensivo: il widget è gated in dashboard.tsx per i collaboratori.
  if (!isAdmin) return null;

  // Mappa rapida projectId -> manutenzione
  const projectMap = new Map<string, boolean>();
  for (const p of projects) {
    projectMap.set(p.id, !!p.manutenzione);
  }

  // Conta solo le fatture incassate
  let totaleManutenzione = 0;
  let totaleNuovoLavoro = 0;
  let countManutenzione = 0;
  let countNuovoLavoro = 0;

  for (const f of fattureEmesse) {
    if (!f.incassata) continue;
    const isManutenzione = projectMap.get(f.projectId) ?? false;
    if (isManutenzione) {
      totaleManutenzione += f.importo;
      countManutenzione++;
    } else {
      totaleNuovoLavoro += f.importo;
      countNuovoLavoro++;
    }
  }

  const totaleIncassi = totaleManutenzione + totaleNuovoLavoro;
  const pctManutenzione = totaleIncassi > 0 ? (totaleManutenzione / totaleIncassi) * 100 : 0;
  const pctNuovoLavoro = totaleIncassi > 0 ? (totaleNuovoLavoro / totaleIncassi) * 100 : 0;

  const chartData = [
    { name: "Lavoro Professionale", value: totaleNuovoLavoro, color: COLORS.nuovoLavoro, count: countNuovoLavoro },
    { name: "Manutenzione", value: totaleManutenzione, color: COLORS.manutenzione, count: countManutenzione },
  ].filter(d => d.value > 0);

  // Etichetta percentuale all'interno della fetta
  const renderInnerLabel = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
    if (!percent || percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={14}
        fontWeight={700}
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  // Tooltip custom con valore + percentuale
  const TooltipContent = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const entry = payload[0];
    const value = entry.value as number;
    const name = entry.name as string;
    const count = entry.payload.count as number;
    const pct = totaleIncassi > 0 ? (value / totaleIncassi) * 100 : 0;
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-md px-3 py-2 text-xs">
        <div className="font-semibold text-gray-800 mb-0.5">{name}</div>
        <div className="text-gray-700">{formatCurrency(value)}</div>
        <div className="text-gray-500">{pct.toFixed(1)}% • {count} fattur{count === 1 ? 'a' : 'e'}</div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-orange-600" />
          Incassi: Manutenzione vs Lavoro Professionale
        </CardTitle>
        <CardDescription>
          Ripartizione percentuale degli incassi totali per tipologia di commessa
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Riepilogo numerico */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-center">
            <p className="text-xs text-blue-700 flex items-center justify-center gap-1">
              <HardHat className="h-3 w-3" /> Lavoro Professionale
            </p>
            <p className="font-bold text-blue-800">{formatCurrency(totaleNuovoLavoro)}</p>
            <p className="text-xs text-blue-600">{pctNuovoLavoro.toFixed(1)}%</p>
          </div>
          <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-center">
            <p className="text-xs text-orange-700 flex items-center justify-center gap-1">
              <Wrench className="h-3 w-3" /> Manutenzione
            </p>
            <p className="font-bold text-orange-800">{formatCurrency(totaleManutenzione)}</p>
            <p className="text-xs text-orange-600">{pctManutenzione.toFixed(1)}%</p>
          </div>
          <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-center">
            <p className="text-xs text-green-700">Totale Incassi</p>
            <p className="font-bold text-green-800">{formatCurrency(totaleIncassi)}</p>
            <p className="text-xs text-green-600">{countNuovoLavoro + countManutenzione} fatture</p>
          </div>
        </div>

        {/* Grafico a torta */}
        <div className="border border-gray-200 rounded-lg p-3">
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-[260px] text-sm text-gray-500 italic">
              Nessuna fattura incassata
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  dataKey="value"
                  label={renderInnerLabel}
                  labelLine={false}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<TooltipContent />} />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconSize={12}
                  wrapperStyle={{ fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
