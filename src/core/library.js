'use strict';
const { DatabaseSync } = require('node:sqlite');
const { createHash, randomUUID } = require('node:crypto');
const { norm, htmlToText } = require('./text');

const now = () => new Date().toISOString();
const n0 = (v) => (v === undefined ? null : v);

class Library {
  /**
   * @param {string} file caminho do .db (ou ':memory:')
   * @param {{versionIntervalMs?: number, maxVersions?: number}} opts
   */
  constructor(file = ':memory:', opts = {}) {
    this.versionIntervalMs = opts.versionIntervalMs ?? 5 * 60 * 1000;
    this.maxVersions = opts.maxVersions ?? 50;
    this.vocabCache = null;
    this._depth = 0;
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
    this._schema();
  }

  close() { this.db.close(); }

  // Transação reentrante: só a mais externa faz BEGIN/COMMIT.
  _tx(fn) {
    if (this._depth > 0) return fn();
    this._depth = 1;
    this.db.exec('BEGIN');
    try { const r = fn(); this.db.exec('COMMIT'); return r; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
    finally { this._depth = 0; }
  }

  _schema() {
    try {
      this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        title, body, tags, path, tokenize = 'unicode61 remove_diacritics 2');
        CREATE VIRTUAL TABLE IF NOT EXISTS notes_vocab USING fts5vocab(notes_fts, 'row');`);
    } catch (e) {
      throw new Error('Este SQLite não suporta FTS5, necessário para a pesquisa: ' + e.message);
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS folders(
        id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES folders(id),
        name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
        favorite INTEGER NOT NULL DEFAULT 0, deleted_at TEXT);
      CREATE TABLE IF NOT EXISTS notes(
        id INTEGER PRIMARY KEY, folder_id INTEGER,
        title TEXT NOT NULL DEFAULT '', content_html TEXT NOT NULL DEFAULT '',
        content_text TEXT NOT NULL DEFAULT '',
        favorite INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
      CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
      CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
      CREATE TABLE IF NOT EXISTS tags(id INTEGER PRIMARY KEY, name TEXT NOT NULL, key TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS note_tags(
        note_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY(note_id, tag_id));
      CREATE TABLE IF NOT EXISTS note_versions(
        id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL, title TEXT,
        content_html TEXT, saved_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_versions_note ON note_versions(note_id);
      CREATE TABLE IF NOT EXISTS synonyms(a TEXT NOT NULL, b TEXT NOT NULL, PRIMARY KEY(a, b));
      CREATE TABLE IF NOT EXISTS search_history(id INTEGER PRIMARY KEY, query TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS feedback(
        id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL, terms TEXT NOT NULL,
        value INTEGER NOT NULL CHECK(value IN (-1, 1)), at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_feedback_note ON feedback(note_id);
      CREATE TABLE IF NOT EXISTS consult_history(
        id INTEGER PRIMARY KEY, mode TEXT NOT NULL CHECK(mode IN ('theme', 'statement')),
        query TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS note_links(
        note_id INTEGER NOT NULL, related_note_id INTEGER NOT NULL, created_at TEXT NOT NULL,
        PRIMARY KEY(note_id, related_note_id), CHECK(note_id < related_note_id));
      CREATE INDEX IF NOT EXISTS idx_note_links_related ON note_links(related_note_id);
      INSERT OR IGNORE INTO meta(key, value) VALUES('schema_version', '1');
    `);
    const schemaVersion = Number(this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()?.value || 1);
    if (schemaVersion < 5) this.db.prepare("UPDATE meta SET value = '5' WHERE key = 'schema_version'").run();
  }

  // ---------- pastas ----------
  createFolder({ name, parentId = null }) {
    name = String(name ?? '').trim();
    if (!name) throw new Error('O nome da pasta é obrigatório.');
    if (parentId != null && !this._folder(parentId)) throw new Error('Pasta pai inexistente.');
    const pos = this.db.prepare(
      'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM folders WHERE parent_id IS ? AND deleted_at IS NULL'
    ).get(n0(parentId)).p;
    const r = this.db.prepare('INSERT INTO folders(parent_id, name, position) VALUES(?,?,?)').run(n0(parentId), name, pos);
    return Number(r.lastInsertRowid);
  }

