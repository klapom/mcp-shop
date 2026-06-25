/** Reusable horizontal tab bar for the admin editor. */
import type { ComponentChildren } from 'preact';

export type Tab =
  | 'identity'
  | 'coupling'
  | 'behavior'
  | 'approval'
  | 'knowledge'
  | 'avatar'
  | 'stream'
  | 'history';

const TAB_LABELS: Record<Tab, string> = {
  identity: 'Identität',
  coupling: 'Skills & MCPs',
  behavior: 'Verhalten',
  approval: 'Approval-Policies',
  knowledge: 'Wissen',
  avatar: 'Bild',
  stream: 'Stream',
  history: 'Verlauf',
};

interface Props {
  active: Tab;
  onChange: (t: Tab) => void;
}

export function TabBar({ active, onChange }: Props) {
  return (
    <div class="flex border-b border-white/10 overflow-x-auto text-sm">
      {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          class={`shrink-0 px-4 py-2.5 font-medium transition-colors whitespace-nowrap ${
            active === t
              ? 'bg-white/10 text-white border-b-2 border-[#E96C00]'
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          {TAB_LABELS[t]}
        </button>
      ))}
    </div>
  );
}
