/**
 * MarkdownText — minimal, XSS-safe Markdown renderer for untrusted persona output.
 *
 * Builds Preact vnodes only (never innerHTML): raw HTML in the source is shown literally as
 * text. Supported: headings, paragraphs, bullet/numbered lists, fenced code, bold, italic,
 * inline code and [text](https://…) links (only http/https/mailto; else plain text).
 * Images are not rendered.
 */

import type { ComponentChildren } from 'preact';

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\))/g;
const SAFE_URL = /^(https?:\/\/|mailto:)/i;

function inline(text: string): ComponentChildren[] {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return (
        <code key={i} class="rounded bg-black/30 px-1 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (m) {
      return SAFE_URL.test(m[2]) ? (
        <a key={i} href={m[2]} target="_blank" rel="noopener noreferrer" class="text-sky-300 underline">
          {m[1]}
        </a>
      ) : (
        <span key={i}>{part}</span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function MarkdownText({ source, testId }: { source: string; testId?: string }) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out: ComponentChildren[] = [];
  let i = 0;
  let k = 0;
  const startsBlock = (l: string) => /^(#{1,6}\s|\s*[-*]\s|\s*\d+\.\s|```)/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (line.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      out.push(
        <pre key={k++} class="overflow-auto rounded bg-black/30 p-3 font-mono text-xs whitespace-pre-wrap">
          {buf.join('\n')}
        </pre>,
      );
    } else if (/^#{1,6}\s/.test(line)) {
      const level = /^#+/.exec(line)![0].length;
      const cls = level <= 2 ? 'mt-4 text-lg font-semibold text-white' : 'mt-3 text-sm font-semibold text-white/90';
      out.push(
        <div key={k++} role="heading" aria-level={level} class={cls}>
          {inline(line.replace(/^#+\s+/, ''))}
        </div>,
      );
      i++;
    } else if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      const li = items.map((t, j) => <li key={j}>{inline(t)}</li>);
      out.push(
        ordered ? (
          <ol key={k++} class="list-decimal pl-5">
            {li}
          </ol>
        ) : (
          <ul key={k++} class="list-disc pl-5">
            {li}
          </ul>
        ),
      );
    } else {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) buf.push(lines[i++]);
      if (!buf.length) buf.push(lines[i++]);
      out.push(
        <p key={k++} class="whitespace-pre-wrap break-words">
          {inline(buf.join('\n'))}
        </p>,
      );
    }
  }
  return (
    <div class="space-y-2 text-sm text-white/80" data-testid={testId}>
      {out}
    </div>
  );
}
