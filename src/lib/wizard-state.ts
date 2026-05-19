export interface UploadRecord {
  id: string;
  filename: string;
  size: number;
  sha256: string;
}

export interface AvatarParams {
  gender: string;
  age: string;
  style: string;
  hair: string;
  lighting: string;
  ethnicity: string;
  eye_color: string;
  glasses: string;
  tattoos: string;
  piercings: string;
  address: string;
}

export interface AuditGap {
  severity: 'high' | 'medium' | 'low';
  description: string;
}

export interface AuditReport {
  source_coverage_score?: number;
  gap_count?: number;
  recommendation_count?: number;
  gaps?: AuditGap[];
  recommendations?: string[];
  _stub?: boolean;
  _reason?: string;
}

export interface WizardState {
  tenantId?: string;
  token?: string;
  company?: string;
  branche?: string;
  selectedPersonas?: string[];
  uploads?: UploadRecord[];
  audit?: AuditReport;
  avatars?: Record<string, AvatarParams>;
}

const KEY = 'pommer_wizard_state';

export function loadState(): WizardState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WizardState) : {};
  } catch {
    return {};
  }
}

export function saveState(patch: Partial<WizardState>): WizardState {
  const current = loadState();
  const next = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearState(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem('pommer_tenant_token');
  localStorage.removeItem('pommer_tenant_id');
}
