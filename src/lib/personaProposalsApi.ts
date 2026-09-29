/**
 * personaProposalsApi.ts — typed client for the persona-draft review API (H10.13b/T44).
 *
 * Base: same-origin `/agentfirm-api/persona-proposals` (same prefix + CF-Access auth model as
 * skillProposalsApi.ts: no token from the frontend). Errors reuse ProposalApiError.
 * Draft content (identity_prose, stellenbeschreibung_md, …) is UNTRUSTED persona output.
 */

import { API_BASE, ProposalApiError, parseErrorDetail } from './skillProposalsApi';

const BASE = `${API_BASE}/persona-proposals`;

export type PersonaProposalState = 'new' | 'adopted' | 'rejected';

export interface PersonaProposalItem {
  key: string;
  display_name: string;
  state: PersonaProposalState | string;
  owner: string;
  created: string;
  wertstrom: string;
  stream_lead: string;
  skills: string[];
}

export interface PersonaProposalMeta {
  state: PersonaProposalState | string;
  owner?: string;
  created?: string;
  adopted_at?: string;
  rejected_at?: string;
  reason?: string;
}

export interface PersonaDraft {
  key: string;
  display_name: string;
  identity_prose: string;
  wertstrom: string;
  stream_lead: string;
  skills: string[];
  rationale?: string;
  [k: string]: unknown;
}

export interface PersonaProposalDetail {
  key: string;
  meta: PersonaProposalMeta;
  draft: PersonaDraft;
  stellenbeschreibung_md: string;
}

export interface AdoptFields {
  display_name?: string;
  identity_prose?: string;
  wertstrom?: string;
  stream_lead?: string;
  skills?: string[];
}

export const KEY_RE = /^[a-z0-9][a-z0-9-]*$/;

export const PERSONA_STATE_LABELS: Record<string, string> = {
  new: 'neu',
  adopted: 'übernommen',
  rejected: 'abgelehnt',
};

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { credentials: 'same-origin', ...init });
  } catch (e) {
    throw new ProposalApiError(
      0,
      `Keine Verbindung zur API (${e instanceof Error ? e.message : String(e)}). ` +
        'Ist die Cloudflare-Access-Sitzung abgelaufen? Seite neu laden.',
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const { message, problems } = parseErrorDetail(res.status, text);
    throw new ProposalApiError(res.status, message, problems);
  }
  return res.json() as Promise<T>;
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export function listPersonaProposals(): Promise<PersonaProposalItem[]> {
  return apiFetch('');
}

export function getPersonaProposal(key: string): Promise<PersonaProposalDetail> {
  return apiFetch(`/${encodeURIComponent(key)}`);
}

export function adoptPersonaProposal(key: string, fields: AdoptFields): Promise<{ key: string; state: string }> {
  return apiFetch(`/${encodeURIComponent(key)}/adopt`, post(fields));
}

export function rejectPersonaProposal(key: string, reason: string): Promise<{ key: string; state: string }> {
  return apiFetch(`/${encodeURIComponent(key)}/reject`, post({ reason }));
}

export function personaDetailHref(key: string): string {
  return `/admin/persona-proposals/?k=${encodeURIComponent(key)}`;
}
