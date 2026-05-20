// Pommer-eigene MCP-Datenquellen + Per-Persona-Default-Vorauswahl.
//
// MVP (P28 Variante "a"): hier hartkodiert pflegen — analog persona-hints.ts.
// Perspektivisch (P28 Variante "b") werden diese MCPs echte Registry-Einträge
// mit scope=global, dann kommt die Liste aus der DB statt aus dieser Datei.
//
// Die IDs entsprechen den Gateway-Upstream-Namespaces (src/gateway/config.py
// im mcp-gateway). flux + regionalstatistik fehlen bewusst — sie sind noch
// nicht im Gateway registriert.

export interface PommerMcp {
  /** Gateway-Upstream-Namespace */
  id: string;
  /** Anzeigename in der GUI */
  label: string;
  /** Kurzbeschreibung: was die Datenquelle liefert */
  description: string;
}

export const POMMER_MCPS: PommerMcp[] = [
  { id: 'searxng', label: 'Web-Recherche (SearXNG)', description: 'Meta-Suchmaschine für aktuelle Web-Recherche' },
  { id: 'm365', label: 'Microsoft 365', description: 'Mail, Kalender, Teams, OneDrive/SharePoint' },
  { id: 'linkedin', label: 'LinkedIn', description: 'Profil- und Unternehmens-Recherche für Sales' },
  { id: 'ot-knowledge', label: 'OMNITRACKER-Wissen', description: 'RAG über den OMNITRACKER-Wissensgraph' },
  { id: 'itil', label: 'ITIL-Wissen', description: 'ITIL v4/v5 Best-Practice-Wissensbasis' },
  { id: 'servicenow', label: 'ServiceNow-Doku', description: 'ServiceNow-Plattform-Dokumentation' },
  { id: 'fnt', label: 'FNT-Doku', description: 'FNT-Command-Wissensbasis' },
];

// Welche Pommer-MCPs sind bei welcher Persona sinnvoll vorausgewählt.
// Abgeleitet aus den bundle-tools.yaml (mcp_servers:) der 16 Personas.
// Nicht gelistete Personas (brand-guard, eike, ulli, mira) haben keine
// Default-MCPs — reine Review-/QG-Rollen ohne externe Datenquellen.
export const PERSONA_MCP_DEFAULTS: Record<string, string[]> = {
  'lead-hunter': ['linkedin', 'searxng', 'm365'],
  'ot-expert': ['ot-knowledge', 'searxng', 'itil'],
  'doku-generator': ['ot-knowledge', 'servicenow', 'fnt'],
  conny: ['linkedin', 'm365'],
  bjoern: ['searxng', 'm365'],
  helga: ['m365'],
  'meeting-summarizer': ['m365'],
  cora: ['searxng'],
  ferdinand: ['searxng'],
  larissa: ['searxng'],
  prisca: ['itil'],
  valerie: ['itil'],
};

/** Union der Default-MCPs über alle ausgewählten Personas. */
export function defaultMcpsFor(personaKeys: string[]): string[] {
  const set = new Set<string>();
  for (const key of personaKeys) {
    for (const mcp of PERSONA_MCP_DEFAULTS[key] ?? []) set.add(mcp);
  }
  return POMMER_MCPS.filter((m) => set.has(m.id)).map((m) => m.id);
}

/** Welche der ausgewählten Personas nutzt diesen MCP per Default. */
export function personasUsingMcp(mcpId: string, personaKeys: string[]): string[] {
  return personaKeys.filter((k) => (PERSONA_MCP_DEFAULTS[k] ?? []).includes(mcpId));
}
