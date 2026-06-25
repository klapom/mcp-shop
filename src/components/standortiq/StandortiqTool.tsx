import { useCallback, useEffect, useState } from 'preact/hooks';

import { authHeader, GATEWAY_BASE, isAuthenticated, startLogin } from '../../lib/gateway-auth';
import {
  AuthError,
  DEV_TOKEN,
  getReportSections,
  prepareSite,
  pollJob,
  QuotaExceededError,
  saveSelection,
  startGeneration,
  type GenerateResult,
  type JobProgress,
  type PreparedSite,
  type ReportSection,
} from '../../lib/standortiq-api';

/**
 * StandortIQ Standortanalyse — interactive freemium tool (shop island).
 *
 * Flow: Adresse → Wettbewerber → Vor-Ort-Notizen → Report → Download.
 * Auth: gateway JWT (gateway-auth.ts). 3 free runs per tenant; the backend
 * returns 402 after that → paywall → Stripe checkout via the gateway.
 * See HOGA_V2/docs/SHOP_INTEGRATION_PLAN.md.
 */

const STEPS = ['Adresse', 'Wettbewerber', 'Vor-Ort-Notizen', 'Report'];

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'vollhotel', label: 'Vollhotel' },
  { value: 'hotel_garni', label: 'Hotel garni' },
  { value: 'boarding_house', label: 'Boarding House' },
  { value: 'serviced_apartments', label: 'Serviced Apartments' },
  { value: 'gastronomie', label: 'Gastronomie' },
];

