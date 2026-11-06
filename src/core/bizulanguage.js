'use strict';

const collection = [
  require('../data/bizulanguage/en.json'),
  require('../data/bizulanguage/es.json'),
  require('../data/bizulanguage/fr.json'),
  require('../data/bizulanguage/it.json'),
];
const levels = {
  I: 'Iniciante',
  M: 'Intermediário',
  A: 'Avançado',
  V: 'Aumentar vocabulário',
};
const marker = 'bizulanguage_v1';
const entities = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'};
const escape = value => value.replace(/[&<>"]/g, char => entities[char]);
const lessonCount = collection.reduce((count, language) =>
  count + Object.values(language.lessons).reduce((total, lessons) => total + lessons.length, 0), 0);

function lessonHtml(lesson) {
  const references = lesson.links?.map(([label, url]) =>
    '<li><a href="' + escape(url) + '">' + escape(label) + '</a></li>').join('');
  return '<h2>Explicação</h2><p>' + escape(lesson.rule) + '</p>' +
    '<h2>Exemplos</h2><ul>' + lesson.examples.map(example => '<li>' + escape(example) + '</li>').join('') + '</ul>' +
    '<h2>Pratique</h2><p>' + escape(lesson.practice) + '</p>' +
    '<h2>Gabarito</h2><p>' + escape(lesson.answer) + '</p>' +
    (references ? '<h2>Referências para aprofundar</h2><ul>' + references + '</ul>' : '') +
    '<p><strong>BizuLanguage</strong></p>';
}

function installed(lib) {
  return Boolean(lib.db.prepare('SELECT 1 FROM meta WHERE key = ?').get(marker));
}

function install(lib) {
  return lib._tx(() => {
    if (installed(lib)) return 0;
    const findFolder = lib.db.prepare('SELECT id, name FROM folders WHERE parent_id IS ? AND deleted_at IS NULL ORDER BY id');
    const folder = (name, parentId = null) => findFolder.all(parentId)
      .find(entry => entry.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))?.id
      ?? lib.createFolder({name, parentId});
    const matching = lib.db.prepare('SELECT 1 FROM notes WHERE folder_id = ? AND title = ? AND content_html = ? AND deleted_at IS NULL');
    let inserted = 0;
    for (const {name, lessons} of collection) {
      const parentId = folder(name);
      for (const [key, label] of Object.entries(levels)) {
        const folderId = folder(label, parentId);
        for (const lesson of lessons[key]) {
          const contentHtml = lessonHtml(lesson);
          if (matching.get(folderId, lesson.title, contentHtml)) continue;
          lib.createNote({folderId, title:lesson.title, contentHtml, tags:['BizuLanguage', name, label]});
          inserted++;
        }
      }
    }
    lib.db.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run(marker, '1');
    return inserted;
  });
}

module.exports = {install, installed, lessonCount};
