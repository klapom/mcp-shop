/**
 * PersonaProposals — H10.13b/T44 root island for /admin/persona-proposals/.
 * No query → list; `?k=<key>` → detail of that draft (deep link).
 */

import { useEffect, useState } from 'preact/hooks';
import { KEY_RE } from '../../lib/personaProposalsApi';
import PersonaProposalsList from './PersonaProposalsList';
import PersonaProposalsDetail from './PersonaProposalsDetail';

type Route = { kind: 'list' } | { kind: 'detail'; key: string } | { kind: 'bad'; raw: string };

function readRoute(): Route {
  const k = new URLSearchParams(location.search).get('k');
  if (!k) return { kind: 'list' };
  return KEY_RE.test(k) ? { kind: 'detail', key: k } : { kind: 'bad', raw: k };
}

export default function PersonaProposals() {
  const [route, setRoute] = useState<Route | null>(null);
  useEffect(() => setRoute(readRoute()), []);
  if (!route) return null;

  return (
    <div class="min-h-screen bg-[#0d0d1a] text-white">
      <div class="max-w-5xl mx-auto px-4 py-8">
        <div class="mb-6">
          {route.kind !== 'list' && (
            <a href="/admin/persona-proposals/" class="text-xs text-white/50 hover:text-white">
              ← alle Persona-Entwürfe
            </a>
          )}
          <h1 class="text-2xl font-bold">Persona-Entwürfe</h1>
          <p class="mt-1 text-sm text-white/50">
            Von Personas vorgeschlagene neue Personas prüfen, korrigieren, übernehmen oder ablehnen.
            Entwurfsinhalte sind ungeprüfte Persona-Ausgabe und werden nur als Text angezeigt.
          </p>
        </div>
        {route.kind === 'list' && <PersonaProposalsList />}
        {route.kind === 'detail' && <PersonaProposalsDetail pkey={route.key} />}
        {route.kind === 'bad' && (
          <div class="rounded-xl border border-red-700/30 bg-red-900/20 p-5 text-sm text-red-200" data-testid="bad-link">
            Ungültiger Link: „{route.raw}". Erwartet wird <code>?k=&lt;key&gt;</code>.
          </div>
        )}
      </div>
    </div>
  );
}
