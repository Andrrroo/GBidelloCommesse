import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import {
  Package, Upload, Download, RefreshCw, Check, Loader2, HardDrive,
} from "lucide-react";

interface BackupSnapshot {
  name: string;
  createdAt: string;
  sizeBytes: number;
  filesCount: number;
}

interface BackupStatus {
  enabled: boolean;
  intervalHours: number;
  maxSnapshots: number;
  snapshots: BackupSnapshot[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function StoragePanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'amministratore';

  const { data: backupStatus, isLoading: isLoadingBackups } = useQuery<BackupStatus>({
    queryKey: ["/api/system/backups"],
  });

  const manualBackupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/system/backup");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system/backups"] });
      toast({
        title: "Backup completato",
        description: "Uno snapshot dei dati è stato salvato.",
      });
    },
    onError: () => {
      toast({
        title: "Errore backup",
        description: "Impossibile creare il backup. Riprova più tardi.",
        variant: "destructive",
      });
    },
  });

  const handleExportAllData = async () => {
    try {
      const response = await apiRequest("GET", "/api/export");
      const data = await response.json();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `g2-backup-completo-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Export completato",
        description: "Tutti i dati sono stati esportati con successo",
      });
    } catch (error) {
      toast({
        title: "Errore nell'export",
        description: "Si è verificato un errore durante l'esportazione",
        variant: "destructive",
      });
    }
  };

  const handleImportData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        await apiRequest("POST", "/api/import", data);

        toast({
          title: "Import completato",
          description: "I dati sono stati importati con successo",
        });
      } catch (error) {
        toast({
          title: "Errore nell'import",
          description: "Si è verificato un errore durante l'importazione",
          variant: "destructive",
        });
      }
    };
    input.click();
  };

  const snapshots = backupStatus?.snapshots ?? [];
  const lastSnapshot = snapshots[0];
  const isAutoActive = backupStatus?.enabled ?? false;

  return (
    <div data-testid="storage-panel">
      <h3 className="text-2xl font-bold text-gray-900 mb-6">Gestione Dati</h3>

      {/* Data Management */}
      <div className="bg-gray-50 rounded-xl p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Package className="h-5 w-5 text-gray-700" aria-hidden="true" />
          Backup e Ripristino
        </h4>
        <div className={isAdmin ? "grid gap-4 md:grid-cols-3" : "grid gap-4 md:grid-cols-1"}>
          {isAdmin && (
            <div className="bg-white rounded-lg p-4 text-center">
              <Upload className="h-8 w-8 mx-auto mb-2 text-blue-600" aria-hidden="true" />
              <div className="font-semibold text-gray-900 mb-1">Export Completo</div>
              <div className="text-sm text-gray-600 mb-3">Esporta tutti i dati in formato JSON</div>
              <Button
                onClick={handleExportAllData}
                className="w-full button-g2-primary"
                data-testid="export-all"
              >
                Esporta
              </Button>
            </div>
          )}
          {isAdmin && (
            <div className="bg-white rounded-lg p-4 text-center">
              <Download className="h-8 w-8 mx-auto mb-2 text-green-600" aria-hidden="true" />
              <div className="font-semibold text-gray-900 mb-1">Import Dati</div>
              <div className="text-sm text-gray-600 mb-3">Importa dati da file JSON</div>
              <Button
                onClick={handleImportData}
                variant="outline"
                className="w-full button-g2-secondary"
                data-testid="import-data"
              >
                Importa
              </Button>
            </div>
          )}
          <div className="bg-white rounded-lg p-4 text-center">
            <RefreshCw className="h-8 w-8 mx-auto mb-2 text-gray-500" aria-hidden="true" />
            <div className="font-semibold text-gray-900 mb-1">Backup Automatico</div>
            <div className="text-sm text-gray-600 mb-3">
              {isLoadingBackups ? (
                'Verifica stato…'
              ) : isAutoActive ? (
                <>Ogni {backupStatus?.intervalHours}h · ultimi {backupStatus?.maxSnapshots} snapshot</>
              ) : (
                'Non attivo'
              )}
            </div>
            <Button
              onClick={() => manualBackupMutation.mutate()}
              disabled={!isAdmin || manualBackupMutation.isPending}
              variant="outline"
              className="w-full"
              title={!isAdmin ? 'Solo gli amministratori possono avviare un backup manuale' : undefined}
              data-testid="manual-backup"
            >
              {manualBackupMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  Backup in corso…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                  Esegui ora
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Stato dettagliato backup automatico */}
        <div className="mt-6 bg-white rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-semibold text-gray-900 flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-gray-600" aria-hidden="true" />
              Snapshot disponibili
            </h5>
            {isAutoActive && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 inline-flex items-center gap-1">
                <Check className="h-3 w-3" aria-hidden="true" />
                Attivo
              </Badge>
            )}
          </div>

          {isLoadingBackups ? (
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Caricamento…
            </div>
          ) : snapshots.length === 0 ? (
            <div className="text-sm text-gray-500">
              Nessuno snapshot presente. Il primo verrà creato al prossimo avvio del server.
            </div>
          ) : (
            <>
              <div className="text-sm text-gray-600 mb-2">
                Ultimo backup: <strong>{formatDate(lastSnapshot!.createdAt)}</strong>
                {' · '}
                {snapshots.length} snapshot totali
              </div>
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium">Data</th>
                      <th className="text-right py-2 px-3 font-medium">File</th>
                      <th className="text-right py-2 px-3 font-medium">Dimensione</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {snapshots.map((s, idx) => (
                      <tr key={s.name} className={idx === 0 ? 'bg-green-50/30' : ''}>
                        <td className="py-2 px-3 font-mono text-xs text-gray-700">{formatDate(s.createdAt)}</td>
                        <td className="py-2 px-3 text-right text-gray-600 tabular-nums">{s.filesCount}</td>
                        <td className="py-2 px-3 text-right text-gray-600 tabular-nums">{formatBytes(s.sizeBytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Gli snapshot sono salvati nel server in <code className="font-mono bg-gray-100 px-1 py-0.5 rounded">backups/</code>.
                Quando si supera il limite, i più vecchi vengono eliminati automaticamente.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
