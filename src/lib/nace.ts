export interface NaceSection {
  code: string;
  label: string;
}

export const NACE_SECTIONS: NaceSection[] = [
  { code: 'A', label: 'A — Land- und Forstwirtschaft, Fischerei' },
  { code: 'B', label: 'B — Bergbau und Gewinnung von Steinen und Erden' },
  { code: 'C', label: 'C — Verarbeitendes Gewerbe' },
  { code: 'D', label: 'D — Energieversorgung' },
  { code: 'E', label: 'E — Wasserversorgung, Abwasser, Abfall' },
  { code: 'F', label: 'F — Baugewerbe / Bau' },
  { code: 'G', label: 'G — Handel; Instandhaltung und Reparatur von Fahrzeugen' },
  { code: 'H', label: 'H — Verkehr und Lagerei' },
  { code: 'I', label: 'I — Gastgewerbe / Beherbergung und Gastronomie' },
  { code: 'J', label: 'J — Information und Kommunikation' },
  { code: 'K', label: 'K — Finanz- und Versicherungsdienstleistungen' },
  { code: 'L', label: 'L — Grundstücks- und Wohnungswesen' },
  { code: 'M', label: 'M — Freiberufliche, wissenschaftliche und technische Tätigkeiten' },
  { code: 'N', label: 'N — Sonstige wirtschaftliche Dienstleistungen' },
  { code: 'O', label: 'O — Öffentliche Verwaltung, Verteidigung, Sozialversicherung' },
  { code: 'P', label: 'P — Erziehung und Unterricht' },
  { code: 'Q', label: 'Q — Gesundheits- und Sozialwesen' },
  { code: 'R', label: 'R — Kunst, Unterhaltung und Erholung' },
  { code: 'S', label: 'S — Sonstige Dienstleistungen' },
  { code: 'T', label: 'T — Private Haushalte' },
  { code: 'U', label: 'U — Exterritoriale Organisationen und Körperschaften' },
];
