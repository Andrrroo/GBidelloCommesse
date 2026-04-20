import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/financial-utils";
import { Plus, Pencil, Trash2, Euro, UserSquare2 } from "lucide-react";
import type { Collaboratore } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COLLABORATORE_ROLES, getRoleLabel } from "@/lib/collaboratori-roles";

export default function CollaboratoriManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Collaboratore | null>(null);
  const emptyForm = {
    nome: "",
    cognome: "",
    email: "",
    telefono: "",
    ruolo: "",
    costoOrario: "" as string | number,
    active: true,
    note: "",
  };
  const [formData, setFormData] = useState(emptyForm);

  const { data: collaboratori = [], isLoading } = useQuery<Collaboratore[]>({
    queryKey: ["/api/collaboratori"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/collaboratori");
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    }
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/collaboratori"] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/collaboratori", data);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || err.error || "Errore creazione");
      }
      return response.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Collaboratore creato" }); resetForm(); },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PUT", `/api/collaboratori/${id}`, data);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || err.error || "Errore aggiornamento");
      }
      return response.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Collaboratore aggiornato" }); resetForm(); },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/collaboratori/${id}`);
      if (!response.ok && response.status !== 204) {
        const err = await response.json();
        throw new Error(err.message || err.error || "Errore eliminazione");
      }
    },
    onSuccess: () => { invalidate(); toast({ title: "Collaboratore eliminato" }); },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormData(emptyForm);
    setEditing(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (c: Collaboratore) => {
    setEditing(c);
    setFormData({
      nome: c.nome,
      cognome: c.cognome,
      email: c.email || "",
      telefono: c.telefono || "",
      ruolo: c.ruolo || "",
      costoOrario: c.costoOrario,
      active: c.active,
      note: c.note || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanData: Record<string, any> = {
      ...formData,
      costoOrario: parseFloat(String(formData.costoOrario)) || 0,
    };
    if (!cleanData.email) delete cleanData.email;
    if (!cleanData.telefono) delete cleanData.telefono;
    if (!cleanData.ruolo) delete cleanData.ruolo;
    if (!cleanData.note) delete cleanData.note;

    if (editing) {
      updateMutation.mutate({ id: editing.id, data: cleanData });
    } else {
      createMutation.mutate(cleanData);
    }
  };


  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <UserSquare2 className="h-5 w-5" />
          Anagrafica Collaboratori
        </CardTitle>
        <Button onClick={() => setIsDialogOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Nuovo Collaboratore
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-10 bg-gray-200 rounded-md"></div>
            <div className="h-10 bg-gray-200 rounded-md"></div>
          </div>
        ) : collaboratori.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            Nessun collaboratore nell'anagrafica. Clicca "Nuovo Collaboratore" per iniziare.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead>Contatti</TableHead>
                <TableHead className="text-right">Costo Orario</TableHead>
                <TableHead className="text-center">Stato</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collaboratori.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome} {c.cognome}</TableCell>
                  <TableCell className="text-gray-600">{c.ruolo ? getRoleLabel(c.ruolo) : "-"}</TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {c.email && <div>{c.email}</div>}
                    {c.telefono && <div>{c.telefono}</div>}
                    {!c.email && !c.telefono && "-"}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(c.costoOrario)}/h
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={c.active ? "default" : "secondary"}>
                      {c.active ? "Attivo" : "Disattivato"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Eliminare il collaboratore ${c.nome} ${c.cognome}?`)) {
                            deleteMutation.mutate(c.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setIsDialogOpen(true); }}>
          <DialogContent className="max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Modifica Collaboratore" : "Nuovo Collaboratore"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto overflow-x-hidden px-1 py-1 flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome *</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cognome">Cognome *</Label>
                  <Input
                    id="cognome"
                    value={formData.cognome}
                    onChange={(e) => setFormData(prev => ({ ...prev, cognome: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ruolo">Ruolo</Label>
                <Select
                  value={formData.ruolo || ""}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, ruolo: v }))}
                >
                  <SelectTrigger id="ruolo" aria-label="Ruolo del collaboratore">
                    <SelectValue placeholder="Seleziona un ruolo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {COLLABORATORE_ROLES.map(role => {
                      const Icon = role.icon;
                      return (
                        <SelectItem key={role.value} value={role.value}>
                          <span className="inline-flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            {role.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefono">Telefono</Label>
                  <Input
                    id="telefono"
                    value={formData.telefono}
                    onChange={(e) => setFormData(prev => ({ ...prev, telefono: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="costoOrario">Costo Orario (EUR) *</Label>
                <div className="relative">
                  <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="costoOrario"
                    type="number"
                    step="5"
                    min="0"
                    className="pl-9"
                    value={formData.costoOrario}
                    onChange={(e) => setFormData(prev => ({ ...prev, costoOrario: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="note">Note</Label>
                <Textarea
                  id="note"
                  value={formData.note}
                  onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
                  rows={2}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50">
                <Label htmlFor="active" className="font-medium cursor-pointer">Attivo</Label>
                <Switch
                  id="active"
                  className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-300"
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, active: checked }))}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Annulla
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editing ? "Aggiorna" : "Crea"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
