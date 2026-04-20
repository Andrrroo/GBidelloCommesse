import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import {
  Activity,
  Plus,
  Pencil,
  Trash2,
  LogIn,
  FileText,
  Euro,
  User,
  Clock
} from "lucide-react";
import type { ActivityLog } from "@shared/schema";

interface ActivityLogViewerProps {
  userId?: string;
  showAll?: boolean;
  maxItems?: number;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  create: <Plus className="h-4 w-4 text-green-500" />,
  update: <Pencil className="h-4 w-4 text-blue-500" />,
  delete: <Trash2 className="h-4 w-4 text-red-500" />,
  login: <LogIn className="h-4 w-4 text-purple-500" />,
  view: <FileText className="h-4 w-4 text-gray-500" />,
  payment: <Euro className="h-4 w-4 text-yellow-500" />
};

const ENTITY_LABELS: Record<string, string> = {
  project: "Commessa",
  client: "Cliente",
  fattura_ingresso: "Fattura Ingresso",
  fattura_emessa: "Fattura Emessa",
  fattura_consulente: "Fattura Consulente",
  costo_vivo: "Costo Vivo",
  costo_generale: "Costo Generale",
  prestazione: "Prestazione",
  user: "Utente",
  profilo_costo: "Profilo Costo"
};

export default function ActivityLogViewer({ userId, showAll = false, maxItems = 50 }: ActivityLogViewerProps) {
  const { data: logs = [], isLoading } = useQuery<ActivityLog[]>({
    queryKey: ["activity-logs", userId],
    queryFn: async () => {
      const url = userId ? `/api/activity-logs/user/${userId}` : "/api/activity-logs";
      const response = await apiRequest("GET", url);
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      // Ordina per timestamp decrescente e limita
      return data
        .sort((a: ActivityLog, b: ActivityLog) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        .slice(0, maxItems);
    }
  });

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Adesso";
    if (minutes < 60) return `${minutes} min fa`;
    if (hours < 24) return `${hours} ore fa`;
    if (days < 7) return `${days} giorni fa`;

    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'create': return 'ha creato';
      case 'update': return 'ha modificato';
      case 'delete': return 'ha eliminato';
      case 'login': return 'ha effettuato accesso';
      case 'view': return 'ha visualizzato';
      case 'payment': return 'ha registrato pagamento';
      default: return action;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {showAll ? "Log Attività Sistema" : "Le mie Attività"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3">
                <div className="h-8 w-8 bg-gray-200 rounded-full"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded-md w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded-md w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          {showAll ? "Log Attività Sistema" : "Le mie Attività"}
          <Badge variant="secondary" className="ml-auto">{logs.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-center text-gray-500 py-4">Nessuna attività registrata</p>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-3 pb-4 border-b border-gray-100 last:border-0">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      {ACTION_ICONS[log.action] || <Activity className="h-4 w-4 text-gray-400" />}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {showAll && (
                          <span className="font-medium text-sm flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {log.userName}
                          </span>
                        )}
                        <p className="text-sm text-gray-700">
                          {getActionLabel(log.action)}{' '}
                          <Badge variant="outline" className="text-xs font-normal">
                            {ENTITY_LABELS[log.entityType] || log.entityType}
                          </Badge>
                        </p>
                        {log.details && (
                          <p className="text-xs text-gray-500 mt-1 truncate">{log.details}</p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(log.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
