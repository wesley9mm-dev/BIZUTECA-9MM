'use strict';
const fs = require('node:fs');
const path = require('node:path');

function importTextFiles(lib, files, folderId = null) {
  return lib._tx(() => {
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!['.txt', '.md', '.html', '.htm'].includes(ext)) {
        throw Error('Formato de anotação inválido: ' + path.basename(file));
      }
      if (fs.statSync(file).size > 20 * 1024 * 1024) {
        throw Error('Texto maior que 20 MB: ' + path.basename(file));
      }
      const bytes = fs.readFileSync(file);
      const utf16le = bytes[0] === 0xff && bytes[1] === 0xfe;
      const utf16be = bytes[0] === 0xfe && bytes[1] === 0xff;
      let html;
      try {
        const encoding = utf16le ? 'utf-16le' : utf16be ? 'utf-16be' : 'utf-8';
        html = new TextDecoder(encoding, {fatal:true}).decode(bytes);
      } catch {
        throw Error('Codificação inválida em ' + path.basename(file) + '. Salve o arquivo em UTF-8.');
      }
      if (html.includes('\0')) throw Error('Texto inválido: ' + path.basename(file));
      if (ext === '.txt' || ext === '.md') {
        const entities = {'&':'&amp;', '<':'&lt;', '>':'&gt;'};
        html = '<p>' + html.replace(/[&<>]/g, char => entities[char]).replace(/\r\n?|\n/g, '<br>') + '</p>';
      }
      lib.createNote({title:path.parse(file).name, contentHtml:html, folderId});
    }
    return files.length;
  });
}

module.exports = {importTextFiles};
