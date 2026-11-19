/**
 * KBO MASCOT CHASE — deterministic 60 Hz single-player rules.
 * Every move returns a fresh JSON-serializable state.
 * Copied to public/logic.js so the browser runs the same pure engine offline.
 */
export const meta = { game: "호랑아, 도망쳐!", minPlayers: 1, maxPlayers: 1 };
const FRAMES = 60;
const TYPES = ["helmet","batbag","ballcart","cooler","banner","net"];
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
const random = (seed) => {
  const next=(Math.imul(seed,1664525)+1013904223)>>>0;
  return [next,next/4294967296];
};
const initial = () => ({
  mode:"ready", frame:0, lane:1, laneCool:0, distance:0, score:0,
  level:1, gap:82, jump:0, slide:0, invuln:0, boost:0,
  spawnTimer:65, powerTimer:315, seed:31415926,
  obstacles:[], nextId:1, dodged:0, combo:0,
  hits:0, lastEvent:"", eventAt:-9999
});
export function setup(players) { return {...initial(),playerId:players[0] ?? "player"}; }
export function validateAction(state,playerId,action) {
  if(!state || !action || typeof action.type!=="string") return {ok:false,error:"invalid action"};
  if(playerId!==state.playerId) return {ok:false,error:"not your run"};
  if(!["start","left","right","jump","slide","pause","tick","reset"].includes(action.type)) return {ok:false,error:"unknown command"};
  if(action.type==="reset" || action.type==="start") return {ok:true};
  if(action.type==="pause") return {ok:state.mode==="running"||state.mode==="paused",error:"not running"};
  if(action.type==="tick")return {ok:state.mode==="running",error:"not running"};
  if(state.mode!=="running")return {ok:false,error:"start the race first"};
  if(["left","right"].includes(action.type) && state.laneCool>0) return {ok:false,error:"lane cooldown"};
  if(action.type==="jump" && (state.jump>0||state.slide>0))return {ok:false,error:"already moving"};
  if(action.type==="slide" && (state.jump>0||state.slide>0))return {ok:false,error:"already moving"};
  return {ok:true};
}
export function applyAction(state,playerId,action) {
  const type=action.type;
  if(type==="reset" || type==="start") return {...initial(),playerId,mode:"running"};
  if(type==="pause")return {...state,mode:state.mode==="running"?"paused":"running"};
  if(type==="left")return {...state,lane:Math.max(0,state.lane-1),laneCool:7};
  if(type==="right")return {...state,lane:Math.min(2,state.lane+1),laneCool:7};
  if(type==="jump")return {...state,jump:45};
  if(type==="slide")return {...state,slide:36};
  if(type!=="tick")return state;

  const f=state.frame+1;
  const level=1+Math.floor(state.distance/300);
  const speed=42+Math.min(8,level-1)*4.6;
  let distance=state.distance+(speed+(state.boost>0?13:0))/FRAMES;
  const nextLevel=1+Math.floor(distance/300);
  let gap=clamp(state.gap+(state.gap<89?.035:-.009),0,100);
  // A periodic fair warning burst creates pressure without teleporting the pursuer.
  const sprint=(f%720>=510 && f%720<675);
  if(sprint)gap=clamp(gap-.105,0,100);
  let seed=state.seed,spawnTimer=state.spawnTimer-1,powerTimer=state.powerTimer-1;
  let nextId=state.nextId,obstacles=[...state.obstacles];
  let score=state.score,combo=state.combo,dodged=state.dodged,hits=state.hits;
  let boost=Math.max(0,state.boost-1),invuln=Math.max(0,state.invuln-1);
  let jump=Math.max(0,state.jump-1),slide=Math.max(0,state.slide-1);
  let lastEvent=state.lastEvent,eventAt=state.eventAt;
  if(nextLevel!==state.level){lastEvent="🏟️ 응원 구역 변경! LEVEL "+nextLevel;eventAt=f;}
  if(sprint && f%720===510){lastEvent="⚠️ 백사자 스퍼트!";eventAt=f;}
  if(spawnTimer<=0){
    let n,p;[seed,p]=random(seed);n=Math.floor(p*3);
    let k;[seed,k]=random(seed);const ty=TYPES[Math.floor(k*TYPES.length)];
    obstacles.push({id:nextId++,lane:n,z:-.015,type:ty,judged:false});
    if(nextLevel>=3){
      let chance;[seed,chance]=random(seed);
      if(chance<.22){let r;[seed,r]=random(seed);let ty2;[seed,ty2]=random(seed);obstacles.push({id:nextId++,lane:(n+1+Math.floor(r*2))%3,z:-.015,type:TYPES[Math.floor(ty2*TYPES.length)],judged:false})}
    }
    let variation;[seed,variation]=random(seed);
    spawnTimer=Math.max(71,99-nextLevel*4)+Math.floor(variation*19);
  }
  if(powerTimer<=0){
    let r;[seed,r]=random(seed);
    let lanes=[0,1,2].filter(n=>!obstacles.some(o=>o.lane===n && o.z<.22));
    if(!lanes.length)lanes=[0,1,2];
    obstacles.push({id:nextId++,lane:lanes[Math.floor(r*lanes.length)],z:-.015,type:"goldball",judged:false});
    let wait;[seed,wait]=random(seed);powerTimer=320+Math.floor(wait*155);
  }
  const dz=.0065+Math.min(nextLevel-1,10)*.00032+(boost>0?.00036:0);
  const jumpProgress=jump>0?(45-jump)/45:1;
  const airborne=jump>0 && Math.sin(jumpProgress*Math.PI)>0.36;
  const ducking=slide>0 && slide<=31;
  obstacles=obstacles.map(o=>{
    const z=o.z+dz;
    if(o.judged || z<.89 || z>1.2)return {...o,z};
    if(o.lane!==state.lane){return {...o,z,judged:true}};
    if(o.type==="goldball"){
      score+=225;gap=clamp(gap+23,0,94);boost=120;lastEvent="✨ 황금 야구공! 거리 벌리기";eventAt=f;
    }else if(((o.type==="banner"||o.type==="net") && ducking) || (!["banner","net"].includes(o.type)&&airborne)){
      score+=75+Math.min(4,combo)*15;combo++;dodged++;gap=clamp(gap+2.8,0,92);
      if(combo%4===0){score+=125;lastEvent="🔥 "+combo+"연속 회피!";eventAt=f;}
    }else if(invuln<=0){
      hits++;combo=0;gap=Math.max(0,gap-27);invuln=54;lastEvent="💥 장애물 충돌! 사자가 따라온다!";eventAt=f;
    }
    return {...o,z,judged:true};
  }).filter(o=>o.z<1.22);
  const mode=gap<=0?"over":"running";
  if(mode==="over"){lastEvent="🦁 백사자에게 잡혔다!";eventAt=f;}
  return {...state,mode,frame:f,level:nextLevel,distance,gap,laneCool:Math.max(0,state.laneCool-1),jump,slide,invuln,boost,spawnTimer,powerTimer,seed,obstacles,nextId,score,combo,dodged,hits,lastEvent,eventAt};
}
export function isGameOver(state) {return state.mode==="over"?{over:true,winner:null}:{over:false};}
export function viewFor(state,playerId) {return playerId===state.playerId?{...state}:{mode:state.mode,score:state.score,distance:state.distance,level:state.level};}
