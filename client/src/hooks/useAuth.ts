import { useState, useEffect } from "react";
import { apiRequest, clearAllQueries } from "@/lib/queryClient";
import type { UserRole } from "@shared/schema";

// Re-export per retro-compatibilità (tanti componenti fanno `import { UserRole } from '@/hooks/useAuth'`)
export type { UserRole };

/**
 * Utente come lo vede il frontend autenticato: sottoinsieme dei campi di
 * `User` di shared/schema.ts che il server include nella sessione
 * (GET /api/auth/status). Per la User "completa" del DB vedere shared/schema.
 */
export interface User {
  id: string;
  username: string;
  role: UserRole;
  nome: string;
  email: string;
  dipendenteId?: string;
}

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const login = (userData?: User) => {
    setIsAuthenticated(true);
    if (userData) {
      setUser(userData);
    }
  };

  const logout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setIsAuthenticated(false);
      setUser(null);
      // Pulisce la cache di react-query: dati caricati sotto la sessione
      // precedente (p.es. admin) non devono restare visibili al prossimo
      // login (p.es. collaboratore). Senza questa pulizia si possono
      // vedere fatture emesse, importi e altre entrate residue.
      clearAllQueries();
    }
  };

  const isAdmin = () => user?.role === "amministratore";
  const isOperativo = () => user?.role === "collaboratore";

  useEffect(() => {
    // AbortController per evitare setState su componente smontato
    // (es. hot reload dev, cambio rapido di pagina durante il check auth)
    const ctrl = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/auth/status", { credentials: "include", signal: ctrl.signal });
        const result = await response.json();
        if (ctrl.signal.aborted) return;
        setIsAuthenticated(result.authenticated || false);
        setUser(result.authenticated && result.user ? result.user : null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        if (!ctrl.signal.aborted) setIsLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, []);

  return {
    isAuthenticated,
    isLoading,
    user,
    login,
    logout,
    isAdmin,
    isOperativo,
  };
}
