import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { User, UserRole, useAuth } from "@/hooks/useAuth";
import { UserPlus, Users, Shield, Edit, Trash2, Key } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface UserFormData {
  username: string;
  password: string;
  nome: string;
  email: string;
  role: UserRole;
}

export default function UsersManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  const [formData, setFormData] = useState<UserFormData>({
    username: "",
    password: "",
    nome: "",
    email: "",
    role: "collaboratore"
  });

  // Fetch users
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"]
  });

  // Create/Update user mutation
  const saveUserMutation = useMutation({
    mutationFn: async (data: UserFormData) => {
      const url = editingUser
        ? `/api/users/${editingUser.id}`
        : "/api/users";
      const method = editingUser ? "PUT" : "POST";

      const response = await apiRequest(method, url, data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Errore nel salvataggio");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: editingUser ? "Utente aggiornato" : "Utente creato",
        description: "L'utente è stato salvato con successo"
      });
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/users/${id}`);
      // 204 No Content doesn't have a body, so don't try to parse JSON
      return response.status === 204 ? null : response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Utente eliminato",
        description: "L'utente è stato eliminato con successo"
      });
      setUserToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const resetForm = () => {
    setFormData({
      username: "",
      password: "",
      nome: "",
      email: "",
      role: "collaboratore"
    });
    setEditingUser(null);
    setIsDialogOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.username || !formData.nome || !formData.email) {
      toast({
        title: "Errore",
        description: "Compila tutti i campi obbligatori",
        variant: "destructive"
      });
      return;
    }

    if (!editingUser && !formData.password) {
      toast({
        title: "Errore",
        description: "La password è obbligatoria per i nuovi utenti",
        variant: "destructive"
      });
      return;
    }

    saveUserMutation.mutate(formData);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: "", // Non mostrare la password esistente
      nome: user.nome,
      email: user.email,
      role: user.role
    });
    setIsDialogOpen(true);
  };

  const handleDelete = () => {
    if (userToDelete) {
      deleteUserMutation.mutate(userToDelete.id);
    }
  };

  const getRoleBadge = (role: UserRole) => {
    if (role === "amministratore") {
      return (
        <Badge className="bg-red-100 text-red-800">
          <Shield className="w-3 h-3 mr-1" />
          Amministratore
        </Badge>
      );
    }
    return (
      <Badge className="bg-blue-100 text-blue-800">
          Collaboratore
      </Badge>
    );
  };

  const adminCount = users.filter(u => u.role === "amministratore").length;
  const collabCount = users.filter(u => u.role === "collaboratore").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            Gestione Utenti
          </h2>
          <p className="text-gray-600 mt-1">Gestisci gli utenti e i loro permessi di accesso</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()} className="gap-2">
              <UserPlus className="w-4 h-4" />
              Nuovo Utente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingUser ? "Modifica Utente" : "Crea Nuovo Utente"}</DialogTitle>
              <DialogDescription>
                {editingUser
                  ? "Modifica i dati dell'utente"
                  : "Compila i dati per creare un nuovo utente"}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  disabled={!!editingUser}
                  placeholder="es. mario.rossi"
                />
              </div>

              <div>
                <Label htmlFor="password">
                  Password {!editingUser && "*"}
                  {editingUser && <span className="text-xs text-gray-500 ml-1">(lascia vuoto per non modificare)</span>}
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={!editingUser}
                  placeholder="••••••••"
                />
              </div>

              <div>
                <Label htmlFor="nome">Nome Completo *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  required
                  placeholder="es. Mario Rossi"
                />
              </div>

              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  placeholder="es. mario.rossi@example.com"
                />
              </div>

              <div>
                <Label htmlFor="role">Ruolo *</Label>
                {(() => {
                  // Quando si edita il proprio account, il ruolo e' bloccato:
                  // un admin potrebbe auto-degradarsi e perdere l'accesso
                  // amministrativo (bloccato anche lato server).
                  const isEditingSelf = !!editingUser && editingUser.id === currentUser?.id;
                  return (
                    <>
                      <Select
                        value={formData.role}
                        onValueChange={(value: UserRole) => setFormData({ ...formData, role: value })}
                        disabled={isEditingSelf}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="collaboratore">Collaboratore</SelectItem>
                          <SelectItem value="amministratore">
                            <span className="flex items-center gap-2">
                              <Shield className="w-4 h-4" />
                              Amministratore
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 mt-1">
                        {isEditingSelf
                          ? "Non puoi cambiare il ruolo del tuo account"
                          : formData.role === "amministratore"
                            ? "Accesso completo al sistema"
                            : "Accesso limitato, senza gestione fatture in ingresso"}
                      </p>
                    </>
                  );
                })()}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Annulla
                </Button>
                <Button type="submit" disabled={saveUserMutation.isPending}>
                  {saveUserMutation.isPending ? "Salvataggio..." : editingUser ? "Aggiorna" : "Crea Utente"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Utenti Totali</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{users.length}</div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Amministratori</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{adminCount}</div>
              <Shield className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Collaboratori</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{collabCount}</div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Elenco Utenti</CardTitle>
          <CardDescription>Gestisci tutti gli utenti del sistema</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-gray-500 py-8">Caricamento...</p>
          ) : users.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Nessun utente presente</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">Utente</th>
                    <th className="text-left py-3 px-4">Username</th>
                    <th className="text-left py-3 px-4">Email</th>
                    <th className="text-center py-3 px-4">Ruolo</th>
                    <th className="text-center py-3 px-4">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="font-medium">{user.nome}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm text-gray-600">{user.username}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm text-gray-600">{user.email}</div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {getRoleBadge(user.role)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(user)}
                            title="Modifica"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {/* Un admin non può eliminare il proprio account:
                              si bloccherebbe fuori dal sistema. */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setUserToDelete(user)}
                            disabled={user.id === currentUser?.id}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 disabled:text-gray-300 disabled:cursor-not-allowed"
                            title={user.id === currentUser?.id ? "Non puoi eliminare il tuo account" : "Elimina"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare l'utente?</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare l'utente <strong>{userToDelete?.nome}</strong>?
              <br />
              <span className="text-red-600 mt-2 block">
                Questa azione non può essere annullata.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Elimina Utente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
