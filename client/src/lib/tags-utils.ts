// Utility functions for tags and categories management.
// Le icone sono componenti Lucide per uniformità col resto dell'app.
import {
  Flame, Hourglass, ClipboardList, BarChart3, Search, Ban, Star, Building2,
  Hammer, Route, Zap, Droplet, Landmark, Building, Leaf, Castle, Mountain,
  CheckCircle2, Folder, Pin, Target, Briefcase, Wrench, Trophy, Lightbulb,
  Bell, FileText, Palette, Key, Settings, Tag,
  type LucideIcon,
} from 'lucide-react';

export interface TagConfig {
  name: string;
  color: string;
  icon?: LucideIcon;
  description?: string;
}

export interface CategoryConfig {
  name: string;
  color: string;
  icon?: LucideIcon;
  description?: string;
}

export const DEFAULT_TAGS: TagConfig[] = [
  { name: 'Urgente',                   color: '#EF4444', icon: Flame,          description: 'Commessa con priorità alta' },
  { name: 'In Attesa Cliente',         color: '#F59E0B', icon: Hourglass,      description: 'In attesa di risposta dal cliente' },
  { name: 'Documentazione Completa',   color: '#10B981', icon: ClipboardList,  description: 'Tutta la documentazione raccolta' },
  { name: 'SAL in Corso',              color: '#3B82F6', icon: BarChart3,      description: 'SAL in fase di elaborazione' },
  { name: 'In Revisione',              color: '#8B5CF6', icon: Search,         description: 'Progetto in fase di revisione' },
  { name: 'Bloccato',                  color: '#DC2626', icon: Ban,            description: 'Commessa bloccata' },
  { name: 'VIP',                       color: '#F97316', icon: Star,           description: 'Cliente prioritario' },
  { name: 'Interno',                   color: '#6366F1', icon: Building2,      description: 'Progetto interno' },
];

export const DEFAULT_CATEGORIES: CategoryConfig[] = [
  { name: 'Edilizia',        color: '#F97316', icon: Hammer,        description: 'Progetti edilizi' },
  { name: 'Infrastrutture',  color: '#3B82F6', icon: Route,         description: 'Strade, ponti, reti' },
  { name: 'Impianti',        color: '#10B981', icon: Zap,           description: 'Impianti tecnologici' },
  { name: 'Idraulica',       color: '#06B6D4', icon: Droplet,       description: 'Opere idrauliche' },
  { name: 'Strutturale',     color: '#8B5CF6', icon: Landmark,      description: 'Progettazione strutturale' },
  { name: 'Urbanistica',     color: '#EC4899', icon: Building,      description: 'Piani urbanistici' },
  { name: 'Ambiente',        color: '#22C55E', icon: Leaf,          description: 'Progetti ambientali' },
  { name: 'Restauro',        color: '#A855F7', icon: Castle,        description: 'Restauro edifici storici' },
  { name: 'Geotecnica',      color: '#F59E0B', icon: Mountain,      description: 'Indagini geotecniche' },
  { name: 'Collaudi',        color: '#6366F1', icon: CheckCircle2,  description: 'Collaudi tecnici' },
];

export function getTagColor(tagName: string): string {
  const tag = DEFAULT_TAGS.find(t => t.name === tagName);
  return tag?.color || '#6B7280';
}

export function getCategoryColor(categoryName: string): string {
  const category = DEFAULT_CATEGORIES.find(c => c.name === categoryName);
  return category?.color || '#6B7280';
}

export function getTagIcon(tagName: string): LucideIcon {
  const tag = DEFAULT_TAGS.find(t => t.name === tagName);
  return tag?.icon || Tag;
}

export function getCategoryIcon(categoryName: string): LucideIcon {
  const category = DEFAULT_CATEGORIES.find(c => c.name === categoryName);
  return category?.icon || Folder;
}

// Color palette for custom tags/categories
export const COLOR_PALETTE = [
  { name: 'Rosso',     value: '#EF4444' },
  { name: 'Arancione', value: '#F97316' },
  { name: 'Ambra',     value: '#F59E0B' },
  { name: 'Giallo',    value: '#EAB308' },
  { name: 'Lime',      value: '#84CC16' },
  { name: 'Verde',     value: '#22C55E' },
  { name: 'Smeraldo',  value: '#10B981' },
  { name: 'Teal',      value: '#14B8A6' },
  { name: 'Ciano',     value: '#06B6D4' },
  { name: 'Azzurro',   value: '#0EA5E9' },
  { name: 'Blu',       value: '#3B82F6' },
  { name: 'Indaco',    value: '#6366F1' },
  { name: 'Viola',     value: '#8B5CF6' },
  { name: 'Porpora',   value: '#A855F7' },
  { name: 'Fucsia',    value: '#D946EF' },
  { name: 'Rosa',      value: '#EC4899' },
  { name: 'Grigio',    value: '#6B7280' },
  { name: 'Ardesia',   value: '#64748B' },
];

// Palette di icone disponibili per tag/category custom. Ogni entry è un
// componente Lucide pronto da renderizzare nei picker.
export const ICON_PALETTE: LucideIcon[] = [
  Tag, Star, Flame, Hourglass, ClipboardList, BarChart3, Search, Ban,
  Building2, Hammer, Route, Zap, Droplet, Landmark, Building, Leaf,
  Castle, Mountain, CheckCircle2, Folder, Pin, Target, Briefcase, Wrench,
  Hammer, Trophy, Lightbulb, Bell, FileText, Palette, Key, Settings,
];
