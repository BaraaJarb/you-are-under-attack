// Game API. Storage is injected (getStore) so the same code runs on Netlify Blobs
// in production and on an in-memory store in tests and local preview.
import { SCENARIOS } from './scenarios.mjs';

const LET = ['A', 'B', 'C', 'D'];
const DUR = 60000;      // answer window
const GRACE = 1500;     // network slack after the clock hits zero
const MAX_PLAYERS = 300;

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });

const blank = () => ({ gid: '', status: 'setup', n: 10, idx: 0, phase: 'ready', endsAt: 0, remMs: DUR, reveals: {}, scores: {}, board: [], ver: 0 });

const cleanName = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
const okPid = (s) => typeof s === 'string' && /^[a-z0-9]{8,40}$/.test(s);

export function createHandler(getStore, env = {}) {
  const store = () => getStore({ name: 'ua', consistency: 'strong' });

  async function readState(st) {
    return (await st.get('state', { type: 'json' })) || blank();
  }
  async function writeState(st, s) {
    s.ver = Date.now();
    await st.setJSON('state', s);
    return s;
  }
  async function listPlayers(st) {
    const res = await st.list({ prefix: 'p/' });
    const keys = (res.blobs || []).map((b) => b.key).slice(0, MAX_PLAYERS);
    const rows = await Promise.all(keys.map(async (k) => {
      const v = await st.get(k, { type: 'json' });
      return v ? { id: k.slice(2), ...v } : null;
    }));
    return rows.filter(Boolean);
  }
  async function wipePlayers(st) {
    const res = await st.list({ prefix: 'p/' });
    await Promise.all((res.blobs || []).map((b) => st.delete(b.key)));
  }

  function scoreAll(players, reveals) {
    const idxs = Object.keys(reveals).map(Number);
    const scores = {};
    for (const p of players) {
      let c = 0;
      for (const i of idxs) if (p.answers && p.answers[i] === LET[SCENARIOS[i].a]) c++;
      scores[p.id] = c;
    }
    const board = players
      .map((p) => ({ n: p.name, s: scores[p.id] }))
      .sort((a, b) => b.s - a.s || a.n.localeCompare(b.n))
      .slice(0, 10);
    return { scores, board };
  }

  function publicState(s) {
    const out = {
      now: Date.now(), ver: s.ver, gid: s.gid, status: s.status, n: s.n, idx: s.idx,
      phase: s.phase, endsAt: s.endsAt, remMs: s.remMs, dur: DUR,
      scores: s.scores, board: s.board, revealedCount: Object.keys(s.reveals || {}).length
    };
    if (s.status === 'live' || s.status === 'done') {
      const d = SCENARIOS[Math.min(s.idx, s.n - 1)];
      if (s.status === 'live' && s.phase !== 'ready') {
        out.incident = { t: d.t, cat: d.cat, sev: d.sev, b: d.b, q: d.q, o: d.o };
      } else if (s.status === 'live') {
        // Before the timer starts only the title is shown, so the question is not leaked early.
        out.incident = { t: d.t, cat: d.cat, sev: d.sev, b: '', q: '', o: [] };
      }
      if (s.phase === 'revealed' && s.reveals[s.idx]) out.reveal = s.reveals[s.idx];
    }
    if (s.status === 'done') {
      out.recap = [];
      for (let i = 0; i < s.n; i++) {
        const d = SCENARIOS[i];
        const rv = s.reveals[i];
        out.recap.push({ t: d.t, a: d.a, why: d.why, tally: rv ? rv.tally : [0, 0, 0, 0], total: rv ? rv.total : 0 });
      }
    }
    return out;
  }

  // Fail closed: without a HOST_PIN on the server nobody can control the drill.
  const needHost = (key) => !!env.HOST_PIN && String(key || '') === String(env.HOST_PIN);

  async function hostAction(st, body) {
    const a = body.action;
    let s = await readState(st);

    if (a === 'new') {
      const n = Math.max(3, Math.min(SCENARIOS.length, parseInt(body.n, 10) || 10));
      await wipePlayers(st);
      s = { ...blank(), gid: Math.random().toString(36).slice(2, 10), status: 'lobby', n };
      return publicState(await writeState(st, s));
    }
    if (a === 'reset') {
      await wipePlayers(st);
      return publicState(await writeState(st, blank()));
    }
    if (s.status === 'setup') return { error: 'no_game' };

    if (a === 'start') {
      s.status = 'live'; s.idx = 0; s.phase = 'ready'; s.remMs = DUR; s.endsAt = 0;
    } else if (a === 'timer' && s.status === 'live') {
      const now = Date.now();
      if (body.op === 'start' && s.phase !== 'revealed') { s.phase = 'running'; s.remMs = DUR; s.endsAt = now + DUR; }
      else if (body.op === 'pause' && s.phase === 'running') { s.remMs = Math.max(0, s.endsAt - now); s.phase = 'paused'; }
      else if (body.op === 'resume' && s.phase === 'paused') { s.phase = 'running'; s.endsAt = now + s.remMs; }
      else if (body.op === 'skip' && (s.phase === 'ready' || s.phase === 'running' || s.phase === 'paused')) { s.phase = 'running'; s.endsAt = now; s.remMs = 0; }
    } else if (a === 'reveal' && s.status === 'live' && s.phase !== 'revealed') {
      const players = await listPlayers(st);
      const d = SCENARIOS[s.idx];
      const tally = [0, 0, 0, 0];
      let total = 0;
      for (const p of players) {
        const k = LET.indexOf(p.answers && p.answers[s.idx]);
        if (k >= 0) { tally[k]++; total++; }
      }
      s.reveals[s.idx] = { a: d.a, why: d.why, r: d.r, tally, total };
      s.phase = 'revealed'; s.remMs = 0;
      const { scores, board } = scoreAll(players, s.reveals);
      s.scores = scores; s.board = board;
    } else if (a === 'goto' && s.status === 'live') {
      const i = Math.max(0, Math.min(s.n - 1, parseInt(body.idx, 10) || 0));
      s.idx = i; s.phase = s.reveals[i] ? 'revealed' : 'ready'; s.remMs = DUR; s.endsAt = 0;
    } else if (a === 'finish' && s.status === 'live') {
      const players = await listPlayers(st);
      const { scores, board } = scoreAll(players, s.reveals);
      s.scores = scores; s.board = board; s.status = 'done';
    } else if (a === 'resume_live' && s.status === 'done') {
      s.status = 'live'; s.idx = s.n - 1; s.phase = s.reveals[s.idx] ? 'revealed' : 'ready';
    } else {
      return { error: 'bad_action' };
    }
    return publicState(await writeState(st, s));
  }

  return async function handle(req) {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
    const method = req.method;
    try {
      if (route === 'config' && method === 'GET') return json({ pinRequired: true, pinConfigured: !!env.HOST_PIN });

      const st = store();

      if (route === 'state' && method === 'GET') return json(publicState(await readState(st)));

      let body = {};
      if (method === 'POST') { try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); } }

      if (route === 'join' && method === 'POST') {
        const name = cleanName(body.name);
        if (!okPid(body.pid)) return json({ error: 'bad_pid' }, 400);
        if (!name) return json({ error: 'name_required' }, 400);
        const key = 'p/' + body.pid;
        const cur = await st.get(key, { type: 'json' });
        const rec = cur ? { ...cur, name } : { name, answers: {}, t0: Date.now() };
        await st.setJSON(key, rec);
        return json({ ok: true, name, answers: rec.answers });
      }

      if (route === 'vote' && method === 'POST') {
        if (!okPid(body.pid) || !LET.includes(body.letter)) return json({ error: 'bad_vote' }, 400);
        const i = parseInt(body.idx, 10);
        const s = await readState(st);
        if (s.status !== 'live' || s.idx !== i || s.phase !== 'running') return json({ error: 'closed' }, 409);
        if (Date.now() > s.endsAt + GRACE) return json({ error: 'closed' }, 409);
        const key = 'p/' + body.pid;
        const cur = await st.get(key, { type: 'json' });
        if (!cur) return json({ error: 'join_first' }, 409);
        cur.answers = { ...(cur.answers || {}), [i]: body.letter };
        cur.t = Date.now();
        await st.setJSON(key, cur);
        return json({ ok: true, letter: body.letter });
      }

      if (route === 'host' && method === 'POST') {
        if (!needHost(body.key)) return json({ error: 'bad_pin' }, 401);
        const out = await hostAction(st, body);
        return json(out, out.error ? 409 : 200);
      }

      if (route === 'host-info' && method === 'GET') {
        if (!needHost(url.searchParams.get('key'))) return json({ error: 'bad_pin' }, 401);
        const s = await readState(st);
        const players = await listPlayers(st);
        const voted = players.filter((p) => p.answers && p.answers[s.idx]).length;
        const live = {};
        if (s.status === 'live' && s.phase !== 'revealed') {
          const t = [0, 0, 0, 0];
          for (const p of players) { const k = LET.indexOf(p.answers && p.answers[s.idx]); if (k >= 0) t[k]++; }
          live.tally = t;
        }
        // The leader may preview the current incident before starting the clock (never the answer).
        let preview = null;
        if (s.status === 'live') { const d = SCENARIOS[Math.min(s.idx, s.n - 1)]; preview = { b: d.b, q: d.q, o: d.o }; }
        return json({ total: players.length, voted, names: players.map((p) => p.name).slice(0, 120), preview, ...live });
      }

      return json({ error: 'not_found' }, 404);
    } catch (e) {
      return json({ error: 'server', message: String(e && e.message || e) }, 500);
    }
  };
}

// Tiny in-memory store with the subset of the Netlify Blobs API used above.
export function memoryStore() {
  const m = new Map();
  const store = {
    async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async delete(k) { m.delete(k); },
    async list({ prefix = '' } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
  return () => store;
}
