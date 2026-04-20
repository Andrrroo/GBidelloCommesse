import { type LucideIcon, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * EmptyState unificato per liste/tabelle/grafici senza dati.
 * Sostituisce i 3 stili diversi (emoji custom, AlertCircle centrato,
 * EmptyState inline) che erano sparsi per l'app.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title = 'Nessun dato disponibile',
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-10',
        className
      )}
      role="status"
    >
      <div className="rounded-full bg-gray-100 p-3 mb-3">
        <Icon className="h-6 w-6 text-gray-500" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {description && (
        <p className="text-xs text-gray-500 mt-1 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