  _folder(id) { return this.db.prepare('SELECT * FROM folders WHERE id = ? AND deleted_at IS NULL').get(id); }

  renameFolder(id, name) {
    name = String(name ?? '').trim();
    if (!name) throw new Error('O nome da pasta é obrigatório.');
    this.db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, id);
    this._reindexFolder(id);
  }

  setFolderFavorite(id, fav) { this.db.prepare('UPDATE folders SET favorite = ? WHERE id = ?').run(fav ? 1 : 0, id); }

  moveFolder(id, newParentId = null) {
    if (newParentId != null) {
      if (!this._folder(newParentId)) throw new Error('Destino inexistente.');
      if (this.descendantFolderIds(id).includes(Number(newParentId))) {
        throw new Error('Não é possível mover uma pasta para dentro dela mesma.');
      }
    }
    const pos = this.db.prepare(
      'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM folders WHERE parent_id IS ? AND deleted_at IS NULL'
    ).get(n0(newParentId)).p;
    this.db.prepare('UPDATE folders SET parent_id = ?, position = ? WHERE id = ?').run(n0(newParentId), pos, id);
    this._reindexFolder(id);
  }

  /** Define a ordem das pastas irmãs. */
  reorderFolders(parentId, orderedIds) {
    this._tx(() => {
      const st = this.db.prepare('UPDATE folders SET position = ? WHERE id = ? AND parent_id IS ?');
      orderedIds.forEach((fid, i) => st.run(i, fid, n0(parentId)));
    });
  }

  listFolders() {
    return this.db.prepare(
      'SELECT id, parent_id AS parentId, name, position, favorite FROM folders WHERE deleted_at IS NULL ORDER BY position, name'
    ).all().map((r) => ({ ...r, favorite: !!r.favorite }));
  }

  folderPath(id) {
    const parts = [];
    let cur = id;
    const st = this.db.prepare('SELECT name, parent_id FROM folders WHERE id = ?');
    for (let guard = 0; cur != null && guard < 100; guard++) {
      const f = st.get(cur);
      if (!f) break;
      parts.unshift(f.name);
      cur = f.parent_id;
    }
    return parts.join(' / ');
  }

  /** ids da pasta e de todas as subpastas (não excluídas). */
  descendantFolderIds(id, includeDeleted = false) {
    const filter = includeDeleted ? '' : 'WHERE f.deleted_at IS NULL';
    return this.db.prepare(
      `WITH RECURSIVE d(id) AS (SELECT ? UNION ALL SELECT f.id FROM folders f JOIN d ON f.parent_id = d.id ${filter})
       SELECT id FROM d`
    ).all(Number(id)).map((r) => r.id);
  }

  deleteFolder(id) {
    this._tx(() => {
      const ts = now();
      const ids = this.descendantFolderIds(id);
      const list = ids.join(',');
      this.db.exec(`UPDATE folders SET deleted_at = '${ts}' WHERE id IN (${list}) AND deleted_at IS NULL`);
      const noteIds = this.db.prepare(
        `SELECT id FROM notes WHERE folder_id IN (${list}) AND deleted_at IS NULL`).all().map((r) => r.id);
      this.db.exec(`UPDATE notes SET deleted_at = '${ts}' WHERE folder_id IN (${list}) AND deleted_at IS NULL`);
      noteIds.forEach((nid) => this._unindex(nid));
    });
  }

  restoreFolder(id) {
    this._tx(() => {
      const f = this.db.prepare('SELECT * FROM folders WHERE id = ? AND deleted_at IS NOT NULL').get(id);
      if (!f) return;
      const ts = f.deleted_at;
      if (f.parent_id != null && !this._folder(f.parent_id)) {
        this.db.prepare('UPDATE folders SET parent_id = NULL WHERE id = ?').run(id);
      }
      const ids = this.descendantFolderIds(id, true).join(',');
      this.db.prepare(`UPDATE folders SET deleted_at = NULL WHERE id IN (${ids}) AND deleted_at = ?`).run(ts);
      const noteIds = this.db.prepare(
        `SELECT id FROM notes WHERE folder_id IN (${ids}) AND deleted_at = ?`).all(ts).map((r) => r.id);
      this.db.prepare(`UPDATE notes SET deleted_at = NULL WHERE folder_id IN (${ids}) AND deleted_at = ?`).run(ts);
      noteIds.forEach((nid) => this._reindex(nid));
    });
  }

  purgeFolder(id) {
    this._tx(() => {
      const ids = this.descendantFolderIds(id, true);
      const list = ids.join(',');
      this.db.prepare(`SELECT id FROM notes WHERE folder_id IN (${list})`).all().forEach((r) => this._purgeNoteRows(r.id));
      this.db.exec(`DELETE FROM folders WHERE id IN (${list})`);
    });
  }

  // ---------- anotações ----------
  createNote({ title = '', contentHtml = '', folderId = null, tags = [], favorite = false } = {}) {
    return this._tx(() => {
      const ts = now();
      if (folderId != null && !this._folder(folderId)) throw new Error('Pasta inexistente.');
      const r = this.db.prepare(
        `INSERT INTO notes(folder_id, title, content_html, content_text, favorite, created_at, updated_at)
         VALUES(?,?,?,?,?,?,?)`
      ).run(n0(folderId), String(title).trim() || 'Sem título', contentHtml, htmlToText(contentHtml), favorite ? 1 : 0, ts, ts);
      const id = Number(r.lastInsertRowid);
      if (tags.length) this._setTags(id, tags);
      this._reindex(id);
      return id;
    });
  }

  _raw(id) { return this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id); }

  getNote(id) {
    const n = this._raw(id);
    if (!n) return null;
    return {
      id: n.id, title: n.title, contentHtml: n.content_html, contentText: n.content_text,
      folderId: n.folder_id, path: n.folder_id != null ? this.folderPath(n.folder_id) : '',
      favorite: !!n.favorite, archived: !!n.archived,
      createdAt: n.created_at, updatedAt: n.updated_at, deletedAt: n.deleted_at,
      tags: this.noteTags(id),
    };
  }

  updateNote(id, patch = {}) {
    return this._tx(() => {
      const n = this._raw(id);
      if (!n) throw new Error('Anotação inexistente.');
      const title = patch.title !== undefined ? (String(patch.title).trim() || 'Sem título') : n.title;
      const html = patch.contentHtml !== undefined ? patch.contentHtml : n.content_html;
      const folder = patch.folderId !== undefined ? patch.folderId : n.folder_id;
      if (folder != null && !this._folder(folder)) throw new Error('Pasta inexistente.');
      const contentChanged = title !== n.title || html !== n.content_html;
      if (contentChanged) this._snapshot(n, false);
      const fav = patch.favorite !== undefined ? (patch.favorite ? 1 : 0) : n.favorite;
      const arch = patch.archived !== undefined ? (patch.archived ? 1 : 0) : n.archived;
      const ts = contentChanged || patch.folderId !== undefined ? now() : n.updated_at;
      this.db.prepare(
        `UPDATE notes SET title=?, content_html=?, content_text=?, folder_id=?, favorite=?, archived=?, updated_at=? WHERE id=?`
      ).run(title, html, htmlToText(html), n0(folder), fav, arch, ts, id);
      if (patch.tags) this._setTags(id, patch.tags);
      this._reindex(id);
      return this.getNote(id);
    });
  }

  moveNote(id, folderId = null) { return this.updateNote(id, { folderId }); }
  setNoteFavorite(id, fav) { return this.updateNote(id, { favorite: fav }); }
  archiveNote(id, archived = true) { return this.updateNote(id, { archived }); }

  duplicateNote(id) {
    const n = this.getNote(id);
    if (!n) throw new Error('Anotação inexistente.');
    return this.createNote({ title: `${n.title} (cópia)`, contentHtml: n.contentHtml, folderId: n.folderId, tags: n.tags });
  }

  listRelatedNotes(id) {
    id = Number(id);
    if (!this._raw(id)) throw new Error('Anotação inexistente.');
    const rows = this.db.prepare(`SELECT n.id,n.title,n.folder_id AS folderId,n.updated_at AS updatedAt
      FROM note_links l JOIN notes n ON n.id = CASE WHEN l.note_id = ? THEN l.related_note_id ELSE l.note_id END
      WHERE (l.note_id = ? OR l.related_note_id = ?) AND n.deleted_at IS NULL AND n.archived = 0
      ORDER BY n.title COLLATE NOCASE`).all(id, id, id);
    return rows.map((n) => ({ ...n, path: n.folderId == null ? '' : this.folderPath(n.folderId) }));
  }

  linkNotes(noteId, relatedNoteId) {
    noteId = Number(noteId); relatedNoteId = Number(relatedNoteId);
    if (!Number.isSafeInteger(noteId) || !Number.isSafeInteger(relatedNoteId) || noteId === relatedNoteId) throw new Error('Escolha outra anotação para criar o vínculo.');
    if (!this._raw(noteId) || !this._raw(relatedNoteId)) throw new Error('Uma das anotações não existe.');
    const [a, b] = noteId < relatedNoteId ? [noteId, relatedNoteId] : [relatedNoteId, noteId];
    const result = this.db.prepare('INSERT OR IGNORE INTO note_links(note_id,related_note_id,created_at) VALUES(?,?,?)').run(a, b, now());
    return { created: Boolean(result.changes), notes: this.listRelatedNotes(noteId) };
  }

  unlinkNotes(noteId, relatedNoteId) {
    noteId = Number(noteId); relatedNoteId = Number(relatedNoteId);
    const [a, b] = noteId < relatedNoteId ? [noteId, relatedNoteId] : [relatedNoteId, noteId];
    const result = this.db.prepare('DELETE FROM note_links WHERE note_id=? AND related_note_id=?').run(a, b);
    if (!result.changes) throw new Error('Vínculo não encontrado.');
  }

  deleteNote(id) {
    this.db.prepare('UPDATE notes SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(now(), id);
    this._unindex(id);
  }

  restoreNote(id) {
    const n = this._raw(id);
    if (!n || !n.deleted_at) return;
    const folderOk = n.folder_id == null || this._folder(n.folder_id);
    this.db.prepare('UPDATE notes SET deleted_at = NULL, folder_id = ? WHERE id = ?').run(folderOk ? n.folder_id : null, id);
    this._reindex(id);
  }

  _purgeNoteRows(id) {
    this.db.prepare('DELETE FROM note_links WHERE note_id = ? OR related_note_id = ?').run(id, id);
    this.db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(id);
    this.db.prepare('DELETE FROM note_versions WHERE note_id = ?').run(id);
    this.db.prepare('DELETE FROM feedback WHERE note_id = ?').run(id);
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
    this._unindex(id);
  }

  purgeNote(id) { this._tx(() => this._purgeNoteRows(id)); }

  listTrash() {
    const folders = this.db.prepare(
      `SELECT f.id, f.name, f.deleted_at AS deletedAt FROM folders f
       WHERE f.deleted_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM folders p WHERE p.id = f.parent_id AND p.deleted_at = f.deleted_at)
       ORDER BY f.deleted_at DESC`).all();
    const notes = this.db.prepare(
      `SELECT n.id, n.title, n.deleted_at AS deletedAt FROM notes n
       WHERE n.deleted_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM folders f WHERE f.id = n.folder_id AND f.deleted_at = n.deleted_at)
       ORDER BY n.deleted_at DESC`).all();
    return { folders, notes };
  }

  emptyTrash() {
    this._tx(() => {
      this.db.prepare('SELECT id FROM notes WHERE deleted_at IS NOT NULL').all().forEach((r) => this._purgeNoteRows(r.id));
      this.db.exec('DELETE FROM folders WHERE deleted_at IS NOT NULL');
    });
  }

  purgeTrashOlderThan(days) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    this._tx(() => {
      this.db.prepare('SELECT id FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?').all(cutoff)
        .forEach((r) => this._purgeNoteRows(r.id));
      this.db.prepare('DELETE FROM folders WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(cutoff);
    });
  }

  /**
   * Lista leve de anotações.
   * opts: folderId (número | null = sem pasta | undefined = todas), favorites, tag, archived, limit, orderBy
   */
  listNotes(opts = {}) {
    const where = ['n.deleted_at IS NULL', `n.archived = ${opts.archived ? 1 : 0}`];
    const params = [];
    if (opts.folderId !== undefined) {
      if (opts.folderId === null) where.push('n.folder_id IS NULL');
      else { where.push('n.folder_id = ?'); params.push(opts.folderId); }
    }
    if (opts.favorites) where.push('n.favorite = 1');
    if (opts.tag) {
      where.push('EXISTS (SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = n.id AND t.key = ?)');
      params.push(norm(String(opts.tag).replace(/^#/, '')));
    }
    const order = opts.orderBy === 'title' ? 'n.title COLLATE NOCASE' : 'n.updated_at DESC';
    const limit = Math.min(Number(opts.limit) || 1000, 100000);
    return this.db.prepare(
      `SELECT n.id, n.title, n.folder_id AS folderId, n.favorite, n.archived, n.updated_at AS updatedAt
       FROM notes n WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit}`
    ).all(...params).map((r) => ({ ...r, favorite: !!r.favorite, archived: !!r.archived }));
  }

  // ---------- etiquetas ----------
  noteTags(id) {
    return this.db.prepare(
      'SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = ? ORDER BY t.name'
    ).all(id).map((r) => r.name);
  }

  _setTags(noteId, tags) {
    this.db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId);
    const seen = new Set();
    for (const raw of tags) {
      const name = String(raw).trim().replace(/^#+/, '');
      const key = norm(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      this.db.prepare('INSERT OR IGNORE INTO tags(name, key) VALUES(?,?)').run(name, key);
      const t = this.db.prepare('SELECT id FROM tags WHERE key = ?').get(key);
      this.db.prepare('INSERT OR IGNORE INTO note_tags(note_id, tag_id) VALUES(?,?)').run(noteId, t.id);
    }
  }

  setTags(noteId, tags) {
    this._tx(() => { this._setTags(noteId, tags); this._reindex(noteId); });
  }

  listTags() {
    return this.db.prepare(
      `SELECT t.name, COUNT(n.id) AS count FROM tags t
       JOIN note_tags nt ON nt.tag_id = t.id JOIN notes n ON n.id = nt.note_id AND n.deleted_at IS NULL
       GROUP BY t.id ORDER BY t.name COLLATE NOCASE`).all();
  }

  // ---------- histórico de versões ----------
  _snapshot(n, force) {
    const last = this.db.prepare('SELECT saved_at FROM note_versions WHERE note_id = ? ORDER BY id DESC LIMIT 1').get(n.id);
    if (!force && last && Date.now() - Date.parse(last.saved_at) < this.versionIntervalMs) return;
    this.db.prepare('INSERT INTO note_versions(note_id, title, content_html, saved_at) VALUES(?,?,?,?)')
      .run(n.id, n.title, n.content_html, now());
    this.db.prepare(
      `DELETE FROM note_versions WHERE note_id = ? AND id NOT IN
       (SELECT id FROM note_versions WHERE note_id = ? ORDER BY id DESC LIMIT ?)`
    ).run(n.id, n.id, this.maxVersions);
  }

  listVersions(noteId) {
    return this.db.prepare('SELECT id, title, saved_at AS savedAt FROM note_versions WHERE note_id = ? ORDER BY id DESC').all(noteId);
  }

  getVersion(versionId) {
    const v = this.db.prepare('SELECT id, note_id AS noteId, title, content_html AS contentHtml, saved_at AS savedAt FROM note_versions WHERE id = ?').get(versionId);
    return v ? { ...v } : null;
  }

  /** Restaura uma versão; antes, guarda a versão atual (nada é apagado em silêncio). */
  restoreVersion(versionId) {
    return this._tx(() => {
      const v = this.getVersion(versionId);
      if (!v) throw new Error('Versão inexistente.');
      this._snapshot(this._raw(v.noteId), true);
      return this.updateNote(v.noteId, { title: v.title, contentHtml: v.contentHtml });
    });
  }

  // ---------- sinônimos e histórico de pesquisa ----------
  addSynonym(a, b) {
    const x = norm(a).trim(), y = norm(b).trim();
    if (!x || !y || x === y) return;
    const st = this.db.prepare('INSERT OR IGNORE INTO synonyms(a, b) VALUES(?,?)');
    st.run(x, y); st.run(y, x);
  }
  removeSynonym(a, b) {
    const x = norm(a).trim(), y = norm(b).trim();
    this.db.prepare('DELETE FROM synonyms WHERE (a=? AND b=?) OR (a=? AND b=?)').run(x, y, y, x);
  }
  synonymsOf(term) { return this.db.prepare('SELECT b FROM synonyms WHERE a = ?').all(norm(term).trim()).map((r) => r.b); }
  listSynonyms() { return this.db.prepare('SELECT a, b FROM synonyms WHERE a < b ORDER BY a').all().map((r) => ({ ...r })); }

  recordSearch(q) {
    q = String(q).trim();
    if (!q) return;
    this.db.prepare('DELETE FROM search_history WHERE query = ?').run(q);
    this.db.prepare('INSERT INTO search_history(query, at) VALUES(?,?)').run(q, now());
    this.db.prepare('DELETE FROM search_history WHERE id NOT IN (SELECT id FROM search_history ORDER BY id DESC LIMIT 100)').run();
  }
  recentSearches(limit = 10) {
    return this.db.prepare('SELECT query FROM search_history ORDER BY id DESC LIMIT ?').all(limit).map((r) => r.query);
  }
  clearSearchHistory() { this.db.exec('DELETE FROM search_history'); }

  // ---------- assistente offline: avaliações e histórico ----------
  addFeedback(noteId, terms, value) {
    noteId = Number(noteId); value = Number(value); terms = String(terms ?? '').trim().slice(0, 500);
    if (!Number.isSafeInteger(noteId) || noteId < 1 || ![-1, 0, 1].includes(value)) throw new Error('Avaliação inválida.');
    if (!this._raw(noteId)) throw new Error('Anotação inexistente.');
    if (!terms) return false;
    this.db.prepare('DELETE FROM feedback WHERE note_id = ? AND terms = ?').run(noteId, terms);
    if (value) this.db.prepare('INSERT INTO feedback(note_id, terms, value, at) VALUES(?,?,?,?)').run(noteId, terms, value, now());
    return true;
  }

  feedbackRows(noteIds) {
    const ids = [...new Set((Array.isArray(noteIds) ? noteIds : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
    if (!ids.length) return [];
    return this.db.prepare(`SELECT note_id AS noteId, terms, value FROM feedback WHERE note_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  }

  clearFeedback() { this.db.exec('DELETE FROM feedback'); }

  recordConsult(mode, query) {
    if (!['theme', 'statement'].includes(mode)) throw new Error('Tipo de consulta inválido.');
    query = String(query ?? '').trim().slice(0, 2000);
    if (!query) return false;
    this.db.prepare('DELETE FROM consult_history WHERE mode = ? AND query = ?').run(mode, query);
    this.db.prepare('INSERT INTO consult_history(mode, query, at) VALUES(?,?,?)').run(mode, query, now());
    this.db.prepare('DELETE FROM consult_history WHERE id NOT IN (SELECT id FROM consult_history ORDER BY id DESC LIMIT 50)').run();
    return true;
  }

  recentConsults(limit = 10) {
    limit = Math.max(1, Math.min(50, Math.trunc(Number(limit) || 10)));
    return this.db.prepare('SELECT mode, query, at FROM consult_history ORDER BY id DESC LIMIT ?').all(limit);
  }

  clearConsultHistory() { this.db.exec('DELETE FROM consult_history'); }

  noteCount() { return this.db.prepare('SELECT COUNT(*) AS c FROM notes WHERE deleted_at IS NULL AND archived = 0').get().c; }

  // ---------- índice de busca ----------
  _unindex(id) { this.db.prepare('DELETE FROM notes_fts WHERE rowid = ?').run(id); this.vocabCache = null; }

  _reindex(id) {
    const n = this._raw(id);
    this.db.prepare('DELETE FROM notes_fts WHERE rowid = ?').run(id);
    this.vocabCache = null;
    if (!n || n.deleted_at) return;
    const path = n.folder_id != null ? this.folderPath(n.folder_id) : '';
    this.db.prepare('INSERT INTO notes_fts(rowid, title, body, tags, path) VALUES(?,?,?,?,?)')
      .run(id, n.title, n.content_text, this.noteTags(id).join(' '), path);
  }

  _reindexFolder(folderId) {
    const ids = this.descendantFolderIds(folderId).join(',');
    this.db.prepare(`SELECT id FROM notes WHERE folder_id IN (${ids}) AND deleted_at IS NULL`).all()
      .forEach((r) => this._reindex(r.id));
  }

  reindexAll() {
    this._tx(() => {
      this.db.exec('DELETE FROM notes_fts');
      this.db.prepare('SELECT id FROM notes WHERE deleted_at IS NULL').all().forEach((r) => this._reindex(r.id));
    });
  }

  /** Vocabulário do índice (para correção de digitação). */
  vocabulary() {
    if (!this.vocabCache) {
      this.vocabCache = this.db.prepare('SELECT term, doc FROM notes_vocab').all().map((r) => ({ term: r.term, doc: r.doc }));
    }
    return this.vocabCache;
  }

  // ---------- preparações e sessões de estudo ----------
  isEmpty() {
    return this.db.prepare('SELECT (SELECT COUNT(*) FROM folders) + (SELECT COUNT(*) FROM notes) AS c').get().c === 0;
  }

  /** Estrutura inicial de exemplo (o usuário pode alterar tudo). */
  seedDefaultStructure() {
    const tree = {
      'Direito Constitucional': ['Constituição Federal', 'Teoria da Constituição', 'Direitos e garantias fundamentais',
        'Organização do Estado', 'Poder Legislativo', 'Controle de constitucionalidade', 'Cláusulas pétreas'],
      'Direito Administrativo': ['Organização administrativa', 'Atos administrativos', 'Poderes administrativos',
        'Agentes públicos', 'Licitações e contratos', 'Lei 14.133/2021'],
      'Língua Portuguesa': ['Interpretação de textos', 'Pontuação', 'Concordância verbal', 'Regência', 'Crase'],
      'Administração Geral': [], 'Administração Pública': [], 'Administração Financeira e Orçamentária': [],
      'Informática': [], 'Arquivologia': [], 'Legislação específica': [], 'Anotações diversas': [],
    };
    this._tx(() => {
      for (const [name, subs] of Object.entries(tree)) {
        const id = this.createFolder({ name });
        subs.forEach((s) => this.createFolder({ name: s, parentId: id }));
      }
    });
  }
}

module.exports = { Library };
