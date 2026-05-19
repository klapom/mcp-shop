import { useState, useEffect } from 'preact/hooks';
import AccountForm from './AccountForm';
import PersonaSelect from './PersonaSelect';
import FileUpload from './FileUpload';
import HelgaChat from './HelgaChat';
import AuditReport from './AuditReport';
import AvatarPersonalize from './AvatarPersonalize';
import ReviewActivate from './ReviewActivate';
import type { AuditReport as AuditReportType } from '../../lib/wizard-state';
import { saveState } from '../../lib/wizard-state';

const STEPS = [
  { label: 'Account anlegen', short: 'Account' },
  { label: 'Personas wählen', short: 'Personas' },
  { label: 'Dokumente', short: 'Dokumente' },
  { label: 'Wissens-Audit', short: 'Audit' },
  { label: 'Audit-Report', short: 'Report' },
  { label: 'Personalisierung', short: 'Avatar' },
  { label: 'Aktivierung', short: 'Aktivierung' },
];

function getInitialStep(): number {
  if (typeof window === 'undefined') return 0;
  const params = new URLSearchParams(window.location.search);
  const step = parseInt(params.get('step') ?? '0', 10);
  return isNaN(step) || step < 0 || step >= STEPS.length ? 0 : step;
}

function setStepInUrl(step: number) {
  const url = new URL(window.location.href);
  url.searchParams.set('step', String(step));
  window.history.replaceState({}, '', url.toString());
}

export default function OnboardingWizard() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(getInitialStep());
  }, []);

  function goTo(n: number) {
    setStep(n);
    setStepInUrl(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function next() { goTo(step + 1); }
  function back() { goTo(Math.max(0, step - 1)); }

  function handleAuditDone(report: AuditReportType) {
    saveState({ audit: report });
    goTo(4);
  }

  return (
    <div class="min-h-screen bg-[#0d0d1a] text-white flex flex-col">
      {/* Header */}
      <header class="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <a href="/" class="flex items-center gap-2">
          <img src="/logo-dark-transparent.svg" alt="Pommer" class="h-8" />
        </a>
        <span class="text-sm text-gray-500">Customer Onboarding</span>
      </header>

      <div class="flex flex-1">
        {/* Sidebar */}
        <aside class="hidden md:flex flex-col w-64 border-r border-white/10 p-6 gap-2 flex-shrink-0">
          <p class="text-xs text-gray-500 uppercase tracking-wider mb-2 font-semibold">Schritte</p>
          {STEPS.map((s, i) => {
            const isActive = i === step;
            const isDone = i < step;
            return (
              <button
                key={i}
                type="button"
                onClick={() => isDone ? goTo(i) : undefined}
                disabled={!isDone && !isActive}
                class={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-left transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white font-medium'
                    : isDone
                    ? 'text-gray-400 hover:bg-white/5 cursor-pointer'
                    : 'text-gray-600 cursor-default'
                }`}
              >
                <span
                  class={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    isActive
                      ? 'bg-white text-indigo-600'
                      : isDone
                      ? 'bg-green-500 text-white'
                      : 'bg-white/10 text-gray-500'
                  }`}
                >
                  {isDone ? '✓' : i}
                </span>
                {s.label}
              </button>
            );
          })}
        </aside>

        {/* Mobile step indicator */}
        <div class="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900/95 border-t border-white/10 px-4 py-2 flex gap-1 z-40">
          {STEPS.map((s, i) => (
            <div
              key={i}
              class={`flex-1 h-1 rounded-full ${
                i === step ? 'bg-indigo-500' : i < step ? 'bg-green-500' : 'bg-white/10'
              }`}
              title={s.short}
            />
          ))}
        </div>

        {/* Main content */}
        <main class="flex-1 p-6 md:p-10 pb-20 md:pb-10 max-w-4xl">
          {step === 0 && <AccountForm onNext={next} />}
          {step === 1 && <PersonaSelect onNext={next} onBack={back} />}
          {step === 2 && <FileUpload onNext={next} onBack={back} />}
          {step === 3 && <HelgaChat onNext={handleAuditDone} onBack={back} />}
          {step === 4 && <AuditReport onNext={next} onBack={back} />}
          {step === 5 && <AvatarPersonalize onNext={next} onBack={back} />}
          {step === 6 && <ReviewActivate onBack={back} />}
        </main>
      </div>
    </div>
  );
}
