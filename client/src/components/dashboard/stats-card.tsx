import { useQuery } from "@tanstack/react-query";
import { HardDrive } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { type Project, type Client } from "@shared/schema";

export default function StatsCard() {
  const { data: projects = [], isLoading: isLoadingProjects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: clients = [], isLoading: isLoadingClients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  // Calcola statistiche per status (usando i valori corretti del database)
  const projectsInCorso = projects.filter(p => p.status === "in_corso").length;
  const projectsSospese = projects.filter(p => p.status === "sospesa").length;
  const projectsConcluse = projects.filter(p => p.status === "conclusa").length;
  const totalProjects = projects.length;
  const totalClients = clients.length;

  const isLoading = isLoadingProjects || isLoadingClients;

  return (
    <div className="card-g2" data-testid="stats-card">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Stato Archivio</h3>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <StatCard
          label="Commesse In Corso"
          value={projectsInCorso}
          tone="success"
          loading={isLoading}
          data-testid="stat-projects-active"
        />
        <StatCard
          label="Commesse Sospese"
          value={projectsSospese}
          tone="warning"
          loading={isLoading}
          data-testid="stat-projects-suspended"
        />
        <StatCard
          label="Commesse Concluse"
          value={projectsConcluse}
          tone="info"
          loading={isLoading}
          data-testid="stat-projects-completed"
        />
        <StatCard
          label="Clienti Totali"
          value={totalClients}
          loading={isLoading}
          data-testid="stat-clients"
        />
      </div>
      <div className="text-center mb-4">
        <div className="text-sm text-gray-600 mb-1">Totale Commesse</div>
        <div className="text-2xl font-semibold text-gray-700" data-testid="stat-projects-total">
          {totalProjects}
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
        <HardDrive className="h-4 w-4 text-gray-500 shrink-0" aria-hidden="true" />
        <span>Dati memorizzati localmente in IndexedDB</span>
      </div>
    </div>
  );
}
