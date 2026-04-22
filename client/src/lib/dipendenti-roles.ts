import {
  Ruler, HardHat, Shield, AlertTriangle, CheckCircle2, Wrench,
  Mountain, Hammer, Zap, User as UserIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * Ruoli standard per un dipendente tecnico.
 * Condivisi tra anagrafica Dipendenti e Gestione Risorse commesse, così
 * un dipendente salvato in anagrafica con un dato ruolo si auto-mappa
 * correttamente nel Select del form di gestione risorse.
 *
 * `value` è la chiave salvata nel campo `ruolo` del Dipendente e nel
 * campo `role` della ProjectResource.
 */
export const DIPENDENTE_ROLES: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "progettista",   label: "Progettista",                                  icon: Ruler },
  { value: "dl",            label: "Direttore Lavori",                             icon: HardHat },
  { value: "csp",           label: "CSP - Coordinatore Sicurezza Progettazione",  icon: Shield },
  { value: "cse",           label: "CSE - Coordinatore Sicurezza Esecuzione",     icon: AlertTriangle },
  { value: "collaudatore",  label: "Collaudatore",                                 icon: CheckCircle2 },
  { value: "tecnico",       label: "Tecnico",                                      icon: Wrench },
  { value: "geologo",       label: "Geologo",                                      icon: Mountain },
  { value: "strutturista",  label: "Ing. Strutturista",                            icon: Hammer },
  { value: "impiantista",   label: "Ing. Impiantista",                             icon: Zap },
  { value: "altro",         label: "Altro",                                        icon: UserIcon },
];

/** Restituisce la label leggibile dato il value del ruolo (fallback: il value stesso) */
export function getRoleLabel(value: string | undefined | null): string {
  if (!value) return "-";
  const r = DIPENDENTE_ROLES.find(x => x.value === value);
  return r ? r.label : value;
}
