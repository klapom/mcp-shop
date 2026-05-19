// Persona-spezifische Hinweise: welche Dokumente helfen einer Persona besonders.
// Wird im Upload-Step gezeigt basierend auf der Persona-Auswahl. MVP: hier
// hart-codiert pflegen — perspektivisch als Feld `customer_knowledge_hints`
// in personas/<key>/metadata.yaml ablegen und über sync-personas einlesen.

export interface PersonaHint {
  /** Persona-Key (matches PERSONAS[].key) */
  key: string;
  /** Kurzlabel: wofür die Persona Dokumente braucht */
  label: string;
  /** 2-5 konkrete Doku-Typen */
  documents: string[];
}

export const PERSONA_HINTS: PersonaHint[] = [
  { key: 'bjoern',             label: 'Brand-Architekt',         documents: ['Brand-Guide / CI-Manual', 'Pressemitteilungen', 'Website-Content', 'Marken-Glossar'] },
  { key: 'brand-guard',        label: 'CI-Quality-Gate',         documents: ['Brand-Tokens (Farben, Typo)', 'Logo-Library', 'Tonalitäts-Beispiele'] },
  { key: 'conny',              label: 'Service-Designerin',      documents: ['Service-Katalog', 'Customer-Stories', 'Pitch-Decks', 'Angebots-Templates'] },
  { key: 'cora',               label: 'CEO-Steuerung',           documents: ['Unternehmens-Strategie', 'OKRs / Roadmap', 'Org-Chart', 'Board-Reports'] },
  { key: 'doku-generator',     label: 'Doku-Spezialistin',       documents: ['Implementation-Templates', 'Customer-Onboarding-Doks', 'Style-Guide'] },
  { key: 'eike',               label: 'Senior-Berater',          documents: ['Beratungs-Methodik', 'Case-Studies', 'Lessons-Learned'] },
  { key: 'ferdinand',          label: 'Finance / DATEV',         documents: ['Kontenplan', 'DATEV-Exporte', 'Lohnabrechnungen', 'Bilanz / GuV', 'Steuer-Bescheide'] },
  { key: 'helga',              label: 'Onboarding-Wizard',       documents: ['Stellenbeschreibungen', 'Onboarding-Checklisten', 'Schema-v1-Beispiele'] },
  { key: 'larissa',            label: 'Legal-Compliance DE',     documents: ['Verträge / AGB', 'DSGVO-Records', 'Compliance-Policies', 'LkSG-Doku'] },
  { key: 'lead-hunter',        label: 'Sales-Outreach',          documents: ['Lead-Listen', 'Pricing', 'Battle-Cards', 'Customer-Profile', 'CRM-Export'] },
  { key: 'meeting-summarizer', label: 'Meeting-Wissens-Curator', documents: ['Meeting-Protokolle', 'Wiki-Exports', 'Slack/Teams-Threads'] },
  { key: 'mira',               label: 'Knowledge-Auditorin',     documents: ['Nichts spezifisch — Mira liest alles, was die anderen brauchen'] },
  { key: 'ot-expert',          label: 'OT / IT-Operations',      documents: ['OMNITRACKER-Configs', 'ServiceNow-Exporte', 'ITIL-Profile', 'Incident-Reports'] },
  { key: 'prisca',             label: 'Analyse / BI',            documents: ['KPI-Dashboards', 'BI-Reports', 'Analytics-Definitionen', 'Datenmodelle'] },
  { key: 'ulli',               label: 'Technik-Architekt',       documents: ['Architektur-Diagramme', 'Technische Specs', 'API-Doku', 'Runbooks'] },
  { key: 'valerie',            label: 'Wettbewerb / Markt',      documents: ['Wettbewerbs-Analysen', 'Markt-Reports', 'Branchen-Studien'] },
];

const BY_KEY: Record<string, PersonaHint> = Object.fromEntries(PERSONA_HINTS.map(h => [h.key, h]));

export function hintsForPersonas(selectedKeys: string[]): PersonaHint[] {
  return selectedKeys.map((k) => BY_KEY[k]).filter((h): h is PersonaHint => !!h);
}
