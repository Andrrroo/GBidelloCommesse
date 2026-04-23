import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Filtro per anno riutilizzabile: mostra "Tutti gli anni" + lista anni passati come prop.
 * La convenzione è "all" = nessun filtro (aggregato su tutti i dati).
 *
 * Pattern:
 *   const [year, setYear] = useState(ALL_YEARS);
 *   <YearFilter value={year} onChange={setYear} years={availableYears} />
 *   const filtered = year === ALL_YEARS ? all : all.filter(x => getYear(x.date) === Number(year));
 */

export const ALL_YEARS = "all";

export function getYearFromISO(s?: string | null): number | null {
  if (!s) return null;
  const y = Number(String(s).slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

/**
 * Estrae la lista di anni ≥ 2025 ordinati decrescente dai dataset passati.
 * Usa `dateFields` per leggere il campo data giusto per ogni array.
 *
 * Esempio:
 *   const years = collectYears([
 *     [fattureEmesse, 'dataEmissione'],
 *     [costiVivi, 'data'],
 *   ]);
 */
export function collectYears<T>(sources: Array<[items: T[], dateField: keyof T]>): number[] {
  const set = new Set<number>();
  for (const [items, field] of sources) {
    for (const it of items) {
      const y = getYearFromISO(it[field] as unknown as string);
      if (y) set.add(y);
    }
  }
  return Array.from(set).filter(y => y >= 2025).sort((a, b) => b - a);
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  years: number[];
  className?: string;
  "data-testid"?: string;
}

export function YearFilter({ value, onChange, years, className, "data-testid": testId }: Props) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`w-[160px] ${className || ""}`} data-testid={testId || "select-year-filter"}>
        <SelectValue placeholder="Anno" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_YEARS}>Tutti gli anni</SelectItem>
        {years.map((y) => (
          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
