import { ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  /** Variante colore per il valore (semantica, non hardcoded) */
  tone?: 'default' | 'success' | 'danger' | 'warning' | 'info';
  /** Sottotitolo piccolo sotto il valore */
  hint?: string;
  loading?: boolean;
  className?: string;
  'data-testid'?: string;
}

const TONE_CLASS: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'text-gray-900',
  success: 'text-green-600',
  danger:  'text-red-600',
  warning: 'text-amber-600',
  info:    'text-blue-600',
};

/**
 * Componente statistico/KPI unificato per le dashboard. Sostituisce i 3
 * pattern inline ripetuti (stats-card, economic-dashboard-card,
 * cash-flow-dashboard) riducendo la duplicazione e garantendo coerenza
 * tipografica e di spacing.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
  hint,
  loading,
  className,
  ...rest
}: StatCardProps) {
  if (loading) {
    return (
      <div
        className={cn(
          'rounded-lg border border-gray-200 bg-white p-4 flex flex-col gap-2',
          className
        )}
      >
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-20" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 bg-white p-4 flex flex-col gap-1',
        className
      )}
      data-testid={rest['data-testid']}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600 font-medium">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-gray-400" aria-hidden="true" />}
      </div>
      <div className={cn('text-2xl font-bold leading-tight', TONE_CLASS[tone])}>
        {value}
      </div>
      {hint && <div className="text-xs text-gray-500">{hint}</div>}
    </div>
  );
}
