'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dates = require('./dates');
const storage = require('./storage');

function backupName(now = new Date(), prefix = 'BIZUTECA') {
  return prefix + '-' + dates.key(now) + '-' + [now.getHours(),now.getMinutes(),now.getSeconds(),now.getMilliseconds()].map((part,i)=>String(part).padStart(i===3?3:2,'0')).join('-') + '-' + crypto.randomUUID().slice(0,8) + '.b9mm';
}
function retainAutomatic(directory, keepName) {
  const files = fs.readdirSync(directory)
    .filter(name => /^auto-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-[0-9a-f]{8}\.b9mm$/.test(name))
    .flatMap(name=>{
      const stat=fs.lstatSync(path.join(directory,name),{throwIfNoEntry:false});
      return stat?.isFile()?[{name,mtime:stat.mtimeMs,day:dates.key(stat.mtime)}]:[];
    })
    .sort((a,b)=>b.mtime-a.mtime||b.name.localeCompare(a.name));
  const dayBuckets = new Set(), weekBuckets = new Set(), monthBuckets = new Set();
  const keep = new Set(keepName?[keepName]:[]);
  for (const {name,day} of files) {
    if (dayBuckets.size < 7 && !dayBuckets.has(day)) { dayBuckets.add(day); keep.add(name); }
  }
  for (const {name,day} of files) {
    if (dayBuckets.has(day)) continue;
    const week = Math.floor(dates.daysBetween('1970-01-05', day) / 7);
    if (weekBuckets.size < 4 && !weekBuckets.has(week)) { weekBuckets.add(week); keep.add(name); }
  }
  for (const {name,day} of files) {
    const month = day.slice(0,7);
    const week = Math.floor(dates.daysBetween('1970-01-05', day) / 7);
    if (dayBuckets.has(day) || weekBuckets.has(week)) continue;
    if (monthBuckets.size < 3 && !monthBuckets.has(month)) { monthBuckets.add(month); keep.add(name); }
  }
  // Called only after a new snapshot has been written and decoded successfully.
  for (const {name} of files) if (!keep.has(name)) fs.unlinkSync(path.join(directory,name));
}
function writeBackup(lib, directory, options = {}) {
  const dest = path.join(directory, 'backups');
  fs.mkdirSync(dest,{recursive:true});
  const name = backupName(options.now, options.automatic ? 'auto' : options.prefix);
  const file = path.join(dest,name);
  const raw = storage.encodePackage(lib,directory,options.onMissing);
  storage.atomicWrite(file,raw);
  storage.decodePackage(fs.readFileSync(file));
  if (options.additional) {
    if (!fs.statSync(options.additional).isDirectory()) throw Error('A unidade da cópia adicional está indisponível. O backup local foi criado em ' + file);
    storage.atomicWrite(path.join(options.additional,name),raw);
    if(options.automatic)retainAutomatic(options.additional,name);
  }
  if (options.automatic) retainAutomatic(dest,name);
  return file;
}
module.exports = { backupName, retainAutomatic, writeBackup };
