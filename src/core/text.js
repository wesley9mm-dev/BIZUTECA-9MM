'use strict';
// Normaliza: minúsculas e sem acentos (para comparar e para o índice).
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Separa em tokens alfanuméricos já normalizados.
const tokens = (s) => norm(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);

const {decodeHTMLStrict}=require('entities');

function htmlToText(html) {
  const text=String(html ?? '')
    .replace(/<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'')
    .replace(/<\/(?:td|th)\s*>/gi,' ')
    .replace(/<hr\b[^>]*>/gi,'\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g,'\n');
  return decodeHTMLStrict(text).replace(/[☐☑]/g,' ').replace(/\u00a0/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}

function levenshtein(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

module.exports = { norm, tokens, htmlToText, levenshtein };
