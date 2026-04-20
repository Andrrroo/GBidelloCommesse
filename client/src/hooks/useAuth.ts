import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

export type UserRole = "amministratore" | "collaboratore";

export interface User {
  id: string;
  username: string;
  role: UserRole;
  nome: string;
  email: string;
  collaboratoreId?: string;
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
