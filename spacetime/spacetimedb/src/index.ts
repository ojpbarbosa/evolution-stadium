// Evolution Stadium · the room. SpacetimeDB is the shared state between the stadium
// screen and every phone in the crowd: votes, lineage names, the judge's values,
// and the live scoreboard. The web node is stateless; all writes are reducers here.
import { schema, table, t, SenderError } from 'spacetimedb/server';

const COURSES = ['flat', 'stairs', 'ice', 'gap'];

const spacetimedb = schema({
  room: table(
    { public: true },
    {
      id: t.u32().primaryKey(),
      gen: t.u32(),
      record: t.f64(),
      event: t.string(),
      lineage: t.string(),
      lname: t.string(),
      heat: t.string(),      // JSON: the three lanes of the current heat
      notebook: t.string(),  // JSON: last notebook lines
      stats: t.string(),     // JSON: {prop, rej, acc}
      speed: t.f64(),
      posture: t.f64(),
      economy: t.f64(),
      vby: t.string(),       // who set the judge's values
      updated: t.u64(),
    }
  ),
  vote: table({ public: true }, { course: t.string().primaryKey(), count: t.u32() }),
  names: table({ public: true }, { lineage: t.string().primaryKey(), name: t.string() }),
  ballot: table(
    { public: true },
    { id: t.u64().primaryKey().autoInc(), course: t.string(), gen: t.u32(), at: t.u64() }
  ),
});
export default spacetimedb;

export const init = spacetimedb.init(ctx => {
  if (!ctx.db.room.id.find(1)) {
    ctx.db.room.insert({
      id: 1, gen: 0, record: 0, event: 'flat', lineage: 'A', lname: 'Lineage A',
      heat: '[]', notebook: '[]', stats: '{"prop":0,"rej":0,"acc":0}',
      speed: 1, posture: 1, economy: 0, vby: '', updated: ctx.timestamp.microsSinceUnixEpoch,
    });
  }
  for (const c of COURSES) if (!ctx.db.vote.course.find(c)) ctx.db.vote.insert({ course: c, count: 0 });
});

// A phone votes for the next course. Transactional: no lost votes across web nodes.
export const vote = spacetimedb.reducer({ course: t.string() }, (ctx, { course }) => {
  const v = ctx.db.vote.course.find(course);
  if (!v) throw new SenderError('unknown course');
  ctx.db.vote.course.update({ ...v, count: v.count + 1 });
  const r = ctx.db.room.id.find(1);
  ctx.db.ballot.insert({ id: 0n, course, gen: r ? r.gen : 0, at: ctx.timestamp.microsSinceUnixEpoch });
});

// The crowd names the lineage currently holding the record.
export const rename = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  const n = name.trim().slice(0, 24);
  if (!n) throw new SenderError('empty name');
  const r = ctx.db.room.id.find(1);
  if (!r) throw new SenderError('no room');
  const ex = ctx.db.names.lineage.find(r.lineage);
  if (ex) ctx.db.names.lineage.update({ ...ex, name: n });
  else ctx.db.names.insert({ lineage: r.lineage, name: n });
  ctx.db.room.id.update({ ...r, lname: n, updated: ctx.timestamp.microsSinceUnixEpoch });
});

// The judge's table: values that re-score the whole stable without re-simulating.
export const judge = spacetimedb.reducer(
  { speed: t.f64(), posture: t.f64(), economy: t.f64(), by: t.string() },
  (ctx, { speed, posture, economy, by }) => {
    const r = ctx.db.room.id.find(1);
    if (!r) throw new SenderError('no room');
    const cl = (x: number) => Math.max(0, Math.min(2, Number.isFinite(x) ? x : 0));
    ctx.db.room.id.update({
      ...r, speed: cl(speed), posture: cl(posture), economy: cl(economy),
      vby: by.trim().slice(0, 24) || 'the judge', updated: ctx.timestamp.microsSinceUnixEpoch,
    });
  }
);

// The stadium screen publishes the scoreboard after every heat.
export const host = spacetimedb.reducer(
  {
    gen: t.u32(), record: t.f64(), event: t.string(), lineage: t.string(), lname: t.string(),
    heat: t.string(), notebook: t.string(), stats: t.string(),
    speed: t.f64(), posture: t.f64(), economy: t.f64(), resetVotes: t.bool(),
  },
  (ctx, a) => {
    const r = ctx.db.room.id.find(1);
    if (!r) throw new SenderError('no room');
    ctx.db.room.id.update({
      ...r, gen: a.gen, record: a.record, event: a.event, lineage: a.lineage, lname: a.lname,
      heat: a.heat, notebook: a.notebook, stats: a.stats, speed: a.speed, posture: a.posture,
      economy: a.economy, updated: ctx.timestamp.microsSinceUnixEpoch,
    });
    if (a.resetVotes) for (const v of [...ctx.db.vote.iter()]) ctx.db.vote.course.update({ ...v, count: 0 });
  }
);
