/* Evolution Stadium physics: creatures from genomes, a deterministic judge, mutation, crossover, gait labels, lineage names.
   Shared by the browser (global CANNON) and node tests (require('cannon')). */
(function(root){
const CANNON = root.CANNON || (typeof require==='function' ? require('cannon') : null);
const LIM={legs:[2,6],w:[0.5,2.0],h:[0.2,0.8],d:[0.3,1.2],mass:[2,10],up:[0.25,1.1],lo:[0.25,1.1],r:[0.05,0.18],amp:[0,10],f:[0.3,2.5],ph:[-3.2,3.2],x:[-1,1],z:[-1,1]};
let MOTOR=200;const SECS=7;
const cl=(v,[a,b])=>Math.max(a,Math.min(b,Number.isFinite(+v)?+v:a));const r2=x=>Math.round(x*100)/100;
function sanitize(g){const t=g&&g.torso||{};const legs=Array.isArray(g&&g.legs)?g.legs:[];
  const out={torso:{w:cl(t.w,LIM.w),h:cl(t.h,LIM.h),d:cl(t.d,LIM.d),mass:cl(t.mass,LIM.mass)},legs:[]};
  for(const l of legs.slice(0,LIM.legs[1])){if(!l||typeof l!=='object')continue;const j=k=>({amp:cl((l[k]||{}).amp,LIM.amp),f:cl((l[k]||{}).f,LIM.f),ph:cl((l[k]||{}).ph,LIM.ph)});
    out.legs.push({x:cl(l.x,LIM.x),z:cl(l.z,LIM.z),up:cl(l.up,LIM.up),lo:cl(l.lo,LIM.lo),r:cl(l.r,LIM.r),hip:j('hip'),knee:j('knee')})}
  while(out.legs.length<LIM.legs[0])out.legs.push({x:out.legs.length?-0.6:0.6,z:0.8,up:0.5,lo:0.5,r:0.08,hip:{amp:3,f:1.0,ph:0},knee:{amp:2,f:1.0,ph:1.2}});
  return out}
function terrainBodies(world,kind,mat){const bodies=[];const add=(shape,pos)=>{const b=new CANNON.Body({mass:0,material:mat});b.addShape(shape);b.position.set(pos[0],pos[1],pos[2]);world.addBody(b);bodies.push(b);return b};
  if(kind==='gap'){add(new CANNON.Box(new CANNON.Vec3(6,0.5,20)),[0,-0.5,0]);add(new CANNON.Box(new CANNON.Vec3(60,0.5,20)),[6+1.0+60,-0.5,0]);}
  else if(kind==='stairs'){add(new CANNON.Box(new CANNON.Vec3(60,0.5,20)),[0,-0.5,0]);for(let i=0;i<14;i++)add(new CANNON.Box(new CANNON.Vec3(0.6,0.5+0.12*(i+1),20)),[3+i*1.2,-0.5,0]);}
  else{add(new CANNON.Box(new CANNON.Vec3(80,0.5,20)),[40,-0.5,0]);}
  return bodies}
function build(world,g,x0,z0,mat){const t=g.torso;const bodies=[],joints=[];
  const torso=new CANNON.Body({mass:t.mass,material:mat});torso.addShape(new CANNON.Box(new CANNON.Vec3(t.w/2,t.h/2,t.d/2)));
  const legH=Math.max(...g.legs.map(l=>l.up+l.lo))+0.05;torso.position.set(x0,legH+t.h/2,z0);torso.angularDamping=0.6;torso.linearDamping=0.02;world.addBody(torso);bodies.push(torso);
  const legs=[];
  for(const l of g.legs){const ax=l.x*t.w/2,az=l.z*t.d/2;
    const up=new CANNON.Body({mass:0.6,material:mat});up.addShape(new CANNON.Box(new CANNON.Vec3(l.r,l.up/2,l.r)));up.position.set(x0+ax,torso.position.y-t.h/2-l.up/2,z0+az);up.angularDamping=0.6;world.addBody(up);bodies.push(up);
    const lo=new CANNON.Body({mass:0.4,material:mat});lo.addShape(new CANNON.Box(new CANNON.Vec3(l.r,l.lo/2,l.r)));lo.addShape(new CANNON.Box(new CANNON.Vec3(l.r*2.2,0.04,l.r*1.6)),new CANNON.Vec3(0,-l.lo/2,0));lo.position.set(x0+ax,up.position.y-l.up/2-l.lo/2,z0+az);lo.angularDamping=0.6;world.addBody(lo);bodies.push(lo);
    const hip=new CANNON.HingeConstraint(torso,up,{pivotA:new CANNON.Vec3(ax,-t.h/2,az),axisA:new CANNON.Vec3(0,0,1),pivotB:new CANNON.Vec3(0,l.up/2,0),axisB:new CANNON.Vec3(0,0,1),maxForce:1e4});
    const knee=new CANNON.HingeConstraint(up,lo,{pivotA:new CANNON.Vec3(0,-l.up/2,0),axisA:new CANNON.Vec3(0,0,1),pivotB:new CANNON.Vec3(0,l.lo/2,0),axisB:new CANNON.Vec3(0,0,1),maxForce:1e4});
    for(const j of [hip,knee]){j.collideConnected=false;j.enableMotor();j.setMotorMaxForce(MOTOR);world.addConstraint(j);joints.push(j)}
    legs.push({hip,knee,g:l})}
  return {bodies,joints,torso,legs,genome:g}}
function drive(c,t){for(const l of c.legs){l.hip.setMotorSpeed(l.g.hip.amp*Math.sin(2*Math.PI*l.g.hip.f*t+l.g.hip.ph));l.knee.setMotorSpeed(l.g.knee.amp*Math.sin(2*Math.PI*l.g.knee.f*t+l.g.knee.ph))}}
function makeWorld(kind){const world=new CANNON.World();world.gravity.set(0,-9.82,0);world.broadphase=new CANNON.SAPBroadphase(world);world.solver.iterations=12;world.defaultContactMaterial.friction=0.9;
  const mat=new CANNON.Material('m');world.addContactMaterial(new CANNON.ContactMaterial(mat,mat,{friction:kind==='ice'?0.04:0.9,restitution:0.0}));world.terrain=terrainBodies(world,kind,mat);world.mat=mat;return world}
/* The judge. Returns measurements only; score() turns them into a number under the current values. */
function evaluate(g,kind,secs){g=sanitize(g);secs=secs||SECS;const world=makeWorld(kind);const c=build(world,g,0,0,world.mat);const dt=1/60,n=Math.round(secs/dt);
  const standH=c.torso.position.y;let upSteps=0;const up=new CANNON.Vec3(0,1,0),uv=new CANNON.Vec3();const ys=[];
  for(let i=0;i<n;i++){drive(c,i*dt);world.step(dt);c.torso.quaternion.vmult(up,uv);if(uv.y>0.6&&c.torso.position.y>standH*0.55)upSteps++;if(i>=n*0.3)ys.push(c.torso.position.y)}
  c.torso.quaternion.vmult(up,uv);const flipped=uv.y<0.2;const fell=c.torso.position.y<-2;const upright=upSteps/n;
  const mean=ys.reduce((a,b)=>a+b,0)/ys.length;const std=Math.sqrt(ys.reduce((a,b)=>a+(b-mean)*(b-mean),0)/ys.length);
  const energy=g.legs.reduce((a,l)=>a+l.hip.amp+l.knee.amp,0);
  let raw=c.torso.position.x;if(fell)raw=Math.min(raw,0);
  return {raw:r2(raw),upright:r2(upright),flipped,fell,bounce:r2(std),energy:r2(energy),secs,legs:g.legs.length,x:c.torso.position.x,y:c.torso.position.y}}
function score(e,v){v=Object.assign({speed:1,posture:1,economy:0},v||{});let s=e.raw;const pen=Math.min(0.95,0.65*v.posture)*(1-e.upright);s=s*(1-pen)*v.speed;if(e.flipped)s*=0.3;if(e.fell)s=Math.min(s,0);s-=0.04*v.economy*e.energy;return r2(s)}
function gait(e){if(e.flipped||e.fell)return'tumble';if(Math.abs(e.raw)<0.15)return'statue';if(e.upright<0.4)return'crawl';if(e.bounce>0.12)return'hop';if(e.raw/(e.secs||SECS)<0.12)return'shuffle';return'walk'}
function mutate(g,rng){g=JSON.parse(JSON.stringify(sanitize(g)));const r=rng||Math.random;const ops=['gait','gait','gait','limb','limb','torso','addleg','removeleg','mirror'];const op=ops[Math.floor(r()*ops.length)];const L=g.legs[Math.floor(r()*g.legs.length)];const jit=(v,[a,b],k)=>cl(v+(r()*2-1)*(b-a)*k,[a,b]);
  let why='';
  if(op==='gait'){const j=r()<.5?'hip':'knee';const k=['amp','f','ph'][Math.floor(r()*3)];L[j][k]=jit(L[j][k],LIM[k],.25);why=`nudge one leg's ${j} ${k}`}
  else if(op==='limb'){const k=r()<.5?'up':'lo';const before=L[k];L[k]=jit(L[k],LIM[k],.3);why=`${L[k]>before?'longer':'shorter'} ${k==='up'?'thigh':'shin'} on one leg`}
  else if(op==='torso'){const k=['w','h','d','mass'][Math.floor(r()*4)];g.torso[k]=jit(g.torso[k],LIM[k],.3);why=`change torso ${k}`}
  else if(op==='addleg'&&g.legs.length<6){g.legs.push({...JSON.parse(JSON.stringify(L)),x:cl(L.x+(r()-.5),LIM.x),z:-L.z});why='grow an extra leg'}
  else if(op==='removeleg'&&g.legs.length>2){g.legs.splice(g.legs.indexOf(L),1);why='drop a leg'}
  else if(op==='mirror'){for(const l of g.legs){if(l.z<0)l.hip.ph=cl(l.hip.ph+Math.PI,LIM.ph)}why='put the two sides half a cycle apart'}
  else{L.hip.f=jit(L.hip.f,LIM.f,.3);why='change the stride rate'}
  return {genome:sanitize(g),why}}
function crossover(a,b){a=sanitize(a);b=sanitize(b);const g={torso:{w:(a.torso.w+b.torso.w)/2,h:(a.torso.h+b.torso.h)/2,d:(a.torso.d+b.torso.d)/2,mass:(a.torso.mass+b.torso.mass)/2},legs:a.legs.map((l,i)=>{const o=b.legs[i%b.legs.length];return {...l,hip:{...o.hip},knee:{...o.knee}}})};return {genome:sanitize(g),why:'legs from one parent, gait from the other'}}
const SEED={torso:{w:1.2,h:0.35,d:0.8,mass:4},legs:[
 {x:0.75,z:0.9,up:0.45,lo:0.45,r:0.08,hip:{amp:2.5,f:1.0,ph:0},knee:{amp:1.5,f:1.0,ph:1.2}},
 {x:0.75,z:-0.9,up:0.45,lo:0.45,r:0.08,hip:{amp:2.5,f:1.0,ph:3.14},knee:{amp:1.5,f:1.0,ph:-1.9}},
 {x:-0.75,z:0.9,up:0.45,lo:0.45,r:0.08,hip:{amp:2.5,f:1.0,ph:3.14},knee:{amp:1.5,f:1.0,ph:-1.9}},
 {x:-0.75,z:-0.9,up:0.45,lo:0.45,r:0.08,hip:{amp:2.5,f:1.0,ph:0},knee:{amp:1.5,f:1.0,ph:1.2}}]};
const GENUS=['Ambulor','Saltator','Reptans','Cursor','Vacillans','Gradiens','Titubans','Properans'];const SPECIES=['viridis','rubra','caerulea','aurea','nocturna','ferox','minor','major','lenta','vulgaris'];
function latinName(i){return GENUS[i%GENUS.length]+' '+SPECIES[(i*3+1)%SPECIES.length]}
const api={LIM,SECS,sanitize,makeWorld,build,drive,evaluate,score,gait,mutate,crossover,SEED,latinName,setMotor:v=>{MOTOR=v}};
if(typeof module!=='undefined')module.exports=api;root.SIM=api;
})(typeof window!=='undefined'?window:globalThis);
