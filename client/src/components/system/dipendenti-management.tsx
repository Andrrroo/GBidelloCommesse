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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/financial-utils";
import { Plus, Pencil, Trash2, Euro, UserSquare2 } from "lucide-react";
import type { Dipendente } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DIPENDENTE_ROLES, getRoleLabel } from "@/lib/dipendenti-roles";

export default function DipendentiManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Dipendente | null>(null);
  const [editing, setEditing] = useState<Dipendente | null>(null);
  const emptyForm = {
    nome: "",
    cognome: "",
    email: "",
    telefono: "",
    ruolo: "",
    costoOrario: "" as string | number,
    active: true,
    stipendioMensile: "" as string | number,
    codiceFiscale: "",
    note: "",
  };
  const [formData, setFormData] = useState(emptyForm);

  const { data: dipendenti = [], isLoading } = useQuery<Dipendente[]>({
    queryKey: ["/api/dipendenti"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/dipendenti");
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    }
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/dipendenti"] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/dipendenti", data);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || err.error || "Errore creazione");
      }
      return response.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Dipendente creato" }); resetForm(); },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PUT", `/api/dipendenti/${id}`, data);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || err.error || "Errore aggiornamento");
      }
      return response.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Dipendente aggiornato" }); resetForm(); },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/dipendenti/${id}`);
      if (!response.ok && response.status !== 204) {
        const err = await response.json();
        throw new Error(err.message || err.error || "Errore eliminazione");
      }
    },
    onSuccess: () => { invalidate(); toast({ title: "Dipendente eliminato" }); },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormData(emptyForm);
    setEditing(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (d: Dipendente) => {
    setEditing(d);
    setFormData({
      nome: d.nome,
      cognome: d.cognome,
      email: d.email || "",
      telefono: d.telefono || "",
      ruolo: d.ruolo || "",
      costoOrario: d.costoOrario,
      active: d.active,
      stipendioMensile: d.stipendioMensile ?? "",
      codiceFiscale: d.codiceFiscale || "",
      note: d.note || "",
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

    // stipendioMensile: opzionale. Se vuoto non invio il campo; se presente,
    // parso a numero e Zod valida (positive). Se set → attiva l'auto-payroll.
    const parsedStip = parseFloat(String(formData.stipendioMensile));
    if (isFinite(parsedStip) && parsedStip > 0) {
      cleanData.stipendioMensile = parsedStip;
    } else {
      delete cleanData.stipendioMensile;
    }

    // codiceFiscale: normalizzato maiuscolo, vuoto → rimosso (campo opzionale).
    if (cleanData.codiceFiscale) {
      cleanData.codiceFiscale = String(cleanData.codiceFiscale).trim().toUpperCase();
    } else {
      delete cleanData.codiceFiscale;
    }

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
          Anagrafica Dipendenti
        </CardTitle>
        <Button onClick={() => setIsDialogOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Nuovo Dipendente
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-10 bg-gray-200 rounded-md"></div>
            <div className="h-10 bg-gray-200 rounded-md"></div>
          </div>
        ) : dipendenti.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            Nessun dipendente nell'anagrafica. Clicca "Nuovo Dipendente" per iniziare.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead>Contatti</TableHead>
                <TableHead className="text-right">Costo Orario</TableHead>
                <TableHead className="text-right">Stipendio Mens.</TableHead>
                <TableHead className="text-center">Stato</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dipendenti.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.nome} {d.cognome}</TableCell>
                  <TableCell className="text-gray-600">{d.ruolo ? getRoleLabel(d.ruolo) : "-"}</TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {d.email && <div>{d.email}</div>}
                    {d.telefono && <div>{d.telefono}</div>}
                    {!d.email && !d.telefono && "-"}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(d.costoOrario)}/h
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {typeof d.stipendioMensile === 'number' && d.stipendioMensile > 0 ? formatCurrency(d.stipendioMensile) : <span className="text-gray-400">-</span>}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={d.active ? "default" : "secondary"}>
                      {d.active ? "Attivo" : "Disattivato"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(d)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setToDelete(d)}
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
                {editing ? "Modifica Dipendente" : "Nuovo Dipendente"}
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
                  <SelectTrigger id="ruolo" aria-label="Ruolo del dipendente">
                    <SelectValue placeholder="Seleziona un ruolo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DIPENDENTE_ROLES.map(role => {
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

              <div className="rounded-lg border-2 border-blue-200 bg-blue-50/60 p-3 space-y-3">
                <div>
                  <p className="font-semibold text-blue-900">Payroll automatico</p>
                  <p className="text-xs text-blue-700/80 mt-0.5">Imposta lo stipendio mensile per attivare la generazione automatica delle buste paga in Costi Generali.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stipendioMensile" className="text-blue-900">
                    Stipendio Mensile (EUR)
                  </Label>
                  <div className="relative">
                    <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      id="stipendioMensile"
                      type="number"
                      step="50"
                      min="0"
                      className="pl-9"
                      placeholder="es. 1800 (lascia vuoto per disattivare)"
                      value={formData.stipendioMensile}
                      onChange={(e) => setFormData(prev => ({ ...prev, stipendioMensile: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="codiceFiscale" className="text-blue-900">
                    Codice Fiscale
                  </Label>
                  <Input
                    id="codiceFiscale"
                    type="text"
                    maxLength={16}
                    className="uppercase font-mono tracking-wide"
                    placeholder="es. RSSMRA80A01H501Z"
                    value={formData.codiceFiscale}
                    onChange={(e) => setFormData(prev => ({ ...prev, codiceFiscale: e.target.value.toUpperCase() }))}
                  />
                  <p className="text-xs text-blue-700/70">
                    Usato per abbinare i PDF delle buste paga caricati in Costi Generali.
                  </p>
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

        {/* Conferma eliminazione dipendente */}
        <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare il dipendente?</AlertDialogTitle>
              <AlertDialogDescription>
                {toDelete && (
                  <>Stai per eliminare <strong>{toDelete.nome} {toDelete.cognome}</strong>. L'azione non può essere annullata.</>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (toDelete) deleteMutation.mutate(toDelete.id);
                  setToDelete(null);
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                Elimina
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
