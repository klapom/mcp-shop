import { useState } from 'preact/hooks';
import { NACE_SECTIONS } from '../../lib/nace';
import { saveState } from '../../lib/wizard-state';
import { createTenant } from '../../lib/api';

interface Props {
  onNext: () => void;
}

export default function AccountForm({ onNext }: Props) {
  const [company, setCompany] = useState('');
  const [branche, setBranche] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!company.trim() || !branche) return;
    setLoading(true);
    setError(null);
    try {
      const tenant = await createTenant(company.trim(), branche);
      localStorage.setItem('pommer_tenant_token', tenant.bearer_token);
      localStorage.setItem('pommer_tenant_id', tenant.id);
      saveState({
        tenantId: tenant.id,
        token: tenant.bearer_token,
        company: company.trim(),
        branche,
      });
      onNext();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 class="text-2xl font-bold text-white mb-2">Account anlegen</h2>
      <p class="text-gray-400 mb-8">Starten Sie Ihr Pommer Agent Onboarding.</p>

      <form onSubmit={handleSubmit} class="space-y-6 max-w-md">
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1" for="company">
            Firmenname
          </label>
          <input
            id="company"
            type="text"
            required
            value={company}
            onInput={(e) => setCompany((e.target as HTMLInputElement).value)}
            placeholder="Muster GmbH"
            class="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1" for="branche">
            Branche (NACE)
          </label>
          <select
            id="branche"
            required
            value={branche}
            onChange={(e) => setBranche((e.target as HTMLSelectElement).value)}
            class="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="" disabled>Branche wählen …</option>
            {NACE_SECTIONS.map((s) => (
              <option key={s.code} value={s.code} class="bg-gray-900">
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div class="rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !company.trim() || !branche}
          class="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 font-semibold text-white transition-colors"
        >
          {loading ? 'Account wird angelegt …' : 'Account anlegen & weiter'}
        </button>
      </form>
    </div>
  );
}
