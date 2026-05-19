// Wertstrom-Katalog (Pommer-Stand 2026-05-18, shared/wertstroeme.md).
// Farben sind Brand-distinkt: jeder Stream einen eigenen Tailwind-Accent
// für Color-Code in Persona-Cards. Reihenfolge per ID = visuelle Sortierung
// im Wizard-Grid (Klaus 2026-05-19).

export interface Wertstrom {
  id: string;
  slug: string;
  title: string;
  /** Tailwind class fragment für Farb-Akzent (border-l-4 + bg-… tag chip). */
  accent: string;
  textAccent: string;
}

export const WERTSTROEME: Wertstrom[] = [
  { id: '10', slug: '10-lead-to-cash',         title: 'Lead-to-Cash',       accent: 'border-emerald-500', textAccent: 'text-emerald-300 bg-emerald-500/15' },
  { id: '20', slug: '20-service-to-cash',      title: 'Service-to-Cash',    accent: 'border-blue-500',    textAccent: 'text-blue-300 bg-blue-500/15' },
  { id: '25', slug: '25-customer-service',     title: 'Customer-Service',   accent: 'border-cyan-400',    textAccent: 'text-cyan-300 bg-cyan-500/15' },
  { id: '30', slug: '30-brand-zu-markt',       title: 'Brand zu Markt',     accent: 'border-pink-500',    textAccent: 'text-pink-300 bg-pink-500/15' },
  { id: '35', slug: '35-idee-zu-produkt',      title: 'Idee zu Produkt',    accent: 'border-violet-500',  textAccent: 'text-violet-300 bg-violet-500/15' },
  { id: '40', slug: '40-idee-zu-skill',        title: 'Idee zu Skill',      accent: 'border-amber-500',   textAccent: 'text-amber-300 bg-amber-500/15' },
  { id: '50', slug: '50-wissen-zu-antwort',    title: 'Wissen zu Antwort',  accent: 'border-teal-400',    textAccent: 'text-teal-300 bg-teal-500/15' },
  { id: '60', slug: '60-procure-to-pay',       title: 'Procure-to-Pay',     accent: 'border-orange-500',  textAccent: 'text-orange-300 bg-orange-500/15' },
  { id: '70', slug: '70-it-operations',        title: 'IT-Operations',      accent: 'border-slate-400',   textAccent: 'text-slate-300 bg-slate-500/15' },
  { id: '80', slug: '80-asset-management',     title: 'Asset-Management',   accent: 'border-stone-500',   textAccent: 'text-stone-300 bg-stone-500/15' },
  { id: '85', slug: '85-esg-nachhaltigkeit',   title: 'ESG / Nachhaltigkeit', accent: 'border-green-500', textAccent: 'text-green-300 bg-green-500/15' },
  { id: '90', slug: '90-steuerung',            title: 'Steuerung',          accent: 'border-indigo-500',  textAccent: 'text-indigo-300 bg-indigo-500/15' },
  { id: '99', slug: '99-querschnitt',          title: 'Querschnitt',        accent: 'border-gray-400',    textAccent: 'text-gray-300 bg-gray-500/15' },
];

const BY_SLUG: Record<string, Wertstrom> = Object.fromEntries(WERTSTROEME.map(w => [w.slug, w]));

export function getWertstrom(slug: string): Wertstrom | undefined {
  return BY_SLUG[slug];
}

export function wertstromSortKey(slug: string): number {
  const w = BY_SLUG[slug];
  return w ? parseInt(w.id, 10) : 999;
}
