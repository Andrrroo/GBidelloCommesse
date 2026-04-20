import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type ProjectStatus = 'in_corso' | 'conclusa' | 'sospesa';

interface StatusBadgeProps {
  status: ProjectStatus | string;
  className?: string;
}

const STATUS_CONFIG: Record<ProjectStatus, { label: string; className: string }> = {
  in_corso: {
    label: 'In Corso',
    className: 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-100',
  },
  conclusa: {
    label: 'Conclusa',
    className: 'bg-green-100 text-green-800 border-green-300 hover:bg-green-100',
  },
  sospesa: {
    label: 'Sospesa',
    className: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100',
  },
};

/**
 * Badge unificato per lo stato di una commessa. Centralizza stile e label
 * così un cambio di design tocca un solo punto invece che 6+ tabelle.
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status as ProjectStatus];
  if (!cfg) {
    return (
      <Badge variant="outline" className={cn('text-xs', className)}>
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn('text-xs font-medium', cfg.className, className)}>
      {cfg.label}
    </Badge>
  );
}
