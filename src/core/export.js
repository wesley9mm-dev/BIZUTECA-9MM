'use strict';

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const {sanitizeMaterial:sanitizeExportHtml}=require('./sanitize');

function makeHtmlExport(notes) {
  if (!Array.isArray(notes) || !notes.length || notes.length > 10000) throw new Error('Selecione entre 1 e 10.000 anotações para exportar.');
  const body = notes.map((note) => `<article><h1>${escapeHtml(note.title)}</h1>${sanitizeExportHtml(note.contentHtml)}</article>`).join('\n');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>Exportação — Bizuteca 9MM</title><style>body{max-width:900px;margin:40px auto;padding:0 22px;font:16px/1.65 system-ui,sans-serif;color:#202820}article{margin:0 0 48px;padding:0 0 32px;border-bottom:1px solid #ccd2cc}h1{font-size:1.6em;border-bottom:2px solid #697c59;padding-bottom:.4em}img{max-width:100%;height:auto}pre{white-space:pre-wrap;background:#f1f3f1;padding:1em}blockquote{border-left:4px solid #78906c;margin-left:0;padding-left:1em;color:#4b5548}table{border-collapse:collapse}td,th{border:1px solid #aab0aa;padding:.35em .6em}.bizu,.pegadinha{padding:.8em 1em;margin:1em 0;border-left:4px solid #51734a;background:#edf5e9}.pegadinha{border-color:#96651c;background:#fff4d9}.callout-label{font-weight:700}</style></head><body>${body}</body></html>`;
}

function makeZip(files) {
  const local = []; const central = []; let offset = 0;
  for (const [filename, value] of Object.entries(files)) {
    const name = Buffer.from(String(filename).replace(/[^\w.\-/]/g, '_')); const data = Buffer.from(value); const crc = crc32(data);
    if (name.length > 65535 || data.length > 0xffffffff || offset > 0xffffffff) throw new Error('O pacote ZIP ultrapassa o formato suportado.');
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    local.push(lh, name, data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name); offset += lh.length + name.length + data.length;
  }
  const directory = Buffer.concat(central); const count = central.length / 2; const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

module.exports = { makeHtmlExport, makeZip, sanitizeExportHtml };
