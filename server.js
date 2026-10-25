'use strict';
/* Evolution Stadium server: static arena + coach API + a tiny in-memory room for the crowd. One machine, no database. */
const express = require('express');
const path = require('path');
const QRCode = require('qrcode');
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ maxRetries: 1 }) : null;

const app = express();
app.use(express.json({ limit: '512kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

/* ---------- LLM provider ---------- */
const PROVIDER = process.env.ANTHROPIC_API_KEY ? 'anthropic' : process.env.OPENAI_API_KEY ? 'openai' : 'none';
const MODELS = {
  anthropic: { coach: process.env.COACH_MODEL || 'claude-haiku-5-5', head: process.env.HEAD_COACH_MODEL || 'claude-haiku-5-5' },
  openai: { coach: process.env.COACH_MODEL || 'gpt-5.4-mini', head: process.env.HEAD_COACH_MODEL || 'gpt-5.4-mini' },
  none: { coach: 'rules', head: 'rules' },
};
function modelFor(tier) { return MODELS[PROVIDER][tier === 'head' ? 'head' : 'coach']; }

async function callJSON(system, user, { tier = 'coach', maxTokens = 3000, timeoutMs = 25000 } = {}) {
  if (PROVIDER === 'none') throw Object.assign(new Error('no provider'), { code: 'no_provider' });
  const model = modelFor(tier);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let text;
    if (PROVIDER === 'anthropic') {
      const msg = await anthropic.messages.create({
        model, max_tokens: maxTokens,
        system: system + '\nReply with a single JSON object only, no prose before or after it.',
        messages: [{ role: 'user', content: user }],
        output_config: { effort: tier === 'head' ? 'medium' : 'low' },
      }, { timeout: timeoutMs, signal: ctl.signal });
      if (msg.stop_reason === 'refusal') throw Object.assign(new Error('refusal'), { code: 'refusal' });
      text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
    } else {
      const body = { model, messages: [{ role: 'system', content: system + '\nReply with a single JSON object only.' }, { role: 'user', content: user }], response_format: { type: 'json_object' }, max_completion_tokens: maxTokens };
      if (/^gpt-5/.test(model)) body.reasoning_effort = tier === 'head' ? 'low' : 'none';
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw Object.assign(new Error(`openai ${r.status} ${(await r.text()).slice(0, 200)}`), { code: 'upstream' });
      const j = await r.json(); text = j.choices?.[0]?.message?.content || '';
    }
    const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!m) throw Object.assign(new Error('no json'), { code: 'invalid_json' });
    return { data: JSON.parse(m[0]), model };
  } finally { clearTimeout(timer); }
}

/* ---------- coaches ---------- */
const COACHES = [
  { name: 'Dr. Okafor', style: 'biomechanist: changes limb lengths and ratios, small and precise', creed: 'The body is the hypothesis.' },
  { name: 'Bibi', style: 'gait theorist: works on phases and frequencies, keeps left and right half a cycle apart', creed: 'Rhythm before strength.' },
  { name: 'Hal', style: 'minimalist: fewer legs, lighter torso, lower amplitudes', creed: 'Whatever is not there cannot fail.' },
  { name: 'Tuva', style: 'maximalist: more legs, heavier torso, bigger amplitudes', creed: 'Mass is a strategy.' },
  { name: 'Ren', style: 'breeder: crosses two parents from the stable, legs from one and gait from the other', creed: 'Every champion has two parents.' },
  { name: 'Sol', style: 'tinkerer: one tiny nudge to one number', creed: 'Small steps compound.' },
];
const RULES = `Genome rules: torso {w 0.5-2.0, h 0.2-0.8, d 0.3-1.2, mass 2-10}. legs: 2 to 6 entries {x,z in -1..1 (attachment as a fraction of the torso half size), up 0.25-1.1, lo 0.25-1.1 (segment lengths, metres), r 0.05-0.18, hip {amp 0-10, f 0.3-2.5, ph -3.2..3.2}, knee {same}}. Each joint motor runs at angular speed amp*sin(2*pi*f*t+ph). Legs on opposite sides usually want phases half a cycle apart. Rigid boxes, hinge joints around the lateral axis, feet pads under each shin.`;
const EVENTS = { flat: 'flat track', stairs: 'rising steps from x=3, 12 cm each', ice: 'almost no friction', gap: 'a 1 m hole at x=6' };

app.post('/api/coaches', async (req, res) => {
  const { champion, alts = [], event = 'flat', lessons = [], kept = [], plateau = false, values = {} } = req.body || {};
  if (!champion || !champion.genome) return res.status(400).json({ error: 'champion required' });
  const sys = `You are six coaches breeding a walking creature in a rigid-body physics simulation. You never see the simulator; you only see genomes, scores and the notebook. You propose; physics decides.`;
  const user = `Event: ${event} (${EVENTS[event] || event}). Score = metres along +x in 7 seconds, times a posture factor (upright matters, weight ${values.posture ?? 1}), times a speed weight ${values.speed ?? 1}, minus an economy penalty on total motor amplitude (weight ${values.economy ?? 0}). Flipping cuts the score by 70%.
Champion (lineage ${champion.lin || 'A'}): ${JSON.stringify(champion.genome)}
Champion result: score ${champion.score} (raw ${champion.e?.raw} m, upright ${Math.round((champion.e?.upright ?? 0) * 100)}%, gait "${champion.gait || '?'}"${champion.e?.flipped ? ', flipped' : ''}).
${alts.map((a, i) => `Stable alternate ${i + 1} (lineage ${a.lin}, score ${a.score}, gait "${a.gait || '?'}"): ${JSON.stringify(a.genome)}`).join('\n')}
${RULES}
${plateau ? 'PLATEAU: the record has not moved for several generations. Small nudges are forbidden this round. Every coach must change structure: leg count, leg placement, torso proportions, or a different gait pattern (phase relationships, frequency).' : ''}
Kept so far (what physics rewarded, oldest first): ${kept.join(' | ') || '(nothing yet)'}
Lessons so far, newest last:
${lessons.slice(-16).join('\n') || '(none yet)'}
Coaches and styles:
${COACHES.map(c => `- ${c.name}: ${c.style}`).join('\n')}
Coaches 1-4 mutate the champion. Ren crosses the champion with a stable alternate when one is given. Sol mutates a stable alternate when one is given, else the champion. Return FULL genomes, not diffs. A hypothesis is a causal claim in at most 12 words, in the coach's voice.
Reply with JSON: {"proposals": [ {"coach": string, "hypothesis": string, "genome": {...}} x6 ]}`;
  try {
    const { data, model } = await callJSON(sys, user, { tier: plateau ? 'head' : 'coach', timeoutMs: plateau ? 30000 : 25000 });
    const arr = Array.isArray(data) ? data : Array.isArray(data.proposals) ? data.proposals : [];
    res.json({ proposals: arr.slice(0, 6), model, provider: PROVIDER });
  } catch (e) { console.error('coaches failed:', e.code || '', String(e.message).slice(0, 200)); res.status(502).json({ error: e.code || 'error', message: String(e.message).slice(0, 200), provider: PROVIDER }); }
});

app.post('/api/commentary', async (req, res) => {
  const { event, gen, results = [], prevRecord, accepted, bestCoach, plateau, overtook } = req.body || {};
  const sys = 'You write live sports commentary for a stadium where AI coaches breed physics creatures. Two voices: Vic is dry and precise; Lou is excitable and loud. Each line at most 18 words. No hashtags, no emoji.';
  const user = `Event: ${event}. Generation ${gen}. Results (coach, hypothesis, score, gait, flipped?): ${results.map(r => `${r.coach}: "${r.hyp}" ${r.score} (${r.gait})${r.flipped ? ' FLIPPED' : ''}${r.fell ? ' FELL' : ''}`).join('; ')}. Record before this heat: ${prevRecord}. ${accepted ? 'A NEW RECORD was set by ' + bestCoach : 'No new record.'}${plateau ? ' The lineage had been stuck; a new lineage just entered.' : ''}${overtook ? ' A different lineage just took the record.' : ''} Reply with JSON {"vic": string, "lou": string}.`;
  try { const { data } = await callJSON(sys, user, { tier: 'coach', maxTokens: 300, timeoutMs: 12000 }); res.json({ vic: String(data.vic || '').slice(0, 160), lou: String(data.lou || '').slice(0, 160) }); }
  catch (e) { res.status(502).json({ error: e.code || 'error' }); }
});

/* ---------- voices (Cartesia) ---------- */
const CARTESIA = process.env.CARTESIA_API_KEY || '';
const CARTESIA_VERSION = '2026-08-14';
const VOICE = { vic: process.env.CARTESIA_VOICE_VIC || '', lou: process.env.CARTESIA_VOICE_LOU || '', names: {} };
const cartesiaHeaders = () => ({ authorization: `Bearer ${CARTESIA}`, 'x-api-key': CARTESIA, 'cartesia-version': CARTESIA_VERSION, 'content-type': 'application/json' });
async function pickVoices() {
  if (!CARTESIA) return;
  try {
    const r = await fetch('https://api.cartesia.ai/voices?language=en&limit=100', { headers: cartesiaHeaders() });
    if (!r.ok) throw new Error(`voices ${r.status} ${(await r.text()).slice(0, 120)}`);
    const list = ((await r.json()).data || []).filter(v => v.status !== 'archived').sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const masc = list.filter(v => v.gender === 'masculine'), fem = list.filter(v => v.gender === 'feminine');
    VOICE.vic = VOICE.vic || (masc[0] || list[0] || {}).id || '';
    VOICE.lou = VOICE.lou || (fem[0] || list[1] || list[0] || {}).id || '';
    for (const k of ['vic', 'lou']) VOICE.names[k] = (list.find(v => v.id === VOICE[k]) || {}).name || VOICE[k];
    console.log('cartesia voices: vic =', VOICE.names.vic, '· lou =', VOICE.names.lou, '· of', list.length);
  } catch (e) { console.error('cartesia voices failed:', e.message); }
}
pickVoices();
const ttsCache = new Map();
app.get('/api/tts/voices', (req, res) => res.json({ enabled: !!CARTESIA, vic: VOICE.names.vic || VOICE.vic, lou: VOICE.names.lou || VOICE.lou }));
app.post('/api/tts', async (req, res) => {
  if (!CARTESIA) return res.status(503).json({ error: 'no_tts' });
  const who = (req.body || {}).who === 'lou' ? 'lou' : 'vic';
  const text = String((req.body || {}).text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!text) return res.status(400).json({ error: 'text required' });
  if (!VOICE[who]) await pickVoices();
  if (!VOICE[who]) return res.status(503).json({ error: 'no_voice' });
  const key = who + '|' + text;
  if (ttsCache.has(key)) { res.type('audio/mpeg'); return res.send(ttsCache.get(key)); }
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch('https://api.cartesia.ai/tts/bytes', { method: 'POST', signal: ctl.signal, headers: cartesiaHeaders(), body: JSON.stringify({ model_id: 'sonic-3.6', transcript: text, voice: { id: VOICE[who] }, language: 'en', output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 64000 }, generation_config: who === 'lou' ? { speed: 1.15, emotion: 'excited' } : { speed: 1.0, emotion: 'calm' } }) });
    if (!r.ok) throw new Error(`cartesia ${r.status} ${(await r.text()).slice(0, 160)}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (ttsCache.size >= 300) ttsCache.delete(ttsCache.keys().next().value);
    ttsCache.set(key, buf); res.type('audio/mpeg').send(buf);
  } catch (e) { console.error('tts failed:', e.message); res.status(502).json({ error: 'tts_failed' }); }
  finally { clearTimeout(timer); }
});

/* ---------- the room (crowd) ---------- */
/* SpacetimeDB holds the room when SPACETIME_DB is set: votes, lineage names, the judge's values and
   the scoreboard live in reducers and public tables, so any number of stateless web nodes agree.
   Without it, one in-memory room on this process keeps the demo working. */
const STDB = process.env.SPACETIME_DB || '';
const STDB_HOST = (process.env.SPACETIME_HOST || 'https://maincloud.spacetimedb.com').replace(/\/$/, '');
const COURSES = ['flat', 'stairs', 'ice', 'gap'];
const mem = { gen: 0, record: 0, event: 'flat', lineageName: 'Lineage A', lineage: 'A', heat: [], notebook: [], votes: { flat: 0, stairs: 0, ice: 0, gap: 0 }, values: { speed: 1, posture: 1, economy: 0 }, names: {}, valuesBy: null, updatedAt: Date.now(), stats: { prop: 0, rej: 0, acc: 0 } };
async function stCall(reducer, args) {
  const r = await fetch(`${STDB_HOST}/v1/database/${STDB}/call/${reducer}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`spacetime ${reducer} ${r.status} ${(await r.text()).slice(0, 160)}`);
}
async function stSql(sql) {
  const r = await fetch(`${STDB_HOST}/v1/database/${STDB}/sql`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: sql });
  if (!r.ok) throw new Error(`spacetime sql ${r.status} ${(await r.text()).slice(0, 160)}`);
  return (await r.json()).map(st => {
    const names = ((st.schema && st.schema.elements) || []).map((e, i) => typeof e.name === 'string' ? e.name : (e.name && (e.name.some ?? e.name.Some)) || ('c' + i));
    return (st.rows || []).map(row => Object.fromEntries(names.map((n, i) => [n, row[i]])));
  });
}
const J = (s, d) => { try { return JSON.parse(s); } catch (e) { return d; } };
let roomCache = { at: 0, data: null };
async function stRoom() {
  if (roomCache.data && Date.now() - roomCache.at < 400) return roomCache.data;
  const [rooms, votes, names] = await stSql('SELECT * FROM room; SELECT * FROM vote; SELECT * FROM names');
  const r = rooms[0] || {};
  const data = { gen: Number(r.gen || 0), record: Number(r.record || 0), event: r.event || 'flat', lineageName: r.lname || 'Lineage A', lineage: r.lineage || 'A', heat: J(r.heat, []), notebook: J(r.notebook, []), stats: J(r.stats, { prop: 0, rej: 0, acc: 0 }), values: { speed: Number(r.speed ?? 1), posture: Number(r.posture ?? 1), economy: Number(r.economy ?? 0) }, valuesBy: r.vby || null, votes: Object.fromEntries(COURSES.map(c => [c, Number((votes.find(v => v.course === c) || {}).count || 0)])), names: Object.fromEntries(names.map(n => [n.lineage, n.name])), updatedAt: Math.round(Number(r.updated || 0) / 1000), model: modelFor('coach'), provider: PROVIDER, backend: 'spacetime' };
  roomCache = { at: Date.now(), data }; return data;
}
const roomOf = async () => STDB ? stRoom() : { ...mem, model: modelFor('coach'), provider: PROVIDER, backend: 'memory' };
const fail = (res, e) => { console.error('room failed:', e.message); res.status(502).json({ error: 'room_failed' }); };
app.get('/api/room', async (req, res) => { try { res.json(await roomOf()); } catch (e) { fail(res, e); } });
app.post('/api/room/host', async (req, res) => {
  const b = req.body || {};
  try {
    if (STDB) {
      const cur = await stRoom(); roomCache.at = 0; const v = b.values || cur.values;
      await stCall('host', [Number(b.gen ?? cur.gen), Number(b.record ?? cur.record), String(b.event ?? cur.event), String(b.lineage ?? cur.lineage), String(b.lineageName ?? cur.lineageName), JSON.stringify(b.heat ?? cur.heat), JSON.stringify(b.notebook ?? cur.notebook), JSON.stringify(b.stats ?? cur.stats), Number(v.speed ?? 1), Number(v.posture ?? 1), Number(v.economy ?? 0), !!b.resetVotes]);
      const n = await stRoom(); return res.json({ ok: true, votes: n.votes, names: n.names, values: n.values, valuesBy: n.valuesBy });
    }
    for (const k of ['gen', 'record', 'event', 'lineageName', 'lineage', 'heat', 'notebook', 'stats', 'values']) if (b[k] !== undefined) mem[k] = b[k];
    if (b.resetVotes) mem.votes = { flat: 0, stairs: 0, ice: 0, gap: 0 }; mem.updatedAt = Date.now();
    res.json({ ok: true, votes: mem.votes, names: mem.names, values: mem.values, valuesBy: mem.valuesBy });
  } catch (e) { fail(res, e); }
});
app.post('/api/room/vote', async (req, res) => { const c = String((req.body || {}).course || ''); if (!COURSES.includes(c)) return res.status(400).json({ error: 'course' });
  try { if (STDB) { await stCall('vote', [c]); roomCache.at = 0; return res.json({ votes: (await stRoom()).votes }); } mem.votes[c]++; mem.updatedAt = Date.now(); res.json({ votes: mem.votes }); } catch (e) { fail(res, e); } });
