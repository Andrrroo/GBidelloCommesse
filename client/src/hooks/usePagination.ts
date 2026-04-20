import { useMemo, useState, useCallback, useEffect } from 'react';

interface UsePaginationOptions<T> {
  data: T[];
  pageSize?: number;
  /** Se cambia, torna a pagina 1 (es. cambio filtro o ricerca) */
  resetKey?: unknown;
}

export interface UsePaginationResult<T> {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  pageItems: T[];
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  canPrev: boolean;
  canNext: boolean;
  /** Range umano, es. "11–20 di 347" */
  rangeLabel: string;
}

/**
 * Paginazione client-side riusabile. Accetta un array già filtrato/ordinato
 * e restituisce solo la slice corrente + controlli. Quando `resetKey` cambia
 * (tipicamente un filtro testuale) torna automaticamente a pagina 1.
 */
export function usePagination<T>({
  data,
  pageSize: initialPageSize = 25,
  resetKey,
}: UsePaginationOptions<T>): UsePaginationResult<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeInternal] = useState(initialPageSize);

  // Reset a pagina 1 quando cambia un filtro esterno (resetKey)
  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Clamp page se i dati si riducono (es. filtro più restrittivo)
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, page, pageSize]);

  const setPageSize = useCallback((n: number) => {
    setPageSizeInternal(n);
    setPage(1);
  }, []);

  const nextPage = useCallback(() => setPage(p => Math.min(p + 1, totalPages)), [totalPages]);
  const prevPage = useCallback(() => setPage(p => Math.max(p - 1, 1)), []);

  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);
  const rangeLabel = totalItems === 0 ? '0' : `${from}\u2013${to} di ${totalItems}`;

  return {
    page,
    pageSize,
    totalPages,
    totalItems,
    pageItems,
    setPage,
    setPageSize,
    nextPage,
    prevPage,
    canPrev: page > 1,
    canNext: page < totalPages,
    rangeLabel,
  };
}
