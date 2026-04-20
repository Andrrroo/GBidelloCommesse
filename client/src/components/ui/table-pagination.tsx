import { useEffect, useRef, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { UsePaginationResult } from '@/hooks/usePagination';

interface TablePaginationProps {
  pagination: UsePaginationResult<unknown>;
  pageSizeOptions?: number[];
  className?: string;
  /**
   * Ref all'elemento in cima alla tabella. Al cambio pagina la vista
   * viene scrollata su questo elemento così l'utente rivede la prima
   * riga della pagina nuova invece di restare fermo sul fondo.
   * Se non fornito, fa scroll alla paginazione stessa.
   */
  scrollTopRef?: RefObject<HTMLElement | null>;
  /** Disabilita lo scroll automatico al cambio pagina */
  disableScrollOnPageChange?: boolean;
}

/**
 * Barra di paginazione uniforme per tutte le tabelle (clienti, commesse,
 * fatture, costi). Mostra range, selettore page-size e pulsanti di
 * navigazione accessibili (aria-label).
 *
 * Quando cambia la pagina, scrolla automaticamente la vista sull'elemento
 * `scrollTopRef` (o su se stessa come fallback), così dopo "avanti" l'utente
 * vede la prima riga della nuova pagina e non il fondo della precedente.
 */
export function TablePagination({
  pagination,
  pageSizeOptions = [10, 25, 50, 100],
  className = '',
  scrollTopRef,
  disableScrollOnPageChange = false,
}: TablePaginationProps) {
  const {
    page, totalPages, pageSize, setPage, setPageSize,
    prevPage, nextPage, canPrev, canNext, rangeLabel, totalItems,
  } = pagination;

  const selfRef = useRef<HTMLDivElement>(null);
  // Traccia la pagina precedente per scrollare SOLO quando cambia davvero
  // (non al primo mount) ed evitare jump inaspettati al render iniziale.
  const prevPageRef = useRef(page);

  useEffect(() => {
    if (disableScrollOnPageChange) return;
    if (prevPageRef.current === page) return;
    prevPageRef.current = page;

    const target = scrollTopRef?.current ?? selfRef.current;
    if (!target) return;

    // Rispetta la preferenza di riduzione del motion degli utenti
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    target.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [page, scrollTopRef, disableScrollOnPageChange]);

  if (totalItems === 0) return null;

  return (
    <div
      ref={selfRef}
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 px-2 ${className}`}
      role="navigation"
      aria-label="Paginazione tabella"
    >
      <div className="flex items-center gap-3 text-sm text-gray-600">
        <span>{rangeLabel}</span>
        <span className="hidden sm:inline text-gray-300">|</span>
        <label className="flex items-center gap-2">
          <span className="hidden sm:inline">Righe per pagina:</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            aria-label="Righe per pagina"
          >
            {pageSizeOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(1)}
          disabled={!canPrev}
          aria-label="Prima pagina"
        >
          <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={prevPage}
          disabled={!canPrev}
          aria-label="Pagina precedente"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span className="px-3 text-sm text-gray-700 tabular-nums" aria-live="polite">
          Pagina {page} di {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={nextPage}
          disabled={!canNext}
          aria-label="Pagina successiva"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage(totalPages)}
          disabled={!canNext}
          aria-label="Ultima pagina"
        >
          <ChevronsRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
