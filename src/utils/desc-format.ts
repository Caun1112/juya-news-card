import katex from 'katex';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Converts markdown-style inline emphasis to a safe HTML subset:
 * - `code` -> <code>...</code>
 * - **bold** -> <strong>...</strong>
 * - line breaks -> <br/>
 * - $$math$$ -> block math
 * - $math$ -> inline math
 * Also supports legacy <strong>/<code>/<br> input for backward compatibility.
 */
export function sanitizeDescHtml(input: unknown): string {
  const raw = typeof input === 'string' ? input : '';
  let markdownized = raw
    .replaceAll(/<\s*br\s*\/?\s*>/gi, '\n')
    .replaceAll(/<\s*\/?\s*strong\s*>/gi, '**')
    .replaceAll(/<\s*\/?\s*code\s*>/gi, '`');

  const codePlaceholders: string[] = [];

  // 1. Extract block math
  markdownized = markdownized.replaceAll(/\$\$([\s\S]+?)\$\$/g, (_m, math) => {
    try {
      const html = katex.renderToString(math, { displayMode: true, throwOnError: false });
      const idx = codePlaceholders.push(html) - 1;
      return `@@CODE_${idx}@@`;
    } catch (e) {
      return _m;
    }
  });

  // 2. Extract inline math
  markdownized = markdownized.replaceAll(/\$([^$\n]+?)\$/g, (_m, math) => {
    try {
      const html = katex.renderToString(math, { displayMode: false, throwOnError: false });
      const idx = codePlaceholders.push(html) - 1;
      return `@@CODE_${idx}@@`;
    } catch (e) {
      return _m;
    }
  });

  const escaped = escapeHtml(markdownized).replaceAll('\r\n', '\n').replaceAll('\r', '\n');

  let out = escaped.replaceAll(/`([^`\n]+?)`/g, (_m, g1: string) => {
    const idx = codePlaceholders.push(`<code>${g1}</code>`) - 1;
    return `@@CODE_${idx}@@`;
  });
  out = out.replaceAll(/\*\*([^\n*][^\n]*?)\*\*/g, '<strong>$1</strong>');
  out = out.replaceAll('\n', '<br/>');
  out = out.replaceAll(/@@CODE_(\d+)@@/g, (match, g1: string) => {
    const idx = Number(g1);
    return Number.isInteger(idx) && codePlaceholders[idx] ? codePlaceholders[idx] : match;
  });
  return out;
}
