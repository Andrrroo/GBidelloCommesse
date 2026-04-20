import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const loginSchema = z.object({
  username: z.string().min(1, "Username è obbligatorio"),
  password: z.string().min(1, "Password è obbligatoria")
});

type LoginForm = z.infer<typeof loginSchema>;

import { User } from "@/hooks/useAuth";

interface LoginPageProps {
  onLoginSuccess: (user?: User) => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  useDocumentTitle("Accedi");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: ""
    }
  });

  const handleLogin = async (data: LoginForm) => {
    setIsLoading(true);
    setError(null);

    try {
      // Uso fetch diretto invece di apiRequest perché quest'ultimo fa throw su
      // qualsiasi status non-2xx (incluso 401 "credenziali non valide") e il
      // catch sotto mostrerebbe "Errore di connessione al server" per ogni
      // errore, nascondendo il vero motivo. Qui gestiamo esplicitamente ogni
      // caso (401/429/500/network) per un feedback preciso all'utente.
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      let result: { success?: boolean; user?: User; error?: string; message?: string } | null = null;
      try { result = await response.json(); } catch { /* body non JSON */ }

      if (response.ok && result?.success && result?.user) {
        onLoginSuccess(result.user);
        return;
      }

      if (response.status === 429) {
        setError("Troppi tentativi di accesso. Riprova tra qualche minuto.");
      } else if (response.status === 401) {
        setError(result?.error || "Credenziali non valide");
      } else if (result?.error || result?.message) {
        setError(result.error || result.message || "Errore durante il login");
      } else {
        setError(`Errore durante il login (${response.status})`);
      }
    } catch (err) {
      // Solo i veri errori di rete (server offline, DNS, CORS) arrivano qui.
      console.error("Login network error:", err);
      setError("Errore di connessione al server");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-3">
              <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">GB Engineering</CardTitle>
          <CardDescription>
            Accedi al sistema di gestione commesse
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        placeholder="Inserisci username"
                        disabled={isLoading}
                        data-testid="input-username"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Inserisci password"
                        disabled={isLoading}
                        data-testid="input-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {error && (
                <Alert variant="destructive" data-testid="alert-error">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                data-testid="button-login"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Accesso in corso...
                  </>
                ) : (
                  "Accedi"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}