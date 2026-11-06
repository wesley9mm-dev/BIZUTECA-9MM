'use strict';
const { parse } = require('./dates');
function ensureEvents(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS biz_events(
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL, day TEXT NOT NULL, time TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT ''
  ); CREATE INDEX IF NOT EXISTS biz_events_day ON biz_events(day, time);`);
}
function listEvents(db) {
  return db.prepare('SELECT id, title, day, time, note FROM biz_events ORDER BY day, time, id').all();
}
function fields(value) {
  const title = typeof value?.title === 'string' ? value.title.trim() : '';
  const day = value?.day;
  const time = value?.time ?? '';
  const note = typeof value?.note === 'string' ? value.note : '';
  if (!title || title.length > 220) throw Error('Informe um título com até 220 caracteres.');
  if (!parse(day)) throw Error('Informe uma data válida.');
  if (typeof time !== 'string' || (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw Error('Informe um horário válido.');
  if (note.length > 8000) throw Error('A observação pode ter até 8.000 caracteres.');
  return [title, day, time, note];
}
function saveEvent(db, value) {
  const data = fields(value);
  if (value.id == null) return Number(db.prepare('INSERT INTO biz_events(title,day,time,note) VALUES(?,?,?,?)').run(...data).lastInsertRowid);
  if (!Number.isSafeInteger(value.id)) throw Error('Evento inválido.');
  const updated = db.prepare('UPDATE biz_events SET title=?,day=?,time=?,note=? WHERE id=?').run(...data,value.id);
  if (!updated.changes) throw Error('Evento não encontrado.');
  return value.id;
}
function deleteEvent(db, id) {
  if (!Number.isSafeInteger(id)) throw Error('Evento inválido.');
  return !!db.prepare('DELETE FROM biz_events WHERE id=?').run(id).changes;
}
function mergeEvents(target, source) {
  if (!source.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='biz_events'").get()) return {};
  ensureEvents(target);
  let eventsInserted = 0, eventsDuplicates = 0;
  const exists = target.prepare('SELECT 1 FROM biz_events WHERE title=? AND day=? AND time=? AND note=? LIMIT 1');
  for (const event of listEvents(source)) {
    if (exists.get(...fields(event))) eventsDuplicates++;
    else { saveEvent(target, {...event,id:null}); eventsInserted++; }
  }
  return eventsInserted || eventsDuplicates ? { eventsInserted, eventsDuplicates } : {};
}
module.exports = { ensureEvents, listEvents, saveEvent, deleteEvent, mergeEvents };
