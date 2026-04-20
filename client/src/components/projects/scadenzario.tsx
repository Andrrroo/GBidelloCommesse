import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { type Project } from "@shared/schema";
import {
  CalendarIcon,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Edit,
  Bell,
  Calendar as CalendarClock,
  Pin,
  FileText,
  Shield,
  Target,
  Folder,
  X,
  type LucideIcon
} from "lucide-react";
import { format, formatDistanceToNow, isPast, isFuture, isToday, addDays } from "date-fns";
import { it } from "date-fns/locale";

interface Deadline {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  dueDate: Date;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'completed' | 'overdue' | 'cancelled';
  type: 'general' | 'deposito' | 'collaudo' | 'scadenza_assicurazione' | 'milestone';
  notifyDaysBefore?: number;
  completedAt?: Date;
  projectCode?: string;
  projectClient?: string;
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  low:    { label: 'Bassa',   color: 'bg-gray-100 text-gray-700',       dotColor: 'bg-gray-400' },
  medium: { label: 'Media',   color: 'bg-blue-100 text-blue-700',       dotColor: 'bg-blue-500' },
  high:   { label: 'Alta',    color: 'bg-orange-100 text-orange-700',   dotColor: 'bg-orange-500' },
  urgent: { label: 'Urgente', color: 'bg-red-100 text-red-700',         dotColor: 'bg-red-500' },
};

const TYPE_CONFIG: Record<string, { label: string; icon: LucideIcon }> = {
  general:                { label: 'Generale',               icon: Pin },
  deposito:               { label: 'Deposito',               icon: FileText },
  collaudo:               { label: 'Collaudo',               icon: CheckCircle2 },
  scadenza_assicurazione: { label: 'Scadenza Assicurazione', icon: Shield },
  milestone:              { label: 'Milestone',              icon: Target },
};

