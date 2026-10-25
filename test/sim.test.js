const assert=require('assert');const S=require('../public/sim.js');
const e=S.evaluate(S.SEED,'flat');assert(e.upright>0.9,'seed stands: '+JSON.stringify(e));assert(!e.flipped,'seed does not flip');
assert.deepStrictEqual(S.evaluate(S.SEED,'flat'),e,'deterministic');
const pe={raw:1,upright:1,flipped:false,fell:false,energy:10};assert(S.score(pe,{speed:2})>S.score(pe,{speed:1}),'speed weight scales');assert(S.score({raw:1,upright:0.2,flipped:false,fell:false,energy:10},{posture:1})<S.score({raw:1,upright:1,flipped:false,fell:false,energy:10},{posture:1}),'posture penalises');
assert.strictEqual(S.gait({raw:0,upright:1,flipped:true,fell:false,bounce:0,secs:7}),'tumble');assert.strictEqual(S.gait({raw:2,upright:1,flipped:false,fell:false,bounce:0.02,secs:7}),'walk');assert.strictEqual(S.gait({raw:2,upright:1,flipped:false,fell:false,bounce:0.2,secs:7}),'hop');assert.strictEqual(S.gait({raw:1,upright:0.2,flipped:false,fell:false,bounce:0.02,secs:7}),'crawl');
let r=(()=>{let a=5;return()=>{a=(a*1664525+1013904223)>>>0;return a/4294967296}})();let champ={g:S.SEED,s:S.score(e)};
for(let gen=0;gen<8;gen++){for(let k=0;k<6;k++){const m=S.mutate(champ.g,r);const s=S.score(S.evaluate(m.genome,'flat'));assert(m.genome.legs.length>=2&&m.genome.legs.length<=6);if(s>champ.s)champ={g:m.genome,s}}}
assert(champ.s>e.raw,'evolution improves on the seed: '+champ.s);
const x=S.crossover(S.SEED,champ.g);assert(x.genome.legs.length===4);assert(S.sanitize({torso:{w:99},legs:'nope'}).legs.length===2,'sanitize fills');
assert(S.latinName(3).includes(' '));console.log('sim tests ok · champion after 8 blind generations:',champ.s,'m');
