/**
 * In-browser OAuth 2.1 (Authorization Code + PKCE) client for the mcp-gateway.
 *
 * The shop is static — it holds no client secret. It runs the public PKCE flow
 * entirely in the browser: redirect to the gateway's /authorize → WorkOS
 * AuthKit login → gateway redirects back to /auth/callback with a code → we
 * exchange it at POST /token for a JWT, which the approvals UI then sends as a
 * Bearer to the gateway approvals BFF.
 *
 * The JWT carries the tenant_id; the gateway BFF derives X-Pommer-Tenant-Id
 * from it. Token is kept in localStorage (no refresh handling yet — on 401 the
 * UI re-initiates login).
 */

// Defaults target staging while the BFF lives on staging-mcp. Override via
// PUBLIC_GATEWAY_URL / PUBLIC_GATEWAY_CLIENT_ID once it ships to the prod gateway.
export const GATEWAY_BASE: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_GATEWAY_URL) ||
  'https://staging-mcp.pommerconsulting.de';

const CLIENT_ID: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_GATEWAY_CLIENT_ID) ||
  'Z1oL7KIihUxtk7n83VCQEpKBPENlGInvoJsaoIG6fHo';

const TOKEN_KEY = 'pommer_gw_token';
const REFRESH_KEY = 'pommer_gw_refresh';
const EXP_KEY = 'pommer_gw_exp'; // access-token expiry, epoch ms
const VERIFIER_KEY = 'pommer_gw_pkce_verifier';
const STATE_KEY = 'pommer_gw_oauth_state';
const RETURN_KEY = 'pommer_gw_return_to';

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
}

function redirectUri(): string {
  return `${location.origin}/auth/callback`;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(EXP_KEY);
}

export function authHeader(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ── Token refresh ────────────────────────────────────────────────────────────
// The gateway access token lives only 15 min; a report run (wizard + minutes of
// generation) easily outlives it, so polling would 401 mid-flight. We persist
// the refresh token (30-day TTL) and silently mint a new access token. Refresh
// tokens ROTATE on use and reuse revokes the whole family, so refreshes must be
// single-flight — concurrent callers share one in-flight promise.

function storeTokens(accessToken: string, refreshToken?: string, expiresIn?: number): void {
  localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  if (expiresIn) localStorage.setItem(EXP_KEY, String(Date.now() + expiresIn * 1000));
}

/** Seconds until the access token expires, or null if unknown. */
export function tokenSecondsLeft(): number | null {
  const exp = localStorage.getItem(EXP_KEY);
  if (!exp) return null;
  return Math.round((Number(exp) - Date.now()) / 1000);
}

let refreshInFlight: Promise<boolean> | null = null;

/** Mint a fresh access token from the stored refresh token. Returns false (and
 *  clears the session) if no refresh token / the gateway rejects it. */
export async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const doRefresh = async (): Promise<boolean> => {
    const rt = localStorage.getItem(REFRESH_KEY);
    if (!rt) return false;
    try {
      const res = await fetch(`${GATEWAY_BASE}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: rt,
          client_id: CLIENT_ID,
        }),
      });
      if (!res.ok) {
        // invalid_grant (expired/revoked/reused) → session is unrecoverable.
        if (res.status === 400 || res.status === 401) logout();
        return false;
      }
      const d = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      if (!d.access_token) return false;
      storeTokens(d.access_token, d.refresh_token, d.expires_in);
      return true;
    } catch {
      return false; // network blip — keep the (stale) token, caller may retry
    }
  };
  refreshInFlight = doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Ensure a usable access token, refreshing proactively when it is about to
 *  expire (default < 90 s left). Returns true if a token should now be valid. */
export async function ensureFreshToken(minSecondsLeft = 90): Promise<boolean> {
  if (!getToken()) return false;
  const left = tokenSecondsLeft();
  if (left !== null && left < minSecondsLeft) return refreshAccessToken();
  return true;
}

/** Begin the PKCE login. Redirects the browser; `returnTo` is restored after. */
export async function startLogin(returnTo?: string): Promise<void> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(40)));
  const challenge = b64url(await sha256(verifier));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(RETURN_KEY, returnTo ?? location.pathname + location.search);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: 'mcp',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  location.href = `${GATEWAY_BASE}/authorize?${params}`;
}

export interface CallbackResult {
  ok: boolean;
  error?: string;
  returnTo: string;
}

/** Run on /auth/callback: validate state, exchange the code, store the JWT. */
export async function handleCallback(): Promise<CallbackResult> {
  const url = new URL(location.href);
  const returnTo = sessionStorage.getItem(RETURN_KEY) || '/';
  const err = url.searchParams.get('error');
  if (err) return { ok: false, error: err, returnTo };
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) return { ok: false, error: 'missing_code', returnTo };
  if (!state || state !== sessionStorage.getItem(STATE_KEY)) {
    return { ok: false, error: 'state_mismatch', returnTo };
  }
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) return { ok: false, error: 'missing_verifier', returnTo };

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
    client_id: CLIENT_ID,
  });
  const res = await fetch(`${GATEWAY_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    return { ok: false, error: `token_exchange_${res.status}`, returnTo };
  }
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) return { ok: false, error: 'no_access_token', returnTo };

  storeTokens(data.access_token, data.refresh_token, data.expires_in);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  return { ok: true, returnTo };
}
