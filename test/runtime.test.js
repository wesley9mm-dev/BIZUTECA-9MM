'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const runtime = require('../src/core/runtime');
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bizuteca-runtime-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return base;
}
test('runtime: cache is temporary and portable settings remain in one support folder', t => {
  const base = fixture(t), paths = new Map();
  const result = runtime.configureRuntime({ setPath: (key, value) => paths.set(key, value) }, base);
  t.after(() => runtime.cleanupSession(result.sessionDirectory));
  assert.equal(paths.get('userData'), path.join(base, 'BIZUTECA-Suporte', 'configuracoes'));
  assert.equal(path.dirname(paths.get('sessionData')), os.tmpdir());
  assert.notEqual(paths.get('sessionData'), paths.get('userData'));
  assert.equal(paths.get('crashDumps'), paths.get('sessionData'));
  assert.deepEqual(fs.readdirSync(base), ['BIZUTECA-Suporte']);
});
test('runtime: legacy pointer keeps its original relative base when configuration moves', t => {
  const base = fixture(t), saved = { relative: 'dados' };
  fs.writeFileSync(path.join(base, 'bizuteca-local.json'), JSON.stringify(saved));
  assert.deepEqual(runtime.locateConfiguration(base), saved);
  assert.equal(runtime.dataDirectory(base, runtime.locateConfiguration(base)), path.join(base, 'dados'));
  fs.mkdirSync(runtime.supportDirectory(base));
  fs.writeFileSync(path.join(runtime.supportDirectory(base), 'config.json'), JSON.stringify({ relative: '../meu-pendrive' }));
  assert.equal(runtime.dataDirectory(base, runtime.locateConfiguration(base)), path.resolve(base, '../meu-pendrive'));
  assert.ok(fs.existsSync(path.join(base, 'bizuteca-local.json')));
});
test('runtime: an existing library is preserved and new libraries default to the support folder', t => {
  const base = fixture(t);
  assert.equal(runtime.dataDirectory(base, null), path.join(base, 'BIZUTECA-Suporte', 'dados'));
  fs.mkdirSync(path.join(base, 'dados'));
  fs.writeFileSync(path.join(base, 'dados', 'biblioteca.db'), 'existing library');
  assert.equal(runtime.dataDirectory(base, null), path.join(base, 'dados'));
  const absolute = path.join(base, 'outra-biblioteca');
  assert.equal(runtime.dataDirectory(base, { absolute }), absolute);
});
test('runtime: corrupt configuration never silently opens a new library', t => {
  const base = fixture(t);
  fs.writeFileSync(path.join(base, 'bizuteca-local.json'), '{broken');
  assert.throws(() => runtime.locateConfiguration(base), /inválida/);
});
test('runtime: cleanup removes only the temporary session and leaves library and configuration intact', t => {
  const base = fixture(t), result = runtime.configureRuntime({ setPath() {} }, base);
  fs.writeFileSync(path.join(result.sessionDirectory, 'Cache'), 'temporary');
  fs.writeFileSync(path.join(result.profileDirectory, 'config-test'), 'persistent');
  fs.writeFileSync(path.join(base, 'biblioteca.db'), 'library');
  assert.equal(runtime.cleanupSession(base), false);
  assert.equal(runtime.cleanupSession(result.profileDirectory), false);
  assert.equal(runtime.cleanupSession(result.sessionDirectory), true);
  assert.equal(fs.readFileSync(path.join(base, 'biblioteca.db'), 'utf8'), 'library');
  assert.equal(fs.readFileSync(path.join(result.profileDirectory, 'config-test'), 'utf8'), 'persistent');
});

test('runtime: remembers a chosen library when the portable directory is read-only', t => {
  const folder = fixture(t);
  const base = path.join(folder, 'portatil');
  const appData = path.join(folder, 'app-data');
  const destination = path.join(folder, 'meu-caderno');
  const writable = directory => fs.mkdirSync(directory, { recursive: true });
  const readOnlyPortable = directory => {
    if (directory === runtime.supportDirectory(base)) throw Error('Acesso negado');
    writable(directory);
  };
  const pointer = runtime.configurationPath(base, appData, readOnlyPortable);
  assert.equal(path.dirname(pointer), path.join(appData, 'Bizuteca 9MM', 'localizacoes'));
  assert.equal(runtime.locateConfiguration(base, pointer), null);
  fs.writeFileSync(pointer, JSON.stringify({ absolute: destination }));
  assert.equal(runtime.configurationPath(base, appData, readOnlyPortable), pointer);
  assert.equal(runtime.configurationPath(base, appData, writable), pointer);
  assert.equal(runtime.dataDirectory(base, runtime.locateConfiguration(base, pointer)), destination);
  assert.notEqual(runtime.configurationPath(path.join(folder, 'outro-portatil'), appData, writable), pointer);
});
