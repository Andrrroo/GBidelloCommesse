import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatCurrency } from "@/lib/financial-utils";

export interface PieDatum {
  name: string;
  value: number;
}

interface Props {
  entrate: PieDatum[];
  uscite: PieDatum[];
  emptyEntrateMessage?: string;
  emptyUsciteMessage?: string;
  entrateTitle?: string;
  usciteTitle?: string;
  height?: number;
  topN?: number;
}

// Palette replicate da dashboard/entrate-uscite-chart.tsx per coerenza visiva.
const PALETTE_ENTRATE = ["#10B981", "#34D399", "#6EE7B7", "#059669", "#047857", "#065F46", "#A7F3D0", "#ECFDF5"];
const PALETTE_USCITE = ["#EF4444", "#F87171", "#FCA5A5", "#DC2626", "#B91C1C", "#991B1B", "#FEE2E2", "#FEF2F2"];
const COLOR_ALTRI = "#9CA3AF";
const DEFAULT_TOP_N = 6;
const MAX_LABEL_LEN = 22;

function topNWithOthers(data: PieDatum[], topN: number): (PieDatum & { isOthers?: boolean })[] {
  if (data.length <= topN) return data;
  const top = data.slice(0, topN);
  const rest = data.slice(topN);
  const restSum = rest.reduce((s, x) => s + x.value, 0);
  return [...top, { name: `Altri (${rest.length})`, value: restSum, isOthers: true }];
}

function truncateName(name: string): string {
  return name.length > MAX_LABEL_LEN ? name.slice(0, MAX_LABEL_LEN - 1) + "…" : name;
}

function renderInnerLabel(props: any) {
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
      fontSize={12}
      fontWeight={700}
      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

function makeTooltipContent(totale: number) {
  return ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const entry = payload[0];
    const value = entry.value as number;
    const name = entry.name as string;
    const pct = totale > 0 ? (value / totale) * 100 : 0;
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-md px-3 py-2 text-xs">
        <div className="font-semibold text-gray-800 mb-0.5">{name}</div>
        <div className="text-gray-700">{formatCurrency(value)}</div>
        <div className="text-gray-500">{pct.toFixed(1)}% del totale</div>
      </div>
    );
  };
}

function PiePanel({
  title,
  data,
  palette,
  emptyMessage,
  height,
  topN,
  keyPrefix,
}: {
  title: string;
  data: PieDatum[];
  palette: string[];
  emptyMessage: string;
  height: number;
  topN: number;
  keyPrefix: string;
}) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const totale = sorted.reduce((s, x) => s + x.value, 0);
  const chartData = topNWithOthers(sorted, topN);

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <h4 className="text-sm font-semibold text-gray-700 mb-2 text-center">{title}</h4>
      {sorted.length === 0 ? (
        <div className="flex items-center justify-center text-sm text-gray-500 italic" style={{ height }}>
          {emptyMessage}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="38%"
              outerRadius={85}
              dataKey="value"
              label={renderInnerLabel}
              labelLine={false}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`${keyPrefix}-${index}`}
                  fill={entry.isOthers ? COLOR_ALTRI : palette[index % palette.length]}
                />
              ))}
            </Pie>
            <Tooltip content={makeTooltipContent(totale)} />
            <Legend
              verticalAlign="bottom"
              align="center"
              iconSize={10}
              wrapperStyle={{ fontSize: "11px", lineHeight: "14px", bottom: 0, paddingTop: 0 }}
              formatter={(value: string) => truncateName(value)}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function EntrateUsciteBreakdown({
  entrate,
  uscite,
  emptyEntrateMessage = "Nessuna entrata",
  emptyUsciteMessage = "Nessuna uscita",
  entrateTitle = "Entrate per Cliente",
  usciteTitle = "Uscite per Fornitore",
  height = 320,
  topN = DEFAULT_TOP_N,
}: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <PiePanel
        title={entrateTitle}
        data={entrate}
        palette={PALETTE_ENTRATE}
        emptyMessage={emptyEntrateMessage}
        height={height}
        topN={topN}
        keyPrefix="e"
      />
      <PiePanel
        title={usciteTitle}
        data={uscite}
        palette={PALETTE_USCITE}
        emptyMessage={emptyUsciteMessage}
        height={height}
        topN={topN}
        keyPrefix="u"
      />
    </div>
  );
}

// Pie unico con entrate (palette verde) e uscite (palette rossa) fuse.
// Usato nel riepilogo della singola commessa dove servono i dettagli dei
// singoli fornitori/fatture ma in un solo grafico invece di due.
interface CombinedProps {
  entrate: PieDatum[];
  uscite: PieDatum[];
  emptyMessage?: string;
  height?: number;
  topN?: number;
}

export function EntrateUsciteCombinedPie({
  entrate,
  uscite,
  emptyMessage = "Nessun dato economico",
  height = 320,
  topN = 10,
}: CombinedProps) {
  // Ordino separatamente entrate e uscite (per valore decrescente) e le
  // applico top-N su ciascun gruppo per evitare che un gruppo dominante
  // copra tutte le voci dell'altro.
  const entrateSorted = [...entrate].sort((a, b) => b.value - a.value);
  const usciteSorted = [...uscite].sort((a, b) => b.value - a.value);
  const entrateTop = topNWithOthers(entrateSorted, topN);
  const usciteTop = topNWithOthers(usciteSorted, topN);

  // Colori: verde progressivo per entrate, rosso per uscite, grigio per "Altri".
  const combined = [
    ...entrateTop.map((d, i) => ({
      ...d,
      name: `↑ ${d.name}`,
      color: d.isOthers ? COLOR_ALTRI : PALETTE_ENTRATE[i % PALETTE_ENTRATE.length],
    })),
    ...usciteTop.map((d, i) => ({
      ...d,
      name: `↓ ${d.name}`,
      color: d.isOthers ? COLOR_ALTRI : PALETTE_USCITE[i % PALETTE_USCITE.length],
    })),
  ];

  const totale = combined.reduce((s, x) => s + x.value, 0);

  if (combined.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-gray-500 italic" style={{ height }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={combined}
          cx="50%"
          cy="42%"
          outerRadius={95}
          dataKey="value"
          label={renderInnerLabel}
          labelLine={false}
        >
          {combined.map((entry, index) => (
            <Cell key={`c-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={makeTooltipContent(totale)} />
        <Legend
          verticalAlign="bottom"
          align="center"
          iconSize={10}
          wrapperStyle={{ fontSize: "11px", lineHeight: "14px", bottom: 0, paddingTop: 0 }}
          formatter={(value: string) => truncateName(value)}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
