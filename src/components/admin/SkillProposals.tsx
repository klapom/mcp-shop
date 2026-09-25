/**
 * SkillProposals — H8.14 Variante C root island for /admin/skills/.
 *
 * Without query → overview (SkillProposalsList). With `?p=<persona>&s=<skill>` (the deep-link
 * format of Skilli's Teams ping) → detail of that draft. Parameters are validated against the
 * API's name rules before any request is made.
 */

import { useEffect, useState } from 'preact/hooks';
import { PERSONA_RE, SKILL_RE } from '../../lib/skillProposalsApi';
import SkillProposalsList from './SkillProposalsList';
import SkillProposalsDetail from './SkillProposalsDetail';

type Route =
  | { kind: 'list' }
  | { kind: 'detail'; persona: string; name: string }
  | { kind: 'bad'; raw: string };

function readRoute(): Route {
  const q = new URLSearchParams(location.search);
  const p = q.get('p');
  const s = q.get('s');
  if (!p && !s) return { kind: 'list' };
  if (p && s && PERSONA_RE.test(p) && SKILL_RE.test(s)) return { kind: 'detail', persona: p, name: s };
  return { kind: 'bad', raw: `${p ?? ''}/${s ?? ''}` };
}

export default function SkillProposals() {
  const [route, setRoute] = useState<Route | null>(null);

  useEffect(() => {
    setRoute(readRoute());
  }, []);

  if (!route) return null;

  return (
    <div class="min-h-screen bg-[#0d0d1a] text-white">
      <div class="max-w-5xl mx-auto px-4 py-8">
        <div class="mb-6">
          {route.kind !== 'list' && (
            <a href="/admin/skills/" class="text-xs text-white/50 hover:text-white">
              ← alle Skill-Vorschläge
            </a>
          )}
          <h1 class="text-2xl font-bold">Skill-Vorschläge</h1>
          <p class="mt-1 text-sm text-white/50">
            Skill-Entwürfe der Personas prüfen, korrigieren, übernehmen oder ablehnen. Entwurfsinhalte sind
            ungeprüfte Persona-Ausgabe und werden nur als Text angezeigt.
          </p>
        </div>
        {route.kind === 'list' && <SkillProposalsList />}
        {route.kind === 'detail' && <SkillProposalsDetail persona={route.persona} name={route.name} />}
        {route.kind === 'bad' && (
          <div
            class="rounded-xl border border-red-700/30 bg-red-900/20 p-5 text-sm text-red-200"
            data-testid="bad-link"
          >
            Ungültiger Link: „{route.raw}". Erwartet wird <code>?p=&lt;persona&gt;&amp;s=&lt;skill&gt;</code>.
          </div>
        )}
      </div>
    </div>
  );
}
