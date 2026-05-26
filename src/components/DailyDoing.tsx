import { useEffect, useState } from 'preact/hooks';

/** Safe-subset response from hermes-rest `/public/personas/{key}/activity`. */
interface PublicActivity {
  persona: string;
  self_improvement: {
    cron: string;
    human: string | null;
    last_fire: string | null;
    last_status: 'ok' | 'error' | null;
    last_duration_ms: number | null;
    runs: number;
  } | null;
  self_scheduled_tasks: {
    count: number;
    cap: number;
    tasks: Array<{
      name: string;
      recurring: boolean;
      schedule_cron: string | null;
      run_at: string | null;
      runs_count: number;
      schedule_human: string | null;
    }>;
  };
}

interface Props {
  personaKey: string;
  /** Override the hermes-rest base URL — used in dev/staging. */
  apiBase?: string;
}

/**
 * Daily-Doing card for a single persona.
 *
 * Renders two sections: the static `selfimprovement.yaml` schedule (P30)
 * and the persona-authored self-scheduled tasks (P41). Both come from the
 * CORS-enabled public endpoint, so no Bearer token is needed in the browser.
 *
 * Fail-soft: any fetch error renders as a single muted hint instead of
 * crashing the surrounding persona page. The endpoint is rate-limited
 * (60/min/IP) — the card retries silently on 429 with a small backoff.
 */
export default function DailyDoing({ personaKey, apiBase }: Props) {
  const [data, setData] = useState<PublicActivity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base =
      apiBase ?? import.meta.env.PUBLIC_HERMES_REST_BASE ?? 'https://hermes.pommerconsulting.de';
    const url = `${base}/public/personas/${encodeURIComponent(personaKey)}/activity`;
    let cancelled = false;

    async function load() {
      try {
        const r = await fetch(url, { credentials: 'omit' });
        if (r.status === 429) {
          // Soft backoff — try once more after 5s rather than show an error.
          setTimeout(load, 5000);
          return;
        }
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        const body = (await r.json()) as PublicActivity;
        if (!cancelled) setData(body);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [personaKey, apiBase]);

  if (error) {
    return (
      <div class="text-xs text-gray-500 italic">
        Daily Doing momentan nicht abrufbar.
      </div>
    );
  }
  if (!data) {
    return <div class="text-xs text-gray-400 animate-pulse">lädt …</div>;
  }

  const si = data.self_improvement;
  const tasks = data.self_scheduled_tasks;

  return (
    <div class="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div class="text-sm font-semibold text-white">Daily Doing</div>

      {si ? (
        <div class="text-xs text-gray-300">
          <div>
            <span class="text-gray-500">Knowledge-Ingestion:</span>{' '}
            <span class="text-white">{si.human ?? si.cron}</span>
          </div>
          {si.last_fire && (
            <div class="mt-1">
              <span class="text-gray-500">Letzter Lauf:</span>{' '}
              <span class={si.last_status === 'error' ? 'text-red-400' : 'text-green-400'}>
                {si.last_status}
              </span>{' '}
              {si.last_duration_ms && (
                <span class="text-gray-500">({Math.round(si.last_duration_ms / 1000)}s)</span>
              )}
              {' · '}
              <span class="text-gray-500">{si.runs} Runs/7d</span>
            </div>
          )}
        </div>
      ) : (
        <div class="text-xs text-gray-500 italic">Kein automatischer Knowledge-Ingest konfiguriert.</div>
      )}

      <div>
        <div class="text-xs text-gray-400 mb-1">
          Eigene wiederkehrende Aufgaben ({tasks.count}/{tasks.cap})
        </div>
        {tasks.tasks.length === 0 ? (
          <div class="text-xs text-gray-500 italic">Keine</div>
        ) : (
          <ul class="space-y-1">
            {tasks.tasks.map((t) => (
              <li key={t.name} class="text-xs text-gray-300">
                <span class="text-white font-mono">{t.name}</span>
                {t.schedule_human ? (
                  <span class="text-gray-500"> · {t.schedule_human}</span>
                ) : t.run_at ? (
                  <span class="text-gray-500"> · einmalig {t.run_at}</span>
                ) : null}
                {t.runs_count > 0 && (
                  <span class="text-gray-500"> · {t.runs_count}× gefeuert</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
