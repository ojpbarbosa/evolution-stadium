# Evolution Stadium — spec (final build, Cal Hacks 13.0)

Sun Oct 25, 2026, ~02:30. João sleeps until ~04:10; this is built and deployed by then. Submission 08:50.

## One sentence
Six AI coaches breed a walking creature; a physics engine is the only judge; the best three race every generation
in a 3D arena; the notebook keeps every hypothesis that died; the crowd changes the course and the judge's table
decides what counts.

## Pages
- `/` **Stadium.** Full-bleed three.js arena. Scoreboard (record, generation, record curve, coaches' model, status).
  Lineage strip. Lane tags over each racer (coach, hypothesis, live metres, bar against the record, gait label).
  Replay card between heats. Notebook as a ticker. Stadium signs: course, coaches (model / blind), lineage name,
  judge's values, commentary toggle, report. QR to `/vote`. Two commentators (browser voices; Cartesia if a key
  appears). Cheer on a record.
- `/vote` **Crowd.** Phone page: record, generation, this heat, vote the next course (applied when a course leads
  by two), name the lineage, the judge's table (speed / posture / economy weights, with the judge's name), notebook.
- `/bench` **Ablation.** Coaches versus blind mutation, same engine, same budget, two record curves, JSON export.
- `/about` **Why a stadium.** The method, what is real, the ablation, the lineage of the idea, where it goes.

## Loop (per generation)
1. Propose: `POST /api/coaches` with champion, two stable alternates, course, last 16 lessons, plateau flag, values.
   Six proposals back (coach, hypothesis ≤ 12 words, full genome). Pipelined: the next generation's proposals are
   requested while the current heat races. Fallback: rule-based mutations, labelled "rule".
2. Judge: `SIM.evaluate(genome, course)` → measurements (raw metres in 7 s, upright fraction, bounce, energy,
   flipped, fell). `SIM.score(e, values)` → number. `SIM.gait(e)` → walk / hop / shuffle / crawl / tumble / statue.
3. Race: top three replayed in separate worlds, same timestep, 1.3× speed, lane tags live.
4. Select: keep only if it beats the record. Stable of six (dedupe by genome). Lessons and notebook entries for all.
5. Plateau: four dry generations → a challenger lineage branches from the champion with a structural mutation,
   pinned in the stable for six generations; next round structural-only in the head-coach role (same model,
   low reasoning effort), replay card "plateau". Proposals for generation N+1 are requested right after N is
   judged, against the prospective champion, so they overlap the race without going stale.
6. Values: the judge's weights re-score the stable and the champion without re-simulating. Logged.
7. Room: the stadium pushes state to `/api/room/host` after every heat and polls `/api/room` every 2.5 s for votes,
   names and values.

## Backend
Express on one Fly machine (`sjc`). `/api/coaches`, `/api/commentary` through OpenAI (gpt-5.4-mini; the head-coach role is the same model
with low reasoning effort) or Anthropic (claude-haiku-5-5 / claude-sonnet-5-5) when `ANTHROPIC_API_KEY` is set.
In-memory room. `/api/qr`. `/api/health`.

## Real versus simulated
Real: physics, scores, races, notebook, lineage, votes, values, the model's hypotheses. Simulated: creatures, course.
Scripted: nothing.

## Prizes to opt into
Most Creative, Most Technically Complex, Hacker's Choice (the QR and the vote page are the campaign), MLH Best Use
of Gen AI. Cartesia only if a key lands before 08:00. Not Convex, not Spacetime (not used).
