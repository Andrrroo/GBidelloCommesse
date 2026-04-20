import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  /** Se fornito, il segmento è cliccabile */
  onClick?: () => void;
}

interface BreadcrumbNavProps {
  items: BreadcrumbItem[];
  showHome?: boolean;
  onHomeClick?: () => void;
  className?: string;
}

/**
 * Breadcrumb di navigazione tra tab principale e sub-tab.
 * Non usa il Breadcrumb di shadcn perché il nostro router è a tab-state,
 * non a URL: i click sono callback che aggiornano lo state del Dashboard.
 */
export function BreadcrumbNav({ items, showHome = true, onHomeClick, className }: BreadcrumbNavProps) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex items-center gap-1 text-sm text-gray-600 px-1 py-2 flex-wrap', className)}
    >
      {showHome && (
        <>
          <button
            type="button"
            onClick={onHomeClick}
            className="flex items-center gap-1 hover:text-primary focus-visible:text-primary focus-visible:outline-none focus-visible:underline"
            aria-label="Vai alla dashboard"
          >
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Home</span>
          </button>
          {items.length > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />}
        </>
      )}
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span key={idx} className="flex items-center gap-1">
            {item.onClick && !isLast ? (
              <button
                type="button"
                onClick={item.onClick}
                className="hover:text-primary focus-visible:text-primary focus-visible:outline-none focus-visible:underline"
              >
                {item.label}
              </button>
            ) : (
              <span
                className={cn(isLast ? 'font-medium text-gray-900' : 'text-gray-600')}
                aria-current={isLast ? 'page' : undefined}
              >
                {item.label}
              </span>
            )}
            {!isLast && <ChevronRight className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />}
          </span>
        );
      })}
    </nav>
  );
}
