import {
  Home,
  FolderOpen,
  Wallet,
  BarChart3,
  ClipboardList,
  Users,
  Settings,
  type LucideIcon,
} from "lucide-react";

interface TabNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isAdmin: boolean;
}

interface TabConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export default function TabNavigation({ activeTab, onTabChange, isAdmin }: TabNavigationProps) {
  const tabs: TabConfig[] = [
    { id: "dashboard",   label: "Dashboard",    icon: Home },
    { id: "commesse",    label: "Commesse",     icon: FolderOpen },
    { id: "economia",    label: "Economia",     icon: Wallet },
    { id: "costi",       label: "Costi",        icon: BarChart3 },
    { id: "operativita", label: "Operatività",  icon: ClipboardList },
    { id: "anagrafica",  label: "Anagrafica",   icon: Users, adminOnly: true },
    { id: "sistema",     label: "Sistema",      icon: Settings },
  ];

  // Filtra i tab in base al ruolo utente
  const visibleTabs = tabs.filter(tab => !tab.adminOnly || isAdmin);

  return (
    <nav className="bg-g2-accent border-b-2 border-primary" role="tablist" data-testid="tab-navigation">
      <div className="flex overflow-x-auto">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`tab-button flex items-center gap-2 ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => onTabChange(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
              data-testid={`tab-${tab.id}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
