# Devpost — Evolution Stadium

Fields are Devpost's. Fill the bracketed numbers from the live stadium and `/bench` at 07:30.

## Project name (≤ 60)
Evolution Stadium

## Elevator pitch (≤ 200)
Six AI coaches breed a walking creature. A physics engine is the only judge. The crowd changes the course from their phones, and the notebook keeps every hypothesis that died. This is how chips get designed now.

## Thumbnail (3:2)
A heat mid-race: three creatures in lanes, the orange one on its side, the lane tag reading "Ren · 1.07 m · hop", the replay card "KEPT · NEW RECORD".

## About the project

### Inspiration
Two things we could not stop looking at this month. Filipe Bonetto's auto-arch-tournament, where an AI loop redesigned a RISC-V CPU and beat a human design, rejecting 63 of 73 of its own hypotheses on the way; the author's line was "the verifier is the artifact". And Artificial Societies, where thousands of simulated people are a wind tunnel for ideas. The method behind the first is how chips and antibodies are starting to be designed: propose, let something incorruptible decide, keep the survivors, write down why. You cannot watch a timing report. You can watch a creature fall over. So we made it a sport.

### What it does
Six coaches, each a language-model persona with a style and a creed, read the champion's genome, two alternates from the stable, the last sixteen lines of the notebook and the current course. Each returns one mutated genome and a hypothesis in twelve words. The physics engine builds all six as rigid bodies with motorised joints and drives them for seven seconds; it is deterministic and the coaches never touch it. The best three race live in the arena. A proposal is kept only if it beats the record; the rest are written into the notebook as rejected, with the delta and the gait it produced (walk, hop, shuffle, crawl, tumble, statue). Four dry generations declare a plateau: a new lineage enters from the seed and the coaches must change structure, not numbers.

The crowd scans a QR code and votes the next course (flat, stairs, ice, a gap); when a course leads by two the arena changes and every creature is re-scored. The judge's table sets what the stadium values: speed, posture, economy. Physics measures; a person decides what counts. Two commentators call every heat.

### How we built it
Three.js and cannon.js in the browser: the same engine and timestep judge the genomes headless and replay the race, so what you watch is exactly what was scored (85 ms per evaluation, deterministic). A small Node server on one Fly machine runs the coaches (gpt-5.4-mini; gpt-5.4 as head coach on plateaus; Claude Haiku and Sonnet as a drop-in) and an in-memory room for the crowd. Proposals for the next generation are requested while the current heat races, so the stadium never waits on the model.

### The result
First bench run at 03:40, flat course, six generations, six proposals each: coaches with hypotheses (gpt-5.4-mini) reached 2.26 m with a six-legged walk; blind random mutation under the same budget reached 0.80 m with a five-legged shuffle. Re-run it live at the booth and state it either way. The 2024 paper closest to this, RoboMorph, never ran that baseline. We run it live.

### Challenges we ran into
Creatures that fold instead of stand (feet pads and stiffer motors fixed it). A champion that gets stuck at a local gait (the stable, crossover and the plateau protocol fixed it). Keeping the loop fast enough to feel like a sport (pipelining the model call behind the race).

### Accomplishments that we're proud of
The loop is honest end to end: nothing is scripted, the model's hypotheses are its own words, and a bad night for the coaches shows up as a flat curve on the scoreboard. The judge's table: values and outcomes belong to a person, measurements belong to physics.

### What we learned
[One sentence from the notebook that surprised us.] Most hypotheses die. That is the point.

### What's next
Swap the judge and keep the stadium. A chip (synthesis, formal checks and a timing run, which already exist in auto-arch), an antibody (a binding-energy model), a bridge (a load test). A public benchmark for how well a model proposes under a verifier, which is the skill that matters now.

## Built with
three.js, cannon.js, node, express, anthropic (claude-haiku-5-5), cartesia (sonic-3.6), spacetimedb, fly.io

## Links
Live: https://evolution-stadium.fly.dev · Crowd: /vote · Bench: /bench · About: /about · Repo: https://github.com/ojpbarbosa/evolution-stadium · Video: [youtube]

## Prize opt-ins
Cal Hacks Most Creative Hack · Most Technically Complex Hack · Hacker's Choice · [MLH] Best Use of Gen AI · Anthropic · Best Use of Cartesia · Spacetime. (Not Convex.)

### For the Anthropic judges
1. The community: people who run verifier-gated design loops for a living, chip and antibody teams, and the students about to join them, who have never watched the method work.
2. The problem: the method is invisible. A coworker runs CPU/TPU evolution loops where an incorruptible verifier rejects most proposals; nobody outside the team can see why rejection is the point. We built the method as a sport so it can be watched.
3. It works: one loop done well. Open the page, press play, and the record moves within a minute. Ran unattended for hundreds of generations; the bench shows coaches with hypotheses at 2.26 m against blind mutation at 0.80 m under the same budget.
4. Claude: six coach personas and the head-coach role on claude-haiku-5-5 propose full genomes and twelve-word causal claims; the commentators are the same model reading real results. Where it goes wrong: it never sees the simulator, so it proposes bodies that flip and numbers out of range; sanitize clamps, physics rejects, the notebook keeps the rejected claim with its delta so the next generation reads it. If the model is down, rule-based mutations stand in and are labelled.

### For the Cartesia judges
Voice is the broadcast. Vic and Lou are Cartesia Sonic voices (sonic-3.6) calling every heat from the actual results: the record, who flipped, which lineage overtook. Lines are synthesised during the replay through a server-side proxy (key never in the browser), cached per line, and played in order as the result card lands; speed and emotion are set per commentator. Accessibility and responsibility: every line is also on screen as text, voice has an on/off control, no microphone, no listener data. Known limits: about a second to first audio on a new line, English only, browser speech fallback.

### For the Spacetime judges
The room is the shared state between the stadium screen and every phone in the crowd. A TypeScript SpacetimeDB module holds the scoreboard, votes, lineage names and the judge's values; phones and the stadium write through reducers (cast, rename, judge, host) and the web node is stateless, reading public tables over SQL. Votes are transactional and agree across web nodes, which the in-memory room could not do on two Fly machines. Known limit: clients still poll the web node every two seconds instead of subscribing over WebSocket.

## The thirty seconds
"This is how chips and antibodies are starting to be designed: an AI proposes, a brutal verifier rejects most of it, and the survivors compound. We made it a sport. Six AI coaches breed a creature, physics is the only judge, the crowd sets the course from their phones, and the notebook shows every hypothesis that died. [Point at the counter.] Seventy hypotheses, fifty-eight rejected. That is the point."

## The three minutes
0:00 the thirty seconds · 0:30 a judge scans the QR, votes ice; the arena changes, the champion re-scores, the coaches react · 1:15 a heat: one flips, the card says rejected; the next heat a record, the cheer, the lineage grows · 2:00 the judge's table: drag posture up, watch the stable re-rank · 2:20 /bench: the two curves · 2:45 "swap the judge, keep the stadium".

## Ten answers
Why twice (new course, new values, a lineage to beat). What breaks at scale (model latency, already hidden behind the race). Different from keiwando's Evolution (the proposer writes hypotheses and reads a notebook; and a crowd). From RoboMorph (live, a stable, a plateau protocol, a baseline). What did the model actually do (every hypothesis on the ticker is its words). What did you build tonight (all of it; the creature idea is Karl Sims, 1994, credited). Hardest (making it stand). Would cut (voices, never the notebook). Who is it for (anyone who wants to see the method that designs the chips in their phone). What is simulated (creatures and course; the rest is measured).
