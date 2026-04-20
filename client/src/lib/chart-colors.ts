/**
 * Palette unificata per tutti i grafici Recharts dell'app.
 * Mantenere qui i colori invece di disperderli nei singoli componenti
 * garantisce coerenza visiva e semplifica eventuali rebranding.
 *
 * Semantica:
 *   - ENTRATE / positivo / ricavo  → verde
 *   - USCITE  / negativo / costo   → rosso
 *   - NEUTRO  / info / generico    → blu
 *   - WARNING / pending            → ambra
 *   - ACCENT  / highlight          → viola
 */
export const CHART_COLORS = {
  primary: '#3B82F6',   // blue-500
  success: '#10B981',   // emerald-500
  danger:  '#EF4444',   // red-500
  warning: '#F59E0B',   // amber-500
  accent:  '#8B5CF6',   // violet-500
  neutral: '#6B7280',   // gray-500
} as const;

/**
 * Palette estesa per PieChart e BarChart con molte categorie.
 * Ordinata in modo che colori adiacenti siano visivamente distinguibili.
 */
export const CHART_PALETTE = [
  CHART_COLORS.primary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.accent,
  CHART_COLORS.danger,
  CHART_COLORS.neutral,
  '#EC4899', // pink-500
  '#14B8A6', // teal-500
  '#F97316', // orange-500
  '#06B6D4', // cyan-500
] as const;

/** Colori semantici per entrate vs uscite (grafici cash-flow) */
export const CHART_ENTRATE = CHART_COLORS.success;
export const CHART_USCITE  = CHART_COLORS.danger;

/** Stile uniforme per Tooltip Recharts */
export const CHART_TOOLTIP_STYLE = {
  borderRadius: '0.5rem',
  border: '1px solid #E5E7EB',
  backgroundColor: '#ffffff',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
} as const;