app.post('/api/room/name', async (req, res) => { const n = String((req.body || {}).name || '').trim().slice(0, 24); if (!n) return res.status(400).json({ error: 'name' });
  try { if (STDB) { await stCall('rename', [n]); roomCache.at = 0; return res.json({ ok: true, names: (await stRoom()).names }); } mem.names[mem.lineage] = n; mem.lineageName = n; mem.updatedAt = Date.now(); res.json({ ok: true, names: mem.names }); } catch (e) { fail(res, e); } });
app.post('/api/room/values', async (req, res) => { const v = req.body || {}; const cl = x => Math.max(0, Math.min(2, Number(x) || 0)); const vals = { speed: cl(v.speed ?? 1), posture: cl(v.posture ?? 1), economy: cl(v.economy ?? 0) }; const by = String(v.by || 'the judge').slice(0, 24);
  try { if (STDB) { await stCall('judge', [vals.speed, vals.posture, vals.economy, by]); roomCache.at = 0; return res.json({ values: (await stRoom()).values }); } mem.values = vals; mem.valuesBy = by; mem.updatedAt = Date.now(); res.json({ values: mem.values }); } catch (e) { fail(res, e); } });
app.get('/api/qr', async (req, res) => { try { const url = String(req.query.url || `${req.protocol}://${req.get('host')}/vote`); const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#EEE7D6', light: '#0000' } }); res.type('image/svg+xml').send(svg); } catch (e) { res.status(500).end(); } });
app.get('/api/health', (req, res) => res.json({ ok: true, provider: PROVIDER, model: modelFor('coach'), head: modelFor('head'), voice: CARTESIA ? 'cartesia' : 'browser', room: STDB ? 'spacetime' : 'memory' }));

const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`Evolution Stadium on :${port} (${PROVIDER}: ${modelFor('coach')} / ${modelFor('head')})`));
