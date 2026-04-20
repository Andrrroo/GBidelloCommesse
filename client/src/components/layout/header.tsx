const logoUrl = "/logo_gb_1.jpg";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, User as UserIcon, Shield, Key } from "lucide-react";
import { User } from "@/hooks/useAuth";
import ChangePasswordModal from "@/components/system/change-password-modal";

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
}

export default function Header({ user, onLogout }: HeaderProps) {
  const [showChangePassword, setShowChangePassword] = useState(false);

  const handleLogout = async () => {
    await onLogout();
  };

  const isAdmin = user?.role === "amministratore";

  const getRoleLabel = (role: string) => {
    if (role === "amministratore") return "Admin";
    return "Operativo";
  };

  const getRoleBadgeColor = (role: string) => {
    if (role === "amministratore") {
      return "bg-red-100 text-red-800 border-red-300";
    }
    return "bg-blue-100 text-blue-800 border-blue-300";
  };

  return (
    <header className="bg-white border-b-2 border-primary sticky top-0 z-50 shadow-sm" data-testid="header">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src={logoUrl}
              alt="GB Engineering Logo"
              className="w-12 h-12 rounded-xl shadow-lg object-contain"
              data-testid="brand-logo"
            />
            <div>
              <h1 className="text-xl font-bold text-primary tracking-tight" data-testid="brand-title">
                GB Engineering
              </h1>
              <p className="text-sm text-gray-500" data-testid="brand-subtitle">
                Sistema Gestione Commesse
              </p>
            </div>
          </div>

          {/* User Info & Actions */}
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2">
                  {isAdmin ? (
                    <Shield className="h-5 w-5 text-red-600" />
                  ) : (
                    <UserIcon className="h-5 w-5 text-blue-600" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{user.nome}</p>
                    <p className="text-xs text-gray-500">{user.username}</p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`text-xs font-medium ${getRoleBadgeColor(user.role)}`}
                  data-testid="user-role-badge"
                >
                  {getRoleLabel(user.role)}
                </Badge>
              </div>
            )}

            {user && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowChangePassword(true)}
                className="flex items-center gap-2 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700"
              >
                <Key className="h-4 w-4" />
                <span className="hidden sm:inline">Cambia Password</span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="flex items-center gap-2 hover:bg-red-50 hover:border-red-300 hover:text-red-700"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
              Esci
            </Button>
          </div>
        </div>
      </div>

      {user && (
        <ChangePasswordModal
          open={showChangePassword}
          onOpenChange={setShowChangePassword}
          userId={user.id}
        />
      )}
    </header>
  );
}
