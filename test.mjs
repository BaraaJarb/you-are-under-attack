// API test: a leader and 6 simulated players against the real handler. Run: node test.mjs
import assert from 'node:assert/strict';
import { createHandler, memoryStore } from './netlify/functions/lib/handler.mjs';

const env = { HOST_PIN: '1234' };
const h = createHandler(memoryStore(), env);
const call = async (method, path, body) => {
  const r = await h(new Request('http://x' + path, { method, body: body ? JSON.stringify(body) : undefined }));
  return { status: r.status, body: await r.json() };
};
const host = (action, extra = {}) => call('POST', '/api/host', { key: '1234', action, ...extra });
const KEY = ['B', 'B', 'B', 'C', 'A', 'D', 'C', 'A', 'D', 'B'];
const pids = ['aaaaaaaa1', 'bbbbbbbb2', 'cccccccc3', 'dddddddd4', 'eeeeeeee5', 'ffffffff6'];
const names = ['Sara', 'Omar', 'Lina', 'Khalid', 'Noor', 'Faisal'];
let ok = 0; const t = (name) => { ok++; console.log('  ok', name); };

assert.deepEqual((await call('GET', '/api/config')).body, { pinRequired: true, pinConfigured: true }); t('config says pin required and set');
assert.equal((await call('POST', '/api/host', { key: 'x', action: 'new' })).status, 401); t('wrong pin rejected');
assert.equal((await call('GET', '/api/state')).body.status, 'setup'); t('starts in setup');

let s = (await host('new', { n: 10 })).body; assert.equal(s.status, 'lobby'); t('new game opens lobby');
for (let i = 0; i < 6; i++) assert.equal((await call('POST', '/api/join', { pid: pids[i], name: names[i] })).status, 200);
assert.equal((await call('POST', '/api/join', { pid: 'short', name: 'x' })).status, 400); t('bad pid rejected');
assert.equal((await call('POST', '/api/join', { pid: 'gggggggg7', name: '   ' })).status, 400); t('empty name rejected');
assert.equal((await call('POST', '/api/join', { pid: 'gggggggg7', name: '<b>Bad</b>' })).body.name, 'bBad/b'); t('angle brackets stripped from names');
assert.equal((await call('GET', '/api/host-info?key=1234')).body.total, 7); t('host sees 7 players');
assert.equal((await call('GET', '/api/host-info?key=nope')).status, 401); t('host-info needs pin');

s = (await host('start')).body; assert.equal(s.status, 'live'); assert.equal(s.incident.b, ''); t('before timer the question is hidden');
assert.equal((await call('POST', '/api/vote', { pid: pids[0], idx: 0, letter: 'B' })).status, 409); t('no votes before timer');
assert.ok((await call('GET', '/api/host-info?key=1234')).body.preview.q); t('leader can preview');

// wrong answers per player: Sara none, Omar 0,1, Lina 2, Khalid 0-3, Noor 5, Faisal 1-5
const wrong = [[], [0, 1], [2], [0, 1, 2, 3], [5], [1, 2, 3, 4, 5]];
for (let i = 0; i < 10; i++) {
  if (i > 0) { s = (await host('goto', { idx: i })).body; assert.equal(s.phase, 'ready'); }
  s = (await host('timer', { op: 'start' })).body; assert.equal(s.phase, 'running');
  assert.ok(s.incident.o.length === 4); assert.equal(s.reveal, undefined); t('incident ' + (i + 1) + ' shows options, no answer');
  for (let p = 0; p < 6; p++) {
    const letter = wrong[p].includes(i) ? 'A' === KEY[i] ? 'C' : 'A' : KEY[i];
    const r = await call('POST', '/api/vote', { pid: pids[p], idx: i, letter });
    assert.equal(r.status, 200);
  }
  assert.equal((await call('POST', '/api/vote', { pid: pids[0], idx: i + 1, letter: 'A' })).status, 409); // wrong incident
  if (i === 0) { // change of mind while open
    await call('POST', '/api/vote', { pid: pids[1], idx: 0, letter: 'B' }); wrong[1] = wrong[1].filter((x) => x !== 0);
  }
  const info = (await call('GET', '/api/host-info?key=1234')).body; assert.equal(info.voted, 6);
  if (i === 1) { // pause / resume keeps remaining time
    s = (await host('timer', { op: 'pause' })).body; assert.equal(s.phase, 'paused'); assert.ok(s.remMs > 0 && s.remMs <= 60000);
    assert.equal((await call('POST', '/api/vote', { pid: pids[0], idx: 1, letter: 'A' })).status, 409);
    s = (await host('timer', { op: 'resume' })).body; assert.equal(s.phase, 'running'); t('pause blocks votes, resume reopens');
  }
  if (i === 2) { // skip timer: window closes after grace, late vote refused
    s = (await host('timer', { op: 'skip' })).body;
    await new Promise((r) => setTimeout(r, 1700));
    assert.equal((await call('POST', '/api/vote', { pid: pids[0], idx: 2, letter: 'A' })).status, 409); t('late vote refused after time is up');
  }
  s = (await host('reveal')).body;
  assert.equal(s.phase, 'revealed'); assert.equal(s.reveal.a, [1, 1, 1, 2, 0, 3, 2, 0, 3, 1][i]); assert.equal(s.reveal.total, 6);
  assert.equal(s.revealedCount, i + 1);
}
t('all 10 incidents voted and revealed');

s = (await host('finish')).body;
assert.equal(s.status, 'done');
const exp = { Sara: 10, Omar: 9, Lina: 9, Khalid: 6, Noor: 9, Faisal: 5 };
// Omar changed his mind on incident 0, so he only misses incident 1. Recompute expected from wrong[].
names.forEach((n, i) => { exp[n] = 10 - wrong[i].length; });
for (let i = 0; i < 6; i++) assert.equal(s.scores[pids[i]], exp[names[i]], names[i]);
assert.equal(s.board[0].n, 'Sara'); assert.equal(s.board[0].s, 10);
assert.equal(s.recap.length, 10); assert.ok(s.recap[0].total === 6); t('final scores and ranking are correct');

// Rejoin keeps answers
const rj = (await call('POST', '/api/join', { pid: pids[0], name: 'Sara' })).body; assert.equal(Object.keys(rj.answers).length, 10); t('rejoin keeps answers');

// Players never receive answers early: state during a fresh game with unrevealed incident
await host('new', { n: 5 }); await host('start'); await host('timer', { op: 'start' });
const raw = JSON.stringify((await call('GET', '/api/state')).body);
assert.ok(!raw.includes('Isolating the affected') && !raw.includes('"a":'), 'answer leaked'); t('no answer or explanation leaks before reveal');
assert.equal((await call('GET', '/api/state')).body.n, 5); t('n=5 game honored');
// Fail closed: with no HOST_PIN configured, nobody can run host actions
const open = createHandler(memoryStore(), {});
const rr = await open(new Request('http://x/api/host', { method: 'POST', body: JSON.stringify({ key: '', action: 'new', n: 5 }) }));
assert.equal(rr.status, 401); t('host actions refused when no HOST_PIN is set');
console.log('\n' + ok + ' checks passed');
