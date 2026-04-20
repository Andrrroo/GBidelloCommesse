import { useQuery } from "@tanstack/react-query";
import { type Project } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FolderOpen } from "lucide-react";

export default function RecentProjectsTable() {
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Get the 3 most recent projects
  const recentProjects = projects
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 3);

  return (
    <div className="card-g2" data-testid="recent-projects-table">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Commesse Recenti</h3>
        <Button variant="ghost" className="text-primary hover:text-teal-700 font-medium text-sm" data-testid="view-all-projects">
          Vedi Tutte →
        </Button>
      </div>
      
      {recentProjects.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Nessuna commessa presente"
          description="Crea la prima commessa per iniziare"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Codice</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Cliente</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Città</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Oggetto</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-sm">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentProjects.map((project) => (
                <tr key={project.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4 font-mono text-sm font-semibold text-primary" data-testid={`project-code-${project.id}`}>
                    {project.code}
                  </td>
                  <td className="py-3 px-4 text-sm" data-testid={`project-client-${project.id}`}>
                    {project.client}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600" data-testid={`project-city-${project.id}`}>
                    {project.city}
                  </td>
                  <td className="py-3 px-4 text-sm" data-testid={`project-object-${project.id}`}>
                    {project.object}
                  </td>
                  <td className="py-3 px-4" data-testid={`project-status-${project.id}`}>
                    <StatusBadge status={project.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
