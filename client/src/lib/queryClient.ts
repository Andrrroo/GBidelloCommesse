import { QueryClient, QueryFunction } from "@tanstack/react-query";

const DEFAULT_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  // Combina eventuale AbortSignal esterno con il timeout interno.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const externalSignal = init?.signal;
  if (externalSignal) {
    if (externalSignal.aborted) ctrl.abort();
    else externalSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetchWithTimeout(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetchWithTimeout(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 30 * 1000,
      // Retry intelligente: fino a 2 tentativi SOLO per errori 5xx transitori
      // (tipici del proxy Vite al boot o riavvio server). Per 4xx/client
      // errors non riproviamo — un 401 non deve ciclare infinitamente.
      retry: (failureCount, error: unknown) => {
        if (failureCount >= 2) return false;
        const msg = String((error as Error)?.message || "");
        // Pattern: "502: ...", "503: ...", "504: ..."
        return /^(?:5\d\d|Failed to fetch|NetworkError)/.test(msg);
      },
      retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 3000),
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Invalida le query della dashboard (cash-flow, scadenze, pagamenti pendenti).
 * Da chiamare dopo mutazioni finanziarie (fatture, costi, pagamenti) per aggiornare la UI.
 */
export function invalidateDashboard() {
  queryClient.invalidateQueries({ queryKey: ["/api/cash-flow"] });
  queryClient.invalidateQueries({ queryKey: ["/api/fatture-in-scadenza"] });
  queryClient.invalidateQueries({ queryKey: ["pagamenti-collaboratori-pendenti"] });
}