function DeadlineForm({
  onSubmit,
  onCancel,
  initialData,
  projects
}: {
  onSubmit: (data: any) => void;
  onCancel?: () => void;
  initialData?: Partial<Deadline>;
  projects: Project[];
}) {
  const [formData, setFormData] = useState({
    projectId: initialData?.projectId || '',
    title: initialData?.title || '',
    description: initialData?.description || '',
    dueDate: initialData?.dueDate ? new Date(initialData.dueDate) : new Date(),
    priority: initialData?.priority || 'medium',
    type: initialData?.type || 'general',
    notifyDaysBefore: initialData?.notifyDaysBefore || 7,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="project">Commessa *</Label>
        <Select value={formData.projectId} onValueChange={(value) => setFormData({ ...formData, projectId: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Seleziona commessa..." />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.code} - {project.client}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Titolo Scadenza *</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="es. Deposito progetto esecutivo"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrizione</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Note aggiuntive..."
          rows={3}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Data Scadenza *</Label>
          <Calendar
            mode="single"
            selected={formData.dueDate}
            onSelect={(date) => date && setFormData({ ...formData, dueDate: date })}
            className="rounded-md border"
            locale={it}
          />
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo Scadenza *</Label>
            <Select value={formData.type} onValueChange={(value: any) => setFormData({ ...formData, type: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_CONFIG).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <SelectItem key={key} value={key}>
                      <span className="inline-flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {config.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Priorità *</Label>
            <Select value={formData.priority} onValueChange={(value: any) => setFormData({ ...formData, priority: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <span className="inline-flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${config.dotColor}`} aria-hidden="true" />
                      {config.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notifica (giorni prima)</Label>
            <Input
              type="number"
              value={formData.notifyDaysBefore}
              onChange={(e) => setFormData({ ...formData, notifyDaysBefore: parseInt(e.target.value) || 0 })}
              min="0"
              max="90"
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Annulla
          </Button>
        )}
        <Button type="submit">
          {initialData ? 'Aggiorna Scadenza' : 'Crea Scadenza'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeadlineCard({ deadline, onComplete, onDelete, onEdit }: {
  deadline: Deadline;
  onComplete: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const isOverdue = isPast(new Date(deadline.dueDate)) && deadline.status === 'pending';
  const daysUntil = Math.ceil((new Date(deadline.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  const isUpcoming = daysUntil <= (deadline.notifyDaysBefore || 7) && daysUntil > 0;

  const priorityConfig = PRIORITY_CONFIG[deadline.priority];
  const typeConfig = TYPE_CONFIG[deadline.type];

  return (
    <Card className={`${
      isOverdue && deadline.status === 'pending' ? 'border-red-300 bg-red-50' :
      isUpcoming && deadline.status === 'pending' ? 'border-orange-300 bg-orange-50' :
      deadline.status === 'completed' ? 'border-green-300 bg-green-50' :
      'border-gray-200'
    }`}>
      <CardContent className="pt-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge className={`${priorityConfig.color} inline-flex items-center gap-1.5`}>
                  <span className={`inline-block h-2 w-2 rounded-full ${priorityConfig.dotColor}`} aria-hidden="true" />
                  {priorityConfig.label}
                </Badge>
                <Badge variant="outline" className="text-xs inline-flex items-center gap-1">
                  {(() => {
                    const TypeIcon = typeConfig.icon;
                    return <TypeIcon className="h-3 w-3" aria-hidden="true" />;
                  })()}
                  {typeConfig.label}
                </Badge>
              </div>
              <h4 className="font-semibold text-gray-900 mb-1">{deadline.title}</h4>
              {deadline.description && (
                <p className="text-sm text-gray-600 line-clamp-2">{deadline.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1 text-gray-600">
              <CalendarIcon className="h-4 w-4" />
              <span>{format(new Date(deadline.dueDate), 'dd MMM yyyy', { locale: it })}</span>
            </div>
            {deadline.status === 'pending' && (
              <div className={`flex items-center gap-1 ${
                isOverdue ? 'text-red-600' :
                isUpcoming ? 'text-orange-600' :
                'text-gray-600'
              }`}>
                <Clock className="h-4 w-4" />
                <span>
                  {isOverdue ? 'Scaduta' : formatDistanceToNow(new Date(deadline.dueDate), { addSuffix: true, locale: it })}
                </span>
              </div>
            )}
          </div>

          {deadline.projectCode && (
            <div className="text-xs text-gray-500 flex items-center gap-1.5">
              <Folder className="h-3 w-3" aria-hidden="true" />
              {deadline.projectCode} - {deadline.projectClient}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t">
            {deadline.status === 'pending' && (
              <Button
                size="sm"
                variant="outline"
                onClick={onComplete}
                className="flex-1"
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Completa
              </Button>
            )}
            {deadline.status === 'completed' && (
              <Badge className="bg-green-500 text-white">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Completata
              </Badge>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              aria-label="Modifica scadenza"
            >
              <Edit className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              aria-label="Elimina scadenza"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Scadenzario() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState<Deadline | null>(null);
  const [deadlineToDelete, setDeadlineToDelete] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Load deadlines from API
  const { data: deadlines = [] } = useQuery<Deadline[]>({
    queryKey: ["/api/deadlines"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/deadlines", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deadlines"] });
      toast({
        title: "Scadenza creata",
        description: "La scadenza è stata creata con successo",
      });
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Errore nella creazione della scadenza",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", `/api/deadlines/${editingDeadline?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deadlines"] });
      toast({
        title: "Scadenza aggiornata",
        description: "Le modifiche sono state salvate",
      });
      setEditingDeadline(null);
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Errore nell'aggiornamento della scadenza",
        variant: "destructive",
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (deadlineId: string) => {
      await apiRequest("PATCH", `/api/deadlines/${deadlineId}`, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deadlines"] });
      toast({
        title: "Scadenza completata",
        description: "La scadenza è stata marcata come completata",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Errore nel completamento della scadenza",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/deadlines/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deadlines"] });
      toast({
        title: "Scadenza eliminata",
        description: "La scadenza è stata eliminata",
      });
      setDeadlineToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message || "Errore nell'eliminazione della scadenza",
        variant: "destructive",
      });
    },
  });

  const handleCreate = (data: any) => {
    createMutation.mutate(data);
  };

  const handleUpdate = (data: any) => {
    updateMutation.mutate(data);
  };

  const handleComplete = (deadlineId: string) => {
    completeMutation.mutate(deadlineId);
  };

  const handleDelete = () => {
    if (!deadlineToDelete) return;
    deleteMutation.mutate(deadlineToDelete);
  };

  // Aggiungi projectCode e projectClient alle scadenze
  const enrichedDeadlines = deadlines.map(d => ({
    ...d,
    projectCode: projects.find(p => p.id === d.projectId)?.code,
    projectClient: projects.find(p => p.id === d.projectId)?.client,
  }));

  // Filtra scadenze
  const filteredDeadlines = enrichedDeadlines.filter(d => {
    if (filterStatus !== 'all' && d.status !== filterStatus) return false;
    if (filterPriority !== 'all' && d.priority !== filterPriority) return false;
    return true;
  });

  // Conta scadenze per categoria
  const overdueCount = enrichedDeadlines.filter(d => isPast(new Date(d.dueDate)) && d.status === 'pending').length;
  const upcomingCount = enrichedDeadlines.filter(d => {
    const daysUntil = Math.ceil((new Date(d.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil <= 7 && daysUntil > 0 && d.status === 'pending';
  }).length;
  const completedCount = enrichedDeadlines.filter(d => d.status === 'completed').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-blue-600" />
            Scadenzario Commesse
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Gestisci scadenze, milestone e notifiche per le tue commesse
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Nuova Scadenza
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Crea Nuova Scadenza</DialogTitle>
              <DialogDescription>
                Aggiungi una nuova scadenza o milestone per una commessa
              </DialogDescription>
            </DialogHeader>
            <DeadlineForm
              onSubmit={handleCreate}
              onCancel={() => setIsDialogOpen(false)}
              projects={projects}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-700 font-medium">Scadute</p>
                <p className="text-3xl font-bold text-red-900">{overdueCount}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-700 font-medium">In Scadenza (7gg)</p>
                <p className="text-3xl font-bold text-orange-900">{upcomingCount}</p>
              </div>
              <Bell className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700 font-medium">In Programma</p>
                <p className="text-3xl font-bold text-blue-900">
                  {enrichedDeadlines.filter(d => d.status === 'pending').length - overdueCount - upcomingCount}
                </p>
              </div>
              <CalendarIcon className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700 font-medium">Completate</p>
                <p className="text-3xl font-bold text-green-900">{completedCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtri */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-sm mb-2 block">Stato</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le scadenze</SelectItem>
                  <SelectItem value="pending">In Sospeso</SelectItem>
                  <SelectItem value="completed">Completate</SelectItem>
                  <SelectItem value="overdue">Scadute</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <Label className="text-sm mb-2 block">Priorità</Label>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le priorità</SelectItem>
                  <SelectItem value="urgent">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
                      Urgente
                    </span>
                  </SelectItem>
                  <SelectItem value="high">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-orange-500" aria-hidden="true" />
                      Alta
                    </span>
                  </SelectItem>
                  <SelectItem value="medium">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" />
                      Media
                    </span>
                  </SelectItem>
                  <SelectItem value="low">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-gray-400" aria-hidden="true" />
                      Bassa
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(filterStatus !== 'all' || filterPriority !== 'all') && (
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setFilterStatus('all'); setFilterPriority('all'); }}
                  className="text-gray-500 hover:text-gray-700 gap-1"
                  data-testid="reset-filters-scadenzario"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Pulisci filtri
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista Scadenze */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredDeadlines.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <CalendarClock className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">Nessuna scadenza trovata</p>
            <p className="text-sm text-gray-400 mt-1">Crea la prima scadenza per iniziare</p>
          </div>
        ) : (
          filteredDeadlines.map((deadline) => (
            <DeadlineCard
              key={deadline.id}
              deadline={deadline}
              onComplete={() => handleComplete(deadline.id)}
              onDelete={() => setDeadlineToDelete(deadline.id)}
              onEdit={() => setEditingDeadline(deadline)}
            />
          ))
        )}
      </div>

      {/* Edit Dialog */}
      {editingDeadline && (
        <Dialog open={!!editingDeadline} onOpenChange={() => setEditingDeadline(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Modifica Scadenza</DialogTitle>
              <DialogDescription>
                Aggiorna i dettagli della scadenza
              </DialogDescription>
            </DialogHeader>
            <DeadlineForm
              onSubmit={handleUpdate}
              onCancel={() => setEditingDeadline(null)}
              initialData={editingDeadline}
              projects={projects}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deadlineToDelete} onOpenChange={() => setDeadlineToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la scadenza?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione non può essere annullata. La scadenza verrà eliminata definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
