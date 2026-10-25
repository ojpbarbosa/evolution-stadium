# Evolution Stadium

Six AI coaches breed a walking creature. A physics engine is the only judge. The best three race every generation
in a 3D arena, the notebook keeps every hypothesis that died, the crowd changes the course from their phones, and
the judge's table decides what counts.

This is how chips and antibodies are starting to be designed: an AI proposes, a brutal verifier rejects most of it,
and the survivors compound. We made it a sport so you can watch the method work.

## Run
```
npm install
OPENAI_API_KEY=… npm start        # or ANTHROPIC_API_KEY=… for Claude coaches
open http://localhost:8080
```
`npm test` runs the physics tests (the seed stands, the judge is deterministic, evolution improves on the seed).

## Pages
`/` the stadium · `/vote` the crowd (phones) · `/bench` coaches versus blind mutation · `/about` why.

## What is real and what is simulated
Real: the physics (cannon.js, deterministic, the coaches never touch it), the scores, the race (same engine, same
timestep as the judge), the notebook, the lineage, the votes, the values, and the coaches' hypotheses, which are a
language model's own words (model name on the scoreboard). Simulated: the creatures and the course. Scripted: nothing.
If the model is unavailable, rule-based mutations stand in and are labelled "rule" in the notebook.

## Deploy
```
fly launch --copy-config --no-deploy
fly secrets set OPENAI_API_KEY=…   # or ANTHROPIC_API_KEY=…
fly deploy
```

## Credits
Built at Cal Hacks 13.0. Karl Sims (1994), directed evolution (Arnold, 2018), AlphaEvolve (2025), RoboMorph
(2024–26), and Filipe Bonetto's auto-arch-tournament (2026) are the lineage; see `/about`.