function prettySubcat(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function StandortiqTool() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState<{ free: number; used: number } | null>(null);
  const [authNeeded, setAuthNeeded] = useState(false);

  const [address, setAddress] = useState('');
  const [category, setCategory] = useState('vollhotel');
  const [sections, setSections] = useState<ReportSection[] | null>(null);
  const [site, setSite] = useState<PreparedSite | null>(null);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [progressMsg, setProgressMsg] = useState('');
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    // DEV_TOKEN (local-only) bypasses the gateway login entirely.
    setAuthed(isAuthenticated() || !!DEV_TOKEN);
  }, []);

  function doLogin() {
    setLoginError(null);
    // PKCE needs Web Crypto, which the browser only exposes in a secure
    // context (HTTPS or localhost). Over http://<ip> it's undefined and the
    // redirect would silently fail.
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setLoginError(
        'Anmeldung nur über HTTPS oder localhost möglich (Web Crypto/PKCE). ' +
          'Diese Seite läuft über eine unsichere Verbindung.',
      );
      return;
    }
    startLogin().catch((e) => {
      setLoginError('Anmeldung konnte nicht gestartet werden: ' + (e?.message ?? 'unbekannt'));
    });
  }

  // Section preview: which report sections this Betriebstyp produces (from the
  // backend ReportProfile — stays in sync with the actual report).
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    getReportSections(category)
      .then((r) => {
        if (!cancelled) setSections(r.sections);
      })
      .catch((e) => {
        if (cancelled) return;
        setSections(null);
        // Surface a 401 immediately (e.g. backend not yet released for the
        // gateway JWT) instead of silently showing no preview.
        if (e instanceof AuthError) setAuthNeeded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authed, category]);

  function handleError(e: unknown) {
    if (e instanceof AuthError) {
      // Make it visible (don't silently redirect — a misconfigured backend
      // would otherwise loop and look like "nothing happens").
      setAuthNeeded(true);
      return;
    }
    if (e instanceof QuotaExceededError) {
      setPaywall({ free: e.freeRuns, used: e.runsUsed });
      return;
    }
    setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
  }

  async function handlePrepare() {
    if (!address.trim()) return;
    setLoading(true);
    setError(null);
    setAuthNeeded(false);
    try {
      const data = await prepareSite(address.trim(), category);
      setSite(data);
      const init: Record<string, Set<string>> = {};
      for (const [subcat, comps] of Object.entries(data.competitors)) {
        init[subcat] = new Set(comps.slice(0, 5).map((c) => c.name));
      }
      setSelected(init);
      setStep(1);
    } catch (e) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  }

  function toggle(subcat: string, name: string) {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[subcat] ?? []);
      if (set.has(name)) set.delete(name);
      else set.add(name);
      next[subcat] = set;
      return next;
    });
  }

  function setGroup(subcat: string, names: string[], on: boolean) {
    setSelected((prev) => ({ ...prev, [subcat]: on ? new Set(names) : new Set() }));
  }

  const poll = useCallback(async (jobId: string) => {
    let transient = 0; // tolerate brief network/5xx blips — the job runs server-side
    for (;;) {
      let job;
      try {
        job = await pollJob(jobId);
        transient = 0;
      } catch (e) {
        // Auth (refresh already failed) and quota are terminal; anything else
        // is likely a transient blip — keep polling, the backend job continues.
        if (e instanceof AuthError || e instanceof QuotaExceededError || ++transient > 5) {
          handleError(e);
          setLoading(false);
          return;
        }
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      if (job.status === 'completed' && job.result) {
        setResult(job.result);
        setLoading(false);
        return;
      }
      if (job.status === 'failed') {
        setError(job.error ?? 'Report-Generierung fehlgeschlagen');
        setLoading(false);
        return;
      }
      if (job.progress) setProgress(job.progress);
      if (typeof job.elapsed_seconds === 'number') setElapsed(Math.round(job.elapsed_seconds));
      setProgressMsg(`Läuft … (${job.elapsed_seconds ? Math.round(job.elapsed_seconds) + 's' : 'gestartet'})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }, []);

  async function handleGenerate() {
    if (!site) return;
    setLoading(true);
    setError(null);
    setPaywall(null);
    setAuthNeeded(false);
    setStep(3);
    setProgress(null);
    setElapsed(0);
    setShowDetails(false);
    setProgressMsg('Job wird gestartet …');
    const selectedPlain: Record<string, string[]> = {};
    for (const [subcat, set] of Object.entries(selected)) {
      if (set.size > 0) selectedPlain[subcat] = [...set];
    }
    try {
      await saveSelection(site.session_id, selectedPlain, notes);
      const jobId = await startGeneration({
        lat: site.lat,
        lng: site.lng,
        category: site.category,
        address: site.address,
        session_id: site.session_id,
        gemeinde_name: site.gemeinde_name,
        rs_key: site.rs_key,
        ags: site.ags,
        nuts3: site.nuts3,
        meeting_notes: notes,
      });
      await poll(jobId);
    } catch (e) {
      handleError(e);
      setLoading(false);
      if (!(e instanceof QuotaExceededError)) setStep(2);
    }
  }

  async function upgrade() {
    try {
      const res = await fetch(`${GATEWAY_BASE}/billing/checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          product_slug: 'standortiq',
          success_url: `${location.origin}${location.pathname}?paid=1`,
          cancel_url: location.href,
        }),
      });
      if (!res.ok) throw new Error(`Fehler ${res.status}`);
      const d = await res.json();
      location.href = d.checkout_url ?? d.url;
    } catch {
      setError('Checkout konnte nicht gestartet werden. Bitte über „Jetzt kaufen" oben fortfahren.');
    }
  }

  function reset() {
    setStep(0);
    setError(null);
    setPaywall(null);
    setLoading(false);
    setAddress('');
    setSite(null);
    setSelected({});
    setNotes('');
    setResult(null);
    setProgressMsg('');
    setProgress(null);
    setElapsed(0);
    setShowDetails(false);
  }

  // ── Auth gate ───────────────────────────────────────────────────────────
  if (authed === null) {
    return <div class="text-sm text-[#6B6B8A] animate-pulse">lädt …</div>;
  }
  if (!authed) {
    return (
      <div class="rounded-xl border border-[#005F73]/15 bg-white p-8 text-center shadow-sm">
        <h3 class="text-lg font-bold text-[#1A1A2E]">Standortanalyse starten</h3>
        <p class="mx-auto mt-2 max-w-md text-sm text-[#6B6B8A]">
          Melden Sie sich mit Ihrem Pommer-Konto an. Die ersten <strong>3 Analysen sind
          kostenlos</strong> — danach im Abo.
        </p>
        <button
          type="button"
          onClick={doLogin}
          class="mt-5 rounded-md bg-[#005F73] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#003845]"
        >
          Registrieren / Anmelden
        </button>
        {loginError && <p class="mx-auto mt-3 max-w-md text-xs text-red-600">{loginError}</p>}
      </div>
    );
  }

  // ── Paywall ─────────────────────────────────────────────────────────────
  if (paywall) {
    return (
      <div class="rounded-xl border border-[#E96C00]/20 bg-white p-8 text-center shadow-sm">
        <h3 class="text-lg font-bold text-[#1A1A2E]">Kostenlose Analysen aufgebraucht</h3>
        <p class="mx-auto mt-2 max-w-md text-sm text-[#6B6B8A]">
          Sie haben Ihre {paywall.free} kostenlosen Analysen genutzt. Schalten Sie StandortIQ
          frei, um unbegrenzt weitere Reports zu generieren.
        </p>
        <button
          type="button"
          onClick={upgrade}
          class="mt-5 rounded-md bg-[#E96C00] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#cc5e00]"
        >
          Jetzt freischalten
        </button>
        {error && <p class="mt-3 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  // ── Wizard ────────────────────────────────────────────────────────────────
  const inputCls =
    'w-full rounded-lg border border-[#E0E0EA] px-3 py-2 text-sm outline-none focus:border-[#005F73]';
  const primaryBtn =
    'rounded-md bg-[#005F73] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#003845] disabled:opacity-50 disabled:cursor-not-allowed';
  const ghostBtn =
    'rounded-md border border-[#005F73] px-5 py-2.5 text-sm font-semibold text-[#005F73] transition-colors hover:bg-[#005F73]/5';

  return (
    <div class="rounded-xl border border-[#005F73]/15 bg-white p-6 shadow-sm">
      {authNeeded && (
        <div class="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Anmeldung erforderlich oder der Analyse-Dienst ist noch nicht freigeschaltet.
          <button type="button" onClick={doLogin} class="ml-2 font-semibold underline">
            Neu anmelden
          </button>
          {loginError && <p class="mt-2 text-xs text-red-700">{loginError}</p>}
        </div>
      )}
      {/* Stepper */}
      <ol class="mb-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs">
        {STEPS.map((label, i) => {
          const state = i < step ? 'done' : i === step ? 'active' : 'todo';
          return (
            <li class="flex items-center gap-2">
              <span
                class={
                  'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ' +
                  (state === 'active'
                    ? 'bg-[#005F73] text-white'
                    : state === 'done'
                      ? 'bg-[#16BAE7] text-white'
                      : 'bg-[#F4F4F8] text-[#6B6B8A]')
                }
              >
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span class={state === 'todo' ? 'text-[#B0B0C0]' : 'text-[#1A1A2E]'}>{label}</span>
              {i < STEPS.length - 1 && <span class="text-[#D0D0DC]">→</span>}
            </li>
          );
        })}
      </ol>

      {error && step !== 3 && (
        <div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Step 0 — Address */}
      {step === 0 && (
        <div>
          <h3 class="mb-1 text-lg font-bold text-[#1A1A2E]">Standort &amp; Betriebstyp</h3>
          <p class="mb-5 text-xs text-[#6B6B8A]">
            Adresse des geplanten Standorts und die Betriebskategorie.
          </p>
          <label class="mb-1 block text-sm font-medium text-[#1A1A2E]">Adresse</label>
          <input
            type="text"
            value={address}
            onInput={(e) => setAddress((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePrepare()}
            placeholder="z. B. Marktplatz 1, 92331 Parsberg"
            class={`${inputCls} mb-4`}
          />
          <label class="mb-1 block text-sm font-medium text-[#1A1A2E]">Kategorie</label>
          <select
            value={category}
            onChange={(e) => setCategory((e.target as HTMLSelectElement).value)}
            class={`${inputCls} mb-4`}
          >
            {CATEGORIES.map((c) => (
              <option value={c.value}>{c.label}</option>
            ))}
          </select>

          {sections && sections.length > 0 && (
            <div class="mb-6 rounded-lg border border-[#005F73]/15 bg-[#F4F4F8] p-4">
              <p class="mb-2 text-xs font-semibold text-[#1A1A2E]">
                Dieser Report enthält {sections.length} Abschnitte:
              </p>
              <div class="flex flex-wrap gap-1.5">
                {sections.map((s) => (
                  <span class="rounded bg-white px-2 py-0.5 text-[11px] text-[#005F73] ring-1 ring-[#005F73]/15">
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button type="button" onClick={handlePrepare} disabled={loading || !address.trim()} class={primaryBtn}>
            {loading ? 'Suche Standortdaten …' : 'Weiter'}
          </button>
        </div>
      )}

      {/* Step 1 — Competitors */}
      {step === 1 && site && (
        <div>
          <h3 class="mb-1 text-lg font-bold text-[#1A1A2E]">Wettbewerber auswählen</h3>
          <p class="mb-5 text-xs text-[#6B6B8A]">
            {site.gemeinde_name || site.address} — relevante Betriebe markieren (Standard: Top 5 je Gruppe).
          </p>
          <div class="space-y-5">
            {Object.entries(site.competitors).map(([subcat, comps]) => {
              if (comps.length === 0) return null;
              const names = comps.map((c) => c.name);
              return (
                <div>
                  <div class="mb-2 flex items-center justify-between rounded-md bg-[#F4F4F8] px-3 py-1.5">
                    <span class="text-sm font-semibold text-[#005F73]">
                      {prettySubcat(subcat)} ({comps.length})
                    </span>
                    <span class="text-xs">
                      <button type="button" class="text-[#005F73] hover:underline" onClick={() => setGroup(subcat, names, true)}>
                        Alle
                      </button>
                      {' · '}
                      <button type="button" class="text-[#005F73] hover:underline" onClick={() => setGroup(subcat, names, false)}>
                        Keine
                      </button>
                    </span>
                  </div>
                  <ul class="divide-y divide-[#F0F0F4]">
                    {comps.map((c) => (
                      <li class="flex items-center gap-3 px-2 py-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={selected[subcat]?.has(c.name) ?? false}
                          onChange={() => toggle(subcat, c.name)}
                          class="h-4 w-4 accent-[#16BAE7]"
                        />
                        <span class="flex-1 text-[#1A1A2E]">{c.name}</span>
                        {c.rating != null && (
                          <span class="whitespace-nowrap text-[#E96C00]">
                            ★ {c.rating.toFixed(1)}
                            {c.rating_count ? ` (${c.rating_count})` : ''}
                          </span>
                        )}
                        <span class="text-[11px] text-[#B0B0C0]">{c.source}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <div class="mt-6 flex gap-3">
            <button type="button" class={ghostBtn} onClick={() => setStep(0)}>
              Zurück
            </button>
            <button type="button" class={primaryBtn} onClick={() => setStep(2)}>
              Weiter
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Notes */}
      {step === 2 && (
        <div>
          <h3 class="mb-1 text-lg font-bold text-[#1A1A2E]">Vor-Ort-Notizen</h3>
          <p class="mb-5 text-xs text-[#6B6B8A]">
            Optionale Eindrücke vom Ortstermin — fließen direkt in die Bewertung ein.
          </p>
          <textarea
            value={notes}
            onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
            rows={9}
            placeholder="z. B. Lage am Ortsrand, gute Sichtbarkeit von der B8, Parkplatzsituation, baulicher Zustand …"
            class={`${inputCls} mb-6`}
          />
          <div class="flex gap-3">
            <button type="button" class={ghostBtn} onClick={() => setStep(1)}>
              Zurück
            </button>
            <button type="button" class={primaryBtn} onClick={handleGenerate}>
              Report generieren
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Result */}
      {step === 3 && (
        <div>
          <h3 class="mb-4 text-lg font-bold text-[#1A1A2E]">Report</h3>
          {loading && (
            <div>
              <div class="mb-2 flex items-center gap-3 text-sm text-[#1A1A2E]">
                <span class="h-4 w-4 animate-spin rounded-full border-2 border-[#005F73] border-t-transparent" />
                <span class="font-medium">{progress?.label || 'Report wird generiert …'}</span>
                {progress && (
                  <span class="text-xs text-[#6B6B8A]">
                    {progress.pct}%{elapsed > 0 ? ` · ${elapsed}s` : ''}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div class="h-2 w-full overflow-hidden rounded-full bg-[#F4F4F8]">
                <div
                  class="h-full rounded-full bg-[#16BAE7] transition-[width] duration-500"
                  style={{ width: `${Math.max(3, progress?.pct ?? 3)}%` }}
                />
              </div>

              <div class="mt-2 flex items-center justify-between text-xs text-[#6B6B8A]">
                <span>{progress?.detail || progressMsg || 'läuft …'}</span>
                {progress && progress.steps.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowDetails((v) => !v)}
                    class="font-medium text-[#005F73] hover:underline"
                  >
                    {showDetails ? 'Details ausblenden' : 'Details anzeigen'}
                  </button>
                )}
              </div>

              {showDetails && progress && progress.steps.length > 0 && (
                <ol class="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[#E0E0EA] bg-[#FAFAFC] p-3 text-xs">
                  {progress.steps.map((s, i) => {
                    // Each entry is a completed milestone (✓). Show the time
                    // THIS step took (delta from the previous milestone) on its
                    // own line — the absolute clock made the duration look like
                    // it belonged to the next line. Latest one is just colour-
                    // highlighted; "what's running now" lives in the bar above.
                    const prev = i > 0 ? progress.steps[i - 1].t : 0;
                    const dur = Math.max(0, s.t - prev);
                    const latest = i === progress.steps.length - 1;
                    return (
                      <li class="flex items-baseline gap-2">
                        <span class="w-9 shrink-0 text-right tabular-nums text-[#B0B0C0]">
                          {dur >= 1 ? `${dur.toFixed(0)}s` : ''}
                        </span>
                        <span class={latest ? 'text-[#005F73]' : 'text-[#6B6B8A]'}>✓ {s.msg}</span>
                      </li>
                    );
                  })}
                </ol>
              )}

              <p class="mt-3 text-xs text-[#B0B0C0]">
                Die Generierung umfasst Datenabruf, KI-Texte, Layout und Qualitätsprüfung —
                das dauert i. d. R. einige Minuten.
              </p>
            </div>
          )}
          {error && (
            <div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
          {result && (
            <div>
              <div class="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                Report fertig — {result.profile_label}.
              </div>
              <div class="flex flex-col gap-3 sm:flex-row">
                {result.download_url && (
                  <a href={result.download_url} class="rounded-md bg-[#005F73] px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-[#003845]">
                    Report (.docx) herunterladen
                  </a>
                )}
                {result.judged_download_url && (
                  <a href={result.judged_download_url} class="rounded-md border border-[#005F73] px-5 py-2.5 text-center text-sm font-semibold text-[#005F73] hover:bg-[#005F73]/5">
                    Korrigierte Fassung (.docx)
                  </a>
                )}
              </div>
              <p class="mt-4 text-xs text-[#B0B0C0]">Download-Links sind 72 Stunden gültig.</p>
            </div>
          )}
          {!loading && (
            <div class="mt-6">
              <button type="button" class={ghostBtn} onClick={reset}>
                Neue Analyse starten
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
