# Evolution Stadium

Six AI coaches breed a walking creature. A physics engine is the only judge. The best three race every generation
in a 3D arena, the notebook keeps every hypothesis that died, the crowd changes the course from their phones, and
the judge's table decides what counts.

This is how chips and antibodies are starting to be designed: an AI proposes, a brutal verifier rejects most of it,
and the survivors compound. We made it a sport so you can watch the method work.

## Run
```
npm install
ANTHROPIC_API_KEY=… CARTESIA_API_KEY=… SPACETIME_DB=evolution-stadium npm start
open http://localhost:8080
```
Every service degrades on its own: without `ANTHROPIC_API_KEY` the coaches use `OPENAI_API_KEY`, and without
that, labelled rule-based mutations; without `CARTESIA_API_KEY` the commentators use browser speech; without
`SPACETIME_DB` the room lives in this process's memory. Keys go in `.env` (ignored by git) or Fly secrets; the
repository contains no secrets. `npm test` runs the physics tests (the seed stands, the judge is deterministic,
evolution improves on the seed).

## Pages
`/` the stadium · `/vote` the crowd (phones) · `/bench` coaches versus blind mutation · `/about` why.

## What is real and what is simulated
Real: the physics (cannon.js, deterministic, the coaches never touch it), the scores, the race (same engine, same
timestep as the judge), the notebook, the lineage, the votes, the values, and the coaches' hypotheses, which are a
language model's own words (model name on the scoreboard). Simulated: the creatures and the course. Scripted: nothing.
If the model is unavailable, rule-based mutations stand in and are labelled "rule" in the notebook.

## The three services, and what each one does here

### Claude (Anthropic): the coaches
The six coaches and the head-coach role run on `claude-haiku-5-5` through the Anthropic SDK (`server.js`,
`callJSON`), effort `low` for a normal generation and `medium` on a plateau. Each coach sees the champion's
genome, two alternates from the stable, the kept hypotheses and the last sixteen notebook lines, and returns one
full genome plus a causal claim in at most twelve words. Those claims are the model's own words on the scoreboard;
nothing is scripted. Two commentators (Vic, Lou) are written by the same model from the heat's actual results.

Where it goes wrong, by design: the model never sees the simulator, so it proposes bodies that flip, numbers that
are out of range (clamped by `sanitize`), and confident hypotheses that physics rejects. Rejection is not a bug;
it is the method. The notebook keeps every rejected claim with its delta so the next generation can read it.
When the model is unavailable, rule-based mutations stand in and are labelled `rule` in the notebook.

### Cartesia: the commentators' voices
Vic and Lou speak with Cartesia Sonic (`sonic-3.6`, mp3) through `POST /api/tts`, a server-side proxy, so the key
never reaches a browser. Two voices are picked from the library at boot (masculine for Vic, feminine for Lou;
pin them with `CARTESIA_VOICE_VIC` and `CARTESIA_VOICE_LOU`), with `generation_config` speed and emotion set per
commentator (Vic calm, Lou excited). Both lines are synthesised while the heat is still replaying and played in order
the moment the result card lands; lines are cached per text. Every spoken line is also on screen as text, the
voice can be switched off from the stadium bar, and no microphone or listener data is collected.
Known limits: about a second to first audio on an uncached line, English only, browser speech as the fallback.

### Spacetime: the room
`spacetime/` is a TypeScript SpacetimeDB module with the tables `room`, `vote`, `names` and `ballot` and the
reducers `vote`, `rename`, `judge` and `host`. The web node is stateless: `/api/room` reads the public tables
over the SQL HTTP API and every write from a phone or from the stadium screen is a reducer call, so votes are
transactional and any number of web nodes agree. Publish with `cd spacetime && spacetime publish evolution-stadium`
and set `SPACETIME_DB=evolution-stadium` (and `SPACETIME_HOST` for a non-maincloud server).
Known limit: phones and the stadium still poll the web node every two seconds instead of subscribing over WebSocket.

## Deploy
```
fly launch --copy-config --no-deploy
fly secrets set ANTHROPIC_API_KEY=… CARTESIA_API_KEY=… SPACETIME_DB=evolution-stadium
fly deploy
```

## Credits
Built at Cal Hacks 13.0. Karl Sims (1994), directed evolution (Arnold, 2018), AlphaEvolve (2025), RoboMorph
(2024–26), and Filipe Bonetto's auto-arch-tournament (2026) are the lineage; see `/about`.
