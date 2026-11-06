'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');

function supportDirectory(base) { return path.join(base, 'BIZUTECA-Suporte'); }
function configurationPath(base, appData, ensureWritable) {
  const directory = supportDirectory(base);
  const portable = path.join(directory, 'config.json');
  const resolved = path.resolve(base);
  const key = createHash('sha256').update(process.platform === 'win32' ? resolved.toLowerCase() : resolved).digest('hex');
  const fallbackDirectory = path.join(appData, 'Bizuteca 9MM', 'localizacoes');
  const fallback = path.join(fallbackDirectory, key + '.json');
  if (!fs.existsSync(fallback)) {
    try { ensureWritable(directory); return portable; } catch {}
  }
  ensureWritable(fallbackDirectory);
  return fallback;
}
function locateConfiguration(base, preferred) {
  const current = path.join(supportDirectory(base), 'config.json');
  const legacy = path.join(base, 'bizuteca-local.json');
  const source = [preferred, current, legacy].find(file => file && fs.existsSync(file));
  if (!source) return null;
  let saved;
  try { saved = JSON.parse(fs.readFileSync(source, 'utf8')); }
  catch { throw Error('A configuração da biblioteca está inválida. Preserve os arquivos e localize sua biblioteca antes de continuar.'); }
  if (!saved || (!saved.relative && !saved.absolute)) throw Error('A configuração não informa o local da biblioteca.');
  return saved;
}
function dataDirectory(base, saved) {
  if (saved?.relative) return path.resolve(base, saved.relative);
  if (saved?.absolute) return saved.absolute;
  const legacy = path.join(base, 'dados');
  if (fs.existsSync(path.join(legacy, 'biblioteca.db'))) return legacy;
  return path.join(supportDirectory(base), 'dados');
}
function configureRuntime(app, base) {
  const sessionDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bizuteca-session-'));
  const support = supportDirectory(base);
  let profileDirectory = path.join(support, 'configuracoes');
  try { fs.mkdirSync(profileDirectory, { recursive: true }); }
  catch { profileDirectory = path.join(sessionDirectory, 'configuracoes'); fs.mkdirSync(profileDirectory); }
  app.setPath('userData', profileDirectory);
  app.setPath('sessionData', sessionDirectory);
  app.setPath('crashDumps', sessionDirectory);
  return { sessionDirectory, profileDirectory, support };
}
function cleanupSession(directory) {
  // Only remove our own direct child of the system temporary directory.
  // Never remove the old portable profile, the selected library, or its backups.
  try {
    const resolved = fs.realpathSync(directory);
    const temporaryRoot = fs.realpathSync(os.tmpdir());
    if (path.dirname(resolved) !== temporaryRoot || !/^bizuteca-session-[a-zA-Z0-9]+$/.test(path.basename(resolved)) || fs.lstatSync(directory).isSymbolicLink()) return false;
    fs.rmSync(resolved, { recursive: true, force: true });
    return true;
  } catch { return false; } // Windows can retain cache locks until its child processes exit.
}
module.exports = { supportDirectory, configurationPath, locateConfiguration, dataDirectory, configureRuntime, cleanupSession };
