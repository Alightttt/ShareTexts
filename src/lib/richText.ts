import React from 'react';
import { sanitizeUrl } from './utils';

/**
 * A deliberately small formatting subset for room messages.
 *
 * Why markdown-in-plain-text instead of contenteditable HTML:
 *
 *   · The wire protocol does not change. A message is still a string, so this
 *     works between app versions, between a phone and a laptop, and in the
 *     Temporary Space (which stores text as text).
 *   · Nothing is ever rendered as HTML. Every node below is a React element
 *     from an allowlist (strong/em/code/s/a/ul/li) — there is no
 *     dangerouslySetInnerHTML anywhere in this path, so a message cannot
 *     inject markup, a script, or an event handler.
 *   · URLs go through the same sanitizeUrl() the rest of the app uses, so
 *     only http/https links become anchors.
 *
 * The subset: **bold**, *italic*, `code`, ~~strike~~, [text](https://url),
 * and "- " bullet lines. Deliberately NOT supported: underscores as emphasis
 * (they live in snake_case and filenames), inline HTML, images, tables —
 * features that would either surprise a reader or need a real editor.
 *
 * Emphasis only counts when the marked span is tight against its markers
 * (no space after the opener or before the closer). That single rule is what
 * keeps "2 * 3 * 4" and "a ** b ** c" reading as plain arithmetic instead of
 * an accidental italic — the most common way a "smart" chat renderer becomes
 * an annoying one.
 */

export type FormatKind = 'bold' | 'italic' | 'code' | 'list';

const MARKERS: Record<Exclude<FormatKind, 'list'>, string> = {
  bold: '**',
  italic: '*',
  code: '`',
};

