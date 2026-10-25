'use strict';
/* Evolution Stadium server: static arena + coach API + a tiny in-memory room for the crowd. One machine, no database. */
const express = require('express');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
app.use(express.json({ limit: '512kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

/* ---------- LLM provider ---------- */
const PROVIDER = process.env.ANTHROPIC_API_KEY ? 'anthropic' : process.env.OPENAI_API_KEY ? 'openai' : 'none';
const MODELS = {
  anthropic: { coach: process.env.COACH_MODEL || 'claude-haiku-5-5', head: process.env.HEAD_COACH_MODEL || 'claude-sonnet-5-5' },
  openai: { coach: process.env.COACH_MODEL || 'gpt-5.4-mini', head: process.env.HEAD_COACH_MODEL || 'gpt-5.4' },
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
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system: system + '\nReply with JSON only.', messages: [{ role: 'user', content: user }] }),
      });
      if (!r.ok) throw Object.assign(new Error(`anthropic ${r.status} ${(await r.text()).slice(0, 200)}`), { code: 'upstream' });
      const j = await r.json(); text = (j.content || []).map(c => c.text || '').join('');
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
  const { champion, alts = [], event = 'flat', lessons = [], plateau = false, values = {} } = req.body || {};
  if (!champion || !champion.genome) return res.status(400).json({ error: 'champion required' });
  const sys = `You are six coaches breeding a walking creature in a rigid-body physics simulation. You never see the simulator; you only see genomes, scores and the notebook. You propose; physics decides.`;
  const user = `Event: ${event} (${EVENTS[event] || event}). Score = metres along +x in 7 seconds, times a posture factor (upright matters, weight ${values.posture ?? 1}), times a speed weight ${values.speed ?? 1}, minus an economy penalty on total motor amplitude (weight ${values.economy ?? 0}). Flipping cuts the score by 70%.
Champion (lineage ${champion.lin || 'A'}): ${JSON.stringify(champion.genome)}
Champion result: score ${champion.score} (raw ${champion.e?.raw} m, upright ${Math.round((champion.e?.upright ?? 0) * 100)}%, gait "${champion.gait || '?'}"${champion.e?.flipped ? ', flipped' : ''}).
${alts.map((a, i) => `Stable alternate ${i + 1} (lineage ${a.lin}, score ${a.score}, gait "${a.gait || '?'}"): ${JSON.stringify(a.genome)}`).join('\n')}
${RULES}
${plateau ? 'PLATEAU: the record has not moved for several generations. Small nudges are forbidden this round. Every coach must change structure: leg count, leg placement, torso proportions, or a different gait pattern (phase relationships, frequency).' : ''}
Lessons so far, newest last:
${lessons.slice(-16).join('\n') || '(none yet)'}
Coaches and styles:
${COACHES.map(c => `- ${c.name}: ${c.style}`).join('\n')}
Coaches 1-4 mutate the champion. Ren crosses the champion with a stable alternate when one is given. Sol mutates a stable alternate when one is given, else the champion. Return FULL genomes, not diffs. A hypothesis is a causal claim in at most 12 words, in the coach's voice.
Reply with JSON: {"proposals": [ {"coach": string, "hypothesis": string, "genome": {...}} x6 ]}`;
  try {
    const { data, model } = await callJSON(sys, user, { tier: plateau ? 'head' : 'coach' });
    const arr = Array.isArray(data) ? data : Array.isArray(data.proposals) ? data.proposals : [];
    res.json({ proposals: arr.slice(0, 6), model, provider: PROVIDER });
  } catch (e) { res.status(502).json({ error: e.code || 'error', message: String(e.message).slice(0, 200), provider: PROVIDER }); }
});

app.post('/api/commentary', async (req, res) => {
  const { event, gen, results = [], prevRecord, accepted, bestCoach, plateau, overtook } = req.body || {};
  const sys = 'You write live sports commentary for a stadium where AI coaches breed physics creatures. Two voices: Vic is dry and precise; Lou is excitable and loud. Each line at most 18 words. No hashtags, no emoji.';
  const user = `Event: ${event}. Generation ${gen}. Results (coach, hypothesis, score, gait, flipped?): ${results.map(r => `${r.coach}: "${r.hyp}" ${r.score} (${r.gait})${r.flipped ? ' FLIPPED' : ''}${r.fell ? ' FELL' : ''}`).join('; ')}. Record before this heat: ${prevRecord}. ${accepted ? 'A NEW RECORD was set by ' + bestCoach : 'No new record.'}${plateau ? ' The lineage had been stuck; a new lineage just entered.' : ''}${overtook ? ' A different lineage just took the record.' : ''} Reply with JSON {"vic": string, "lou": string}.`;
  try { const { data } = await callJSON(sys, user, { tier: 'coach', maxTokens: 300, timeoutMs: 12000 }); res.json({ vic: String(data.vic || '').slice(0, 160), lou: String(data.lou || '').slice(0, 160) }); }
  catch (e) { res.status(502).json({ error: e.code || 'error' }); }
});

/* ---------- the room (crowd) ---------- */
const room = { gen: 0, record: 0, event: 'flat', lineageName: 'Lineage A', lineage: 'A', heat: [], notebook: [], votes: { flat: 0, stairs: 0, ice: 0, gap: 0 }, values: { speed: 1, posture: 1, economy: 0 }, names: {}, valuesBy: null, updatedAt: Date.now(), stats: { prop: 0, rej: 0, acc: 0 }, model: modelFor('coach'), provider: PROVIDER };
app.get('/api/room', (req, res) => res.json(room));
app.post('/api/room/host', (req, res) => { const b = req.body || {}; for (const k of ['gen', 'record', 'event', 'lineageName', 'lineage', 'heat', 'notebook', 'stats', 'values']) if (b[k] !== undefined) room[k] = b[k]; if (b.resetVotes) room.votes = { flat: 0, stairs: 0, ice: 0, gap: 0 }; room.updatedAt = Date.now(); res.json({ ok: true, votes: room.votes, names: room.names, values: room.values, valuesBy: room.valuesBy }); });
app.post('/api/room/vote', (req, res) => { const c = String((req.body || {}).course || ''); if (!(c in room.votes)) return res.status(400).json({ error: 'course' }); room.votes[c]++; room.updatedAt = Date.now(); res.json({ votes: room.votes }); });
app.post('/api/room/name', (req, res) => { const n = String((req.body || {}).name || '').trim().slice(0, 24); if (!n) return res.status(400).json({ error: 'name' }); room.names[room.lineage] = n; room.lineageName = n; room.updatedAt = Date.now(); res.json({ ok: true, names: room.names }); });
app.post('/api/room/values', (req, res) => { const v = req.body || {}; const cl = x => Math.max(0, Math.min(2, Number(x) || 0)); room.values = { speed: cl(v.speed ?? 1), posture: cl(v.posture ?? 1), economy: cl(v.economy ?? 0) }; room.valuesBy = String(v.by || 'the judge').slice(0, 24); room.updatedAt = Date.now(); res.json({ values: room.values }); });
app.get('/api/qr', async (req, res) => { try { const url = String(req.query.url || `${req.protocol}://${req.get('host')}/vote`); const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#EEE7D6', light: '#0000' } }); res.type('image/svg+xml').send(svg); } catch (e) { res.status(500).end(); } });
app.get('/api/health', (req, res) => res.json({ ok: true, provider: PROVIDER, model: modelFor('coach'), head: modelFor('head') }));

const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`Evolution Stadium on :${port} (${PROVIDER}: ${modelFor('coach')} / ${modelFor('head')})`));
