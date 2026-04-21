import { useState } from "react";
import Header from "@/components/layout/header";
import TabNavigation from "@/components/layout/tab-navigation";
import StatsCard from "@/components/dashboard/stats-card";
import RecentProjectsTable from "@/components/dashboard/recent-projects-table";
import EconomicDashboardCard from "@/components/dashboard/economic-dashboard-card";
import FattureScadenzaWidget from "@/components/dashboard/fatture-scadenza-widget";
import CashFlowDashboard from "@/components/dashboard/cash-flow-dashboard";
import EntrateUsciteChart from "@/components/dashboard/entrate-uscite-chart";
import IncassiManutenzioneChart from "@/components/dashboard/incassi-manutenzione-chart";
import ProjectsTable from "@/components/projects/projects-table";
import ClientsTable from "@/components/projects/clients-table";
import ParcellaCalculator from "@/components/projects/parcella-calculator-new";
import Scadenzario from "@/components/projects/scadenzario";
import RegistroComunicazioni from "@/components/projects/registro-comunicazioni";
import GestioneRisorse from "@/components/projects/gestione-risorse";
import KpiDashboard from "@/components/projects/kpi-dashboard";
import {
  FattureEmesseManager,
  FattureIngressoManager,
  FattureConsulentiManager
} from "@/components/projects/generic-invoice-manager";
import CostiVivi from "@/components/projects/costi-vivi";
import CostiGenerali from "@/components/projects/costi-generali";
import CentroCostoDashboard from "@/components/projects/centro-costo-dashboard";
import StoragePanel from "@/components/system/storage-panel";
import UsersManagement from "@/components/system/users-management";
import CollaboratoriManagement from "@/components/system/collaboratori-management";
import ActivityLogViewer from "@/components/system/activity-log-viewer";
import CalendarFeedPanel from "@/components/system/calendar-feed-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BreadcrumbNav } from "@/components/ui/breadcrumb-nav";
import { User } from "@/hooks/useAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

// Etichetta leggibile per il <title> associata a ciascun tab principale
const TAB_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  commesse: "Commesse",
  economia: "Economia",
  costi: "Costi",
  operativita: "Operativit\u00e0",
  anagrafica: "Anagrafica",
  sistema: "Sistema",
};

// Etichette leggibili dei sub-tab per il breadcrumb
const SUB_TAB_LABELS: Record<string, Record<string, string>> = {
  economia: {
    "fatture-emesse": "Fatture Emesse",
    "fatture-ingresso": "Fatture in Ingresso",
    "fatture-consulenti": "Fatture Consulenti",
  },
  costi: {
    "costi-vivi": "Costi Vivi",
    "costi-generali": "Costi Generali",
  },
  operativita: {
    scadenze: "Scadenzario",
    comunicazioni: "Comunicazioni",
    risorse: "Gestione Risorse",
    kpi: "KPI",
    "centro-costo": "Centro di Costo",
  },
  anagrafica: {
    clienti: "Clienti",
    collaboratori: "Collaboratori",
  },
  sistema: {
    storage: "Storage",
    calendar: "Calendario",
    users: "Utenti",
    "activity-log": "Activity Log",
  },
};

interface DashboardProps {
  user: User | null;
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const isAdmin = user?.role === "amministratore";

  const [activeTab, setActiveTab] = useState("dashboard");
  useDocumentTitle(TAB_TITLES[activeTab]);
  const [activeSubTab, setActiveSubTab] = useState({
    commesse: "lista",
    economia: "fatture-emesse",
    costi: "costi-vivi",
    operativita: "scadenze",
    anagrafica: "clienti",
    sistema: "storage",
  });
  const handleSubTabChange = (mainTab: string, subTab: string) => {
    setActiveSubTab(prev => ({ ...prev, [mainTab]: subTab }));
  };