/** Does this text contain anything the renderer would change? */
export function hasRichMarkup(text: string): boolean {
  if (!text) return false;
  return /\*\*|~~|`|\[[^\]\n]+\]\(|(^|\n)\s*[-•]\s+|\*(?=\S)[^*\n]*\S\*/.test(text);
}

type Node = React.ReactNode;

const INLINE = /\*\*([\s\S]+?)\*\*|~~([\s\S]+?)~~|\*([^*\n]+?)\*|`([^`\n]+?)`|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** Can a marked span legitimately be emphasis? (Tight against its markers.) */
function tight(inner: string | undefined): boolean {
  if (!inner) return false;
  return !/^\s/.test(inner) && !/\s$/.test(inner);
}

function renderInline(text: string, keyBase: string, out: Node[]) {
  let last = 0;
  let n = 0;
  INLINE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE.exec(text)) !== null) {
    const [full, bold, strike, italic, code, label, href] = m;
    const isBold = bold !== undefined;
    const isStrike = strike !== undefined;
    const isItalic = italic !== undefined;
    const isCode = code !== undefined;
    const isLink = label !== undefined && href !== undefined;

    let node: Node = null;
    if (isBold && tight(bold)) node = React.createElement('strong', { className: 'font-semibold' }, bold);
    else if (isStrike && tight(strike)) node = React.createElement('s', { className: 'opacity-70' }, strike);
    else if (isItalic && tight(italic)) node = React.createElement('em', null, italic);
    else if (isCode && code.length > 0) {
      node = React.createElement(
        'code',
        { className: 'rounded-[5px] bg-black/[0.07] px-1 py-[1px] font-mono text-[0.92em] dark:bg-white/[0.12]' },
        code,
      );
    } else if (isLink) {
      const safe = sanitizeUrl(href);
      if (safe) {
        node = React.createElement(
          'a',
          {
            key: `${keyBase}-${n}`,
            href: safe,
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'underline decoration-1 underline-offset-2 hover:text-ember dark:hover:text-[#fb9243]',
          },
          label,
        );
      }
    }

    if (node !== null) {
      if (m.index > last) out.push(text.slice(last, m.index));
      out.push(node);
      last = m.index + full.length;
      n += 1;
    }
    // A match that failed the tightness test is left in place as literal
    // text: we simply do not advance, so the substring is emitted as-is.
  }
  if (last < text.length) out.push(text.slice(last));
}

/**
 * Render a message body. Plain text (the common case) is returned as-is, so
 * nothing about an ordinary message changes.
 */
export function renderRichText(text: string, keyBase = 'rt'): Node {
  if (!text || !hasRichMarkup(text)) return text;

  const lines = text.split('\n');
  const out: Node[] = [];
  let bullets: string[] = [];

  const flushBullets = (idx: number) => {
    if (bullets.length === 0) return;
    out.push(
      React.createElement(
        'ul',
        { key: `${keyBase}-ul-${idx}`, className: 'my-1 list-disc pl-5' },
        bullets.map((b, i) => React.createElement('li', { key: i }, b)),
      ),
    );
    bullets = [];
  };

  lines.forEach((line, i) => {
    const bullet = line.match(/^\s*[-•]\s+(.*)$/);
    if (bullet) {
      const inner: Node[] = [];
      renderInline(bullet[1], `${keyBase}-b${i}`, inner);
      bullets.push(...inner.map((n, k) => (typeof n === 'string' ? n : React.createElement(React.Fragment, { key: k }, n))));
      return;
    }
    flushBullets(i);
    const nodes: Node[] = [];
    renderInline(line, `${keyBase}-l${i}`, nodes);
    out.push(...nodes);
    // Lines keep their newline so the bubble's whitespace-pre-wrap still
    // controls the rhythm; the last line does not need one.
    if (i < lines.length - 1) out.push('\n');
  });
  flushBullets(lines.length);

  return out;
}

/* ────────────────────────────────────────────────────────────────────────
   Composer helpers — operate on the textarea's own value + selection, so the
   editor stays a plain textarea (native undo, native autocorrect, native
   paste) and formatting is just text it can insert.
   ──────────────────────────────────────────────────────────────────────── */

export type Edit = { value: string; selStart: number; selEnd: number };

function wrap(value: string, start: number, end: number, marker: string): Edit {
  const before = value.slice(0, start);
  const sel = value.slice(start, end);
  const after = value.slice(end);
  const m = marker.length;

  // Already formatted? Take it off — the same button toggles, which is what
  // people expect from a B button.
  const outer = value.slice(Math.max(0, start - m), start) === marker && value.slice(end, end + m) === marker;
  if (sel && outer) {
    return {
      value: value.slice(0, start - m) + sel + value.slice(end + m),
      selStart: start - m,
      selEnd: end - m,
    };
  }
  const current = value.slice(start, end);
  const retyped = current.match(new RegExp(`^\\${marker}([\\s\\S]+)\\${marker}$`));
  if (sel && retyped) {
    return {
      value: before + retyped[1] + after,
      selStart: start,
      selEnd: start + retyped[1].length,
    };
  }

  if (!sel) {
    const next = before + marker + marker + after;
    return { value: next, selStart: start + m, selEnd: start + m };
  }
  return {
    value: before + marker + sel + marker + after,
    selStart: start + m,
    selEnd: end + m,
  };
}

function bulletLines(value: string, start: number, end: number): Edit {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndIdx = value.indexOf('\n', end);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const block = value.slice(lineStart, lineEnd);
  const rows = block.split('\n');
  const allBulleted = rows.every((r) => r.trimStart().startsWith('- '));

  const next = rows
    .map((r) => {
      if (!r.trim()) return r;
      if (allBulleted) return r.replace(/^(\s*)- /, '$1');
      if (r.trimStart().startsWith('- ')) return r;
      return r.replace(/^(\s*)/, '$1- ');
    })
    .join('\n');

  const nextValue = value.slice(0, lineStart) + next + value.slice(lineEnd);
  return { value: nextValue, selStart: lineStart, selEnd: lineStart + next.length };
}

/** Apply a formatting button to the composer's value + selection. */
export function applyFormat(
  value: string,
  start: number,
  end: number,
  kind: FormatKind,
): Edit {
  if (kind === 'list') return bulletLines(value, start, end);
  return wrap(value, start, end, MARKERS[kind]);
}