  // Stile comune per i tab trigger. La linea rossa attiva è disegnata come
  // pseudo-element `after` posizionato con `-bottom-[2px]`, così cade
  // esattamente nello stesso Y del border-b-2 della TabsList sottostante.
  // L'underline è sempre presente ma `scale-x-0` → cresce dal centro con
  // transizione 200ms quando la tab diventa attiva. Colore testo/bg sfuma
  // con `transition-colors` per un passaggio meno rigido.
  const tabTriggerClass = "relative px-4 py-3 text-sm font-medium hover:bg-gray-50 rounded-none whitespace-nowrap transition-colors duration-200 data-[state=active]:text-secondary data-[state=active]:bg-secondary/5 data-[state=active]:hover:bg-secondary/5 after:content-[''] after:absolute after:inset-x-0 after:-bottom-[2px] after:h-[2px] after:bg-secondary after:scale-x-0 after:origin-center after:transition-transform after:duration-200 data-[state=active]:after:scale-x-100";

  return (
    <div className="min-h-screen bg-g2-accent">
      <Header user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto">
        <TabNavigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isAdmin={isAdmin}
        />

        <main className="p-6">
          {activeTab !== "dashboard" && (() => {
            const mainLabel = TAB_TITLES[activeTab];
            const sub = activeSubTab[activeTab as keyof typeof activeSubTab];
            const subLabel = sub && SUB_TAB_LABELS[activeTab]?.[sub];
            const items = [{ label: mainLabel, onClick: () => setActiveTab(activeTab) }];
            if (subLabel) items.push({ label: subLabel, onClick: () => {} });
            return (
              <BreadcrumbNav
                items={items}
                onHomeClick={() => setActiveTab("dashboard")}
                className="mb-4"
              />
            );
          })()}
          <div key={activeTab} className="animate-fade-in">
            {/* Dashboard Panel */}
            {activeTab === "dashboard" && (
              <div className="space-y-8" data-testid="dashboard-panel">
                {/* Widget economici (entrate/ricavi) solo per admin: Dashboard
                    Economica, grafico Entrate vs Uscite, grafico Incassi. */}
                {isAdmin && <EconomicDashboardCard />}

                {/* Widget Fatture in Scadenza */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <FattureScadenzaWidget />
                  <CashFlowDashboard isAdmin={isAdmin} />
                </div>

                {isAdmin && <EntrateUsciteChart isAdmin={isAdmin} />}

                {isAdmin && <IncassiManutenzioneChart />}

                {/* Second Row - Recent Projects */}
                <RecentProjectsTable />

                {/* Third Row - Core System Info */}
                <div className="grid gap-6 lg:grid-cols-1">
                  <StatsCard />
                </div>
              </div>
            )}

            {/* COMMESSE Panel */}
            {activeTab === "commesse" && (
              <div data-testid="commesse-panel" className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                <ProjectsTable />
              </div>
            )}

            {/* ECONOMIA Panel — accessibile a tutti (fatture/costi/centro costo/KPI) */}
            {activeTab === "economia" && (
              <div data-testid="economia-panel">
                <Tabs value={activeSubTab.economia} onValueChange={(value) => handleSubTabChange("economia", value)}>
                  <div className="bg-white rounded-t-2xl shadow-sm">
                    <TabsList className="flex h-auto w-full items-stretch bg-transparent border-0 border-b-2 border-gray-200 p-0 flex-wrap rounded-none">
                      <TabsTrigger value="fatture-emesse" className={tabTriggerClass} data-testid="tab-fatture-emesse">
                        Fatture Emesse
                      </TabsTrigger>
                      <TabsTrigger value="fatture-ingresso" className={tabTriggerClass} data-testid="tab-fatture-ingresso">
                        Fatture Ingresso
                      </TabsTrigger>
                      <TabsTrigger value="fatture-consulenti" className={tabTriggerClass} data-testid="tab-fatture-consulenti">
                        Fatture Consulenti
                      </TabsTrigger>
                      <TabsTrigger value="costi-generali" className={tabTriggerClass} data-testid="tab-costi-generali">
                        Costi Generali
                      </TabsTrigger>
                      <TabsTrigger value="centro-costo" className={tabTriggerClass} data-testid="tab-centro-costo">
                        Centro Costo
                      </TabsTrigger>
                      {isAdmin && (
                        <TabsTrigger value="kpi" className={tabTriggerClass} data-testid="tab-kpi">
                          KPI Dashboard
                        </TabsTrigger>
                      )}
                    </TabsList>
                  </div>

                  <TabsContent value="fatture-emesse" className="bg-white rounded-b-2xl shadow-lg border border-t-0 border-gray-100 p-6 mt-0 data-[state=active]:animate-fade-in">
                    <FattureEmesseManager />
                  </TabsContent>

                  <TabsContent value="fatture-ingresso" className="bg-white rounded-b-2xl shadow-lg border border-t-0 border-gray-100 p-6 mt-0 data-[state=active]:animate-fade-in">
                    <FattureIngressoManager />
                  </TabsContent>

                  <TabsContent value="fatture-consulenti" className="bg-white rounded-b-2xl shadow-lg border border-t-0 border-gray-100 p-6 mt-0 data-[state=active]:animate-fade-in">
                    <FattureConsulentiManager />
                  </TabsContent>

                  <TabsContent value="costi-generali" className="bg-white rounded-b-2xl shadow-lg border border-t-0 border-gray-100 p-6 mt-0 data-[state=active]:animate-fade-in">
                    <CostiGenerali />
                  </TabsContent>

                  <TabsContent value="centro-costo" className="bg-white rounded-b-2xl shadow-lg border border-t-0 border-gray-100 p-6 mt-0 data-[state=active]:animate-fade-in">
                    <CentroCostoDashboard />
                  </TabsContent>

                  {isAdmin && (
                    <TabsContent value="kpi" className="bg-white rounded-b-2xl shadow-lg border border-t-0 border-gray-100 p-6 mt-0 data-[state=active]:animate-fade-in">
                      <KpiDashboard />
                    </TabsContent>
                  )}
                </Tabs>
              </div>
            )}

            {/* COSTI Panel - Accessibile a tutti per Costi Vivi */}
            {activeTab === "costi" && (
              <div data-testid="costi-panel">
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                  <CostiVivi user={user} />
                </div>
              </div>
            )}

            {/* OPERATIVITA Panel */}
            {activeTab === "operativita" && (
              <div data-testid="operativita-panel">
                <Tabs value={activeSubTab.operativita} onValueChange={(value) => handleSubTabChange("operativita", value)}>
                  <div className="bg-white rounded-t-2xl shadow-sm">
                    <TabsList className="flex h-auto w-full items-stretch bg-transparent border-0 border-b-2 border-gray-200 p-0 rounded-none">
                      <TabsTrigger value="scadenze" className={tabTriggerClass} data-testid="tab-scadenze">
                        Scadenzario
                      </TabsTrigger>
                      <TabsTrigger value="comunicazioni" className={tabTriggerClass} data-testid="tab-comunicazioni">
                        Comunicazioni
                      </TabsTrigger>
                      <TabsTrigger value="risorse" className={tabTriggerClass} data-testid="tab-risorse">
                        Gestione Risorse
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="scadenze" className="bg-white rounded-b-2xl shadow-lg border border-t-0 border-gray-100 p-6 mt-0 data-[state=active]:animate-fade-in">
                    <Scadenzario />
                  </TabsContent>

                  <TabsContent value="comunicazioni" className="bg-white rounded-b-2xl shadow-lg border border-t-0 border-gray-100 p-6 mt-0 data-[state=active]:animate-fade-in">
                    <RegistroComunicazioni />
                  </TabsContent>

                  <TabsContent value="risorse" className="bg-white rounded-b-2xl shadow-lg border border-t-0 border-gray-100 p-6 mt-0 data-[state=active]:animate-fade-in">
                    <GestioneRisorse />
                  </TabsContent>
                </Tabs>
              </div>
            )}

            {/* ANAGRAFICA Panel - Solo Admin */}
            {activeTab === "anagrafica" && isAdmin && (
              <div data-testid="anagrafica-panel">
                <Tabs value={activeSubTab.anagrafica} onValueChange={(value) => handleSubTabChange("anagrafica", value)}>
                  <div className="bg-white rounded-t-2xl shadow-sm">
                    <TabsList className="flex h-auto w-full items-stretch bg-transparent border-0 border-b-2 border-gray-200 p-0 rounded-none">
                      <TabsTrigger value="clienti" className={tabTriggerClass} data-testid="tab-clienti">
                        Anagrafica Clienti
                      </TabsTrigger>
                      <TabsTrigger value="collaboratori" className={tabTriggerClass} data-testid="tab-collaboratori">
                        Anagrafica Collaboratori
                      </TabsTrigger>
                      <TabsTrigger value="parcella" className={tabTriggerClass} data-testid="tab-parcella">
                        Calcolo Parcella
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="clienti" className="bg-white rounded-b-2xl shadow-lg border border-t-0 border-gray-100 p-6 mt-0 data-[state=active]:animate-fade-in">
                    <ClientsTable />
                  </TabsContent>

                  <TabsContent value="collaboratori" className="bg-white rounded-b-2xl shadow-lg border border-t-0 border-gray-100 p-6 mt-0 data-[state=active]:animate-fade-in">
                    <CollaboratoriManagement />
                  </TabsContent>

                  <TabsContent value="parcella" className="bg-white rounded-b-2xl shadow-lg border border-t-0 border-gray-100 p-6 mt-0 data-[state=active]:animate-fade-in">
                    <ParcellaCalculator />
                  </TabsContent>
                </Tabs>
              </div>
            )}

            {/* SISTEMA Panel */}
            {activeTab === "sistema" && (
              <div data-testid="sistema-panel">
                <Tabs value={activeSubTab.sistema} onValueChange={(value) => handleSubTabChange("sistema", value)}>
                  <div className="bg-white rounded-t-2xl shadow-sm">
                    <TabsList className="flex h-auto w-full items-stretch bg-transparent border-0 border-b-2 border-gray-200 p-0 rounded-none">
                      <TabsTrigger value="storage" className={tabTriggerClass} data-testid="tab-storage">
                        Storage
                      </TabsTrigger>
                      <TabsTrigger value="calendar" className={tabTriggerClass} data-testid="tab-calendar">
                        Calendario
                      </TabsTrigger>
                      {isAdmin && (
                        <TabsTrigger value="users" className={tabTriggerClass} data-testid="tab-users">
                          Gestione Utenti
                        </TabsTrigger>
                      )}
                      {isAdmin && (
                        <TabsTrigger value="activity-log" className={tabTriggerClass} data-testid="tab-activity-log">
                          Log Attività
                        </TabsTrigger>
                      )}
                    </TabsList>
                  </div>

                  <TabsContent value="storage" className="bg-white rounded-b-2xl shadow-lg border border-t-0 border-gray-100 p-6 mt-0 data-[state=active]:animate-fade-in">
                    <StoragePanel />
                  </TabsContent>

                  <TabsContent value="calendar" className="bg-white rounded-b-2xl shadow-lg border border-t-0 border-gray-100 p-6 mt-0 data-[state=active]:animate-fade-in">
                    <CalendarFeedPanel />
                  </TabsContent>

                  {isAdmin && (
                    <TabsContent value="users" className="bg-white rounded-b-2xl shadow-lg border border-t-0 border-gray-100 p-6 mt-0 data-[state=active]:animate-fade-in">
                      <UsersManagement />
                    </TabsContent>
                  )}

                  {isAdmin && (
                    <TabsContent value="activity-log" className="bg-white rounded-b-2xl shadow-lg border border-t-0 border-gray-100 p-6 mt-0 data-[state=active]:animate-fade-in">
                      <ActivityLogViewer showAll={true} />
                    </TabsContent>
                  )}
                </Tabs>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
