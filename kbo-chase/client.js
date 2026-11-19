import {setup,validateAction,applyAction} from "./logic.js";
const canvas=document.getElementById("game"),ctx=canvas.getContext("2d",{alpha:false});
const W=1200,H=675,HORIZON=245,FLOOR=675,PLAYER_FOOT=585;
const el=id=>document.getElementById(id);
const overlay=el("overlay"),toast=el("toast"),pauseBtn=el("pause"),soundBtn=el("sound");
const images={};
for(const key of ["tiger","lion"]){
 const img=new Image();img.src="./assets/"+key+"-sprite.webp";images[key]=img;
}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const stages=[
 {name:"RED ZONE",label:"광주 응원석",sky0:"#061b43",sky1:"#12558e",base:"#ec3654",lights:"#ffb4c1"},
 {name:"BLUE ZONE",label:"대구 응원석",sky0:"#072044",sky1:"#146ab2",base:"#2888fc",lights:"#b2dfff"},
 {name:"CHAMPIONSHIP",label:"결승전",sky0:"#171438",sky1:"#4b5aae",base:"#ffc857",lights:"#ffe2ad"}
];
let state=setup(["local"]),best=0;
try{best=Number(localStorage.getItem("kbo-chase-best-v4")||0)||0;}catch{}
let lastTime=0,accumulator=0,clock=0,renderX=600,lionRenderX=915,toastUntil=0,shake=0,flash=0;
let soundOn=false,audio=null,particles=[],hudTime=0,gamepadPrev={};
let eventIndex=-1,displayMode="ready",shownLevel=1;
function sfx(f=440,duration=.1,type="triangle",volume=.035){
 if(!soundOn)return;
 try{
  if(!audio)audio=new(window.AudioContext||window.webkitAudioContext)();
  if(audio.state==="suspended")audio.resume();
  const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;
  o.type=type;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(50,f*.65),t+duration);
  g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
  o.connect(g).connect(audio.destination);o.start(t);o.stop(t+duration+.01);
 }catch{}
}
function notif(text,duration=1.25){
 toast.textContent=text;toast.classList.add("show");toastUntil=clock+duration;
}
function emitDust(n=6){
 for(let k=0;k<n;k++){
  const angle=(k*2.4+state.frame*.57);
  particles.push({x:renderX+Math.sin(angle)*38,y:PLAYER_FOOT+Math.cos(angle)*5,
   vx:Math.sin(angle*1.8)*90,vy:-20-((k*43)%100),life:.36+((k*13)%21)/100,max:.56,r:2+((k*3)%5),color:k%2?"#ffe6aa":"#c4dcf8"});
 }
}
function emitSpark(x,y,n=18,color="#ffd75d"){
 for(let k=0;k<n;k++){
  const a=k*2.39996;
  particles.push({x,y,vx:Math.cos(a)*(70+k*8),vy:Math.sin(a)*(55+k*9)-40,life:.42+(k%5)*.08,max:.76,r:3+(k%3),color});
 }
}
function start(){
 state=applyAction(state,"local",{type:"start"});
 renderX=600;lionRenderX=915;accumulator=0;eventIndex=-1;shownLevel=1;
 particles=[];shake=0;flash=0;clock=0;
 displayMode="running";overlay.hidden=true;pauseBtn.textContent="Ⅱ";pauseBtn.ariaLabel="일시정지";canvas.focus();
 sfx(740,.16,"triangle",.06);refreshHud();
}
function end(){
 displayMode="over";const final=Math.floor(state.score+state.distance*3);
 if(final>best){best=final;try{localStorage.setItem("kbo-chase-best-v4",String(best))}catch{}}
 el("kicker").textContent="GAME OVER · 사자에게 붙잡혔다!";
 el("menuTitle").innerHTML="아이고, <span>잡혔다!</span>";
 el("menuDesc").innerHTML="도망 거리 <strong>"+Math.floor(state.distance).toLocaleString("ko-KR")+"m</strong> · 점수 <strong>"+final.toLocaleString("ko-KR")+"점</strong><br>최고 기록 <strong>"+best.toLocaleString("ko-KR")+"점</strong><br>다시 도전해서 사자와의 거리를 벌려 봐!";
 el("start").textContent="↻ 다시 도망치기";overlay.hidden=false;sfx(180,.38,"sawtooth",.09);
}
function setPause(){
 if(state.mode!=="running"&&state.mode!=="paused")return;
 state=applyAction(state,"local",{type:"pause"});
 displayMode=state.mode;
 if(state.mode==="paused"){
  el("kicker").textContent="TIME OUT";
  el("menuTitle").innerHTML="잠깐, <span>작전 타임!</span>";
  el("menuDesc").innerHTML="현재 <strong>"+Math.floor(state.distance)+"m</strong> 도망치는 중!<br>계속 달릴 준비가 됐다면 이어서 출발해.";
  el("start").textContent="▶ 이어서 달리기";overlay.hidden=false;pauseBtn.textContent="▶";
 }else{overlay.hidden=true;pauseBtn.textContent="Ⅱ";canvas.focus()}
}
function command(type){
 if(type==="start"){state.mode==="paused"?setPause():start();return}
 if(type==="pause"){setPause();return}
 if(state.mode==="ready"||state.mode==="over"){start();return;}
 if(state.mode==="paused"){setPause();return;}
 if(state.mode!=="running")return;
 const check=validateAction(state,"local",{type});
 if(!check.ok)return;
 const oldLane=state.lane;
 state=applyAction(state,"local",{type});
 if(type==="jump"){sfx(510,.13,"sine",.05);emitDust(7)}
 if(type==="slide"){sfx(260,.12,"triangle",.05);emitDust(8)}
 if((type==="left"||type==="right")&&oldLane!==state.lane){sfx(390,.065,"sine",.03);emitDust(3)}
}
el("start").addEventListener("click",()=>command("start"));
pauseBtn.addEventListener("click",()=>command("pause"));
soundBtn.addEventListener("click",()=>{
 soundOn=!soundOn;soundBtn.textContent=soundOn?"🔊":"🔇";soundBtn.ariaLabel=soundOn?"효과음 끄기":"효과음 켜기";if(soundOn)sfx(790,.1,"sine",.045);
});
const keys={
 ArrowLeft:"left",KeyA:"left",ArrowRight:"right",KeyD:"right",
 ArrowUp:"jump",Space:"jump",KeyW:"jump",ArrowDown:"slide",KeyS:"slide"
};
window.addEventListener("keydown",e=>{
 if(keys[e.code]){e.preventDefault();if(!e.repeat)command(keys[e.code]);}
 else if(e.code==="Escape"||e.code==="KeyP"){e.preventDefault();if(state.mode==="ready")start();else command("pause")}
 else if(e.code==="Enter" && (state.mode==="ready"||state.mode==="over")){e.preventDefault();start();}
});
for(const btn of document.querySelectorAll("[data-action]")){
 btn.addEventListener("pointerdown",e=>{
  e.preventDefault();btn.classList.add("pressed");btn.setPointerCapture?.(e.pointerId);command(btn.dataset.action);
 });
 for(const ev of ["pointerup","pointercancel","lostpointercapture"])btn.addEventListener(ev,()=>btn.classList.remove("pressed"));
}
let touch=null;
canvas.addEventListener("pointerdown",e=>{touch={x:e.clientX,y:e.clientY};});
canvas.addEventListener("pointerup",e=>{
 if(!touch)return;
 const dx=e.clientX-touch.x,dy=e.clientY-touch.y;touch=null;
 if(Math.max(Math.abs(dx),Math.abs(dy))>23){
  if(Math.abs(dx)>Math.abs(dy))command(dx>0?"right":"left");
  else command(dy>0?"slide":"jump");
 }else if(e.pointerType!=="mouse")command("jump");
});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&state.mode==="running")setPause()});
function readGamepad(){
 const pad=navigator.getGamepads?.()?.find(p=>p?.connected);if(!pad)return;
 const left=!!pad.buttons[14]?.pressed||pad.axes[0]<-.55;
 const right=!!pad.buttons[15]?.pressed||pad.axes[0]>.55;
 const jump=!!pad.buttons[0]?.pressed||!!pad.buttons[12]?.pressed;
 const slide=!!pad.buttons[1]?.pressed||!!pad.buttons[13]?.pressed;
 const pause=!!pad.buttons[9]?.pressed;
 for(const [key,on] of Object.entries({left,right,jump,slide,pause})){
  if(on&&!gamepadPrev[key])command(key);
  gamepadPrev[key]=on;
 }
}
const polygon=(pts,fill,stroke=null,line=1)=>{
 ctx.beginPath();pts.forEach((pt,i)=>i?ctx.lineTo(pt[0],pt[1]):ctx.moveTo(pt[0],pt[1]));ctx.closePath();
 if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke()}
};
function fillRound(x,y,w,h,r,fill,stroke=null,line=1){
 ctx.beginPath();ctx.roundRect(x,y,w,h,r);
 if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.lineWidth=line;ctx.strokeStyle=stroke;ctx.stroke()}
}
function roadHalf(y){return 130+clamp((y-HORIZON)/(FLOOR-HORIZON),0,1)*445}
function laneAt(lane,y){return 600+(lane-1)*(roadHalf(y)*2/3)}
function projectY(z){return HORIZON+(FLOOR-HORIZON)*Math.pow(clamp(z,0,1.22),1.65)}
function drawStadium(){
 const st=stages[(state.level-1)%3];
 const sky=ctx.createLinearGradient(0,0,0,440);
 sky.addColorStop(0,st.sky0);sky.addColorStop(.64,st.sky1);sky.addColorStop(1,"#76b6b6");
 ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
 const glow=ctx.createRadialGradient(600,10,1,600,120,530);
 glow.addColorStop(0,"#e5f7ff52");glow.addColorStop(1,"#6bdcff00");ctx.fillStyle=glow;ctx.fillRect(0,0,1200,375);
 // Stadium silhouette, three curved gallery levels.
 ctx.fillStyle="#07152f";ctx.beginPath();ctx.moveTo(0,191);ctx.bezierCurveTo(260,48,950,48,1200,191);ctx.lineTo(1200,317);ctx.lineTo(0,317);ctx.fill();
 ctx.strokeStyle="#7d9fc2";ctx.lineWidth=11;ctx.beginPath();ctx.moveTo(-20,188);ctx.quadraticCurveTo(600,24,1220,188);ctx.stroke();
 for(let r=0;r<6;r++){
  ctx.strokeStyle=r%2?"#233a64":"#142b51";ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(-30,190+r*20);ctx.quadraticCurveTo(600,70+r*26,1230,190+r*20);ctx.stroke();
 }
 // Red cheering stands vs Blue cheering stands.
 for(let i=0;i<510;i++){
  const x=(i*73.49+25)%1200,y=171+(i*41.67)%123;
  if(Math.abs(x-600)<125&&y<245)continue;
  ctx.globalAlpha=.55+(i%5)*.08;
  ctx.fillStyle=(i%8===0?"#ffeab3":x<600?"#fa5673":"#52afff");
  ctx.beginPath();ctx.arc(x,y+Math.sin(clock*2.3+i)*1.2,1.8+(i%3)*.4,0,Math.PI*2);ctx.fill();
  if(i%23===0){ctx.strokeStyle="#ffffff88";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y-2);ctx.lineTo(x+Math.sin(clock*5+i)*4,y-12);ctx.stroke();}
 }
 ctx.globalAlpha=1;
 // Banners, LED displays and dugouts.
 for(const side of [-1,1]){
  const x=side<0?18:750,w=430;
  fillRound(x,234,w,29,6,"#061c3d","#557fa3",2);
  ctx.save();ctx.beginPath();ctx.rect(x+4,238,w-8,22);ctx.clip();ctx.font="900 16px system-ui";ctx.textAlign="left";ctx.fillStyle=side<0?"#ff637c":"#68bdff";
  const msg=side<0?"⚾ KIA TIGERS · RED WAVE · FIGHTING · ":"⚡ SAMSUNG LIONS · BLUE WAVE · WIN · ";
  const off=(clock*61)%w;
  for(let j=-1;j<=2;j++)ctx.fillText(msg,x+j*w-off+20,254);
  ctx.restore();
  fillRound(side<0?40:1008,267,147,39,6,"#183051","#6e9abf",2);
  ctx.fillStyle=side<0?"#fc435e":"#52a8ff";ctx.fillRect((side<0?40:1008)+9,274,129,6);
  ctx.font="900 14px system-ui";ctx.fillStyle="#d6eafd";ctx.textAlign="center";ctx.fillText(side<0?"KIA TIGERS":"SL LIONS",side<0?113:1081,295);
 }
 // Central scoreboard. Keep the information readable at full-width.
 ctx.shadowColor="#0009";ctx.shadowBlur=16;
 fillRound(401,74,398,148,12,"#06142d","#7691ab",2);ctx.shadowBlur=0;
 fillRound(414,93,107,38,7,"#9c1836");fillRound(532,93,135,38,7,"#182c48");fillRound(679,93,106,38,7,"#0e5eb1");
 ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="900 20px system-ui";
 ctx.fillText("TIGERS",467,118);ctx.fillText("LIONS",732,118);
 ctx.fillStyle="#ffe391";ctx.font="1000 26px system-ui";ctx.fillText("VS",599,121);
 ctx.strokeStyle="#56729a";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(420,143);ctx.lineTo(781,143);ctx.stroke();
 ctx.font="900 14px monospace";ctx.textBaseline="middle";ctx.fillStyle="#e5eefc";
 for(let i=0;i<9;i++)ctx.fillText(String(i+1),451+i*37,161);
 ctx.font="800 12px system-ui";ctx.fillText("KBO MASCOT CHASE · 9TH INNING",600,185);
 ctx.font="900 15px system-ui";ctx.fillStyle=st.lights;ctx.fillText(st.name+" · "+st.label,600,205);
 ctx.textBaseline="alphabetic";
 // Floodlight towers
 for(const side of [-1,1]){
  const bx=side<0?82:1118;
  ctx.strokeStyle="#1b2b44";ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(bx,297);ctx.lineTo(bx,29);ctx.stroke();
  fillRound(bx-69,20,138,41,7,"#284161","#8cb7d4",2);
  for(let k=0;k<10;k++){ctx.shadowColor="#fffad8";ctx.shadowBlur=17;ctx.fillStyle=k%2?"#fff5c0":"#ecfbff";ctx.beginPath();ctx.arc(bx-58+k*13,40,5,0,Math.PI*2);ctx.fill();}
  ctx.shadowBlur=0;polygon([[bx-63,65],[bx+63,65],[bx+side*220,320],[bx-side*220,320]],"#f3ffff0a");
 }
 // Big green field and striped mowing.
 ctx.fillStyle="#215e49";ctx.fillRect(0,304,W,H-304);
 for(let r=0;r<11;r++){ctx.fillStyle=r%2?"#a9df6b1c":"#30b3821c";ctx.fillRect(0,304+r*36,1200,36)}
 for(let i=0;i<15;i++){const x=i*105-120;polygon([[x,307],[x+30,307],[x+370,675],[x+250,675]],"#d8e9a40a")}
 // Stadium banners & pennants
 for(let i=0;i<8;i++){
  const px=245+i*100;
  ctx.strokeStyle="#adc3df77";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px,218);ctx.lineTo(px+25,234);ctx.stroke();
  polygon([[px+25,234],[px+44,238],[px+27,249]],i%2?"#448ef3":"#f23b59");
 }
 if(state.level%3===0&&state.level>1){
  for(let i=0;i<30;i++){
   const x=(i*97+clock*13)%1200,y=25+(i*52+clock*22)%215;
   ctx.globalAlpha=.35+.2*Math.sin(clock*3+i);ctx.fillStyle=["#ffd950","#ff638b","#62b5ff","#ffffff"][i%4];
   ctx.save();ctx.translate(x,y);ctx.rotate(clock+i);ctx.fillRect(-2,-5,4,10);ctx.restore();
  }ctx.globalAlpha=1;
 }
}
function drawRoad(){
 const left=600-roadHalf(675),right=600+roadHalf(675);
 const dirt=ctx.createLinearGradient(0,HORIZON,0,H);dirt.addColorStop(0,"#a77454");dirt.addColorStop(.5,"#c58e60");dirt.addColorStop(1,"#a96648");
 polygon([[470,HORIZON],[730,HORIZON],[right,FLOOR],[left,FLOOR]],dirt,"#edcfaa",7);
 // Perspective bands move rapidly towards camera; actual runner uses independent frames.
 for(let i=0;i<16;i++){
  const z=(i/12+(clock*(state.mode==="running"?.49:.03))%1.3)%1.13,z1=clamp(z,0,1),z2=clamp(z+.028,0,1);
  if(z1>=1)continue;const y1=projectY(z1),y2=projectY(z2);
  polygon([[600-roadHalf(y1),y1],[600+roadHalf(y1),y1],[600+roadHalf(y2),y2],[600-roadHalf(y2),y2]],"#57362b22");
 }
 ctx.strokeStyle="#fff7e1a3";ctx.lineWidth=3;
 for(let div=1;div<=2;div++){
  for(let i=0;i<23;i++){
   const z=(i/21+(clock*(state.mode==="running"?.46:.015))%1.2)%1.2;if(z>=1)continue;
   const y1=projectY(z),y2=projectY(Math.min(1,z+.044));
   const offset=div===1?-1/3:1/3;
   ctx.beginPath();ctx.moveTo(600+offset*roadHalf(y1)*2,y1);ctx.lineTo(600+offset*roadHalf(y2)*2,y2);
   ctx.lineWidth=1.3+z*5.8;ctx.stroke();
  }
 }
 for(let i=0;i<16;i++){
  const z=(i/16+(clock*(state.mode==="running"?.78:.025))%1)%1,y=projectY(z),half=roadHalf(y),len=15+z*51;
  ctx.strokeStyle="rgba(217,255,199,"+(.07+z*.18)+")";ctx.lineWidth=1+z*3;
  ctx.beginPath();ctx.moveTo(600-half-23-z*90,y);ctx.lineTo(600-half-23-z*90-len,y+len*.3);ctx.stroke();
  ctx.beginPath();ctx.moveTo(600+half+23+z*90,y);ctx.lineTo(600+half+23+z*90+len,y+len*.3);ctx.stroke();
 }
}
function drawTrackside(){
 const move=clock*(state.mode==="running"?.39:.025);
 for(let i=0;i<10;i++){
  const z=(i/10+move)%1.07;if(z<.12||z>.98)continue;
  const y=projectY(z),half=roadHalf(y),size=.25+z*.95;
  for(const side of [-1,1]){
   const x=600+side*(half+17+z*30);
   ctx.save();ctx.translate(x,y);ctx.scale(size,size);
   ctx.strokeStyle="#213555";ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-103);ctx.stroke();
   ctx.strokeStyle="#e3f0ff";ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-13,-100);ctx.lineTo(13,-100);ctx.stroke();
   if(i%3===0){
    fillRound(-56,-141,112,40,6,side<0?"#af1939":"#175aa6","#d8e8ff",2);
    ctx.fillStyle="#fff";ctx.font="900 12px system-ui";ctx.textAlign="center";ctx.fillText(side<0?"TIGERS!":"LIONS!",0,-117);
   }
   ctx.restore();
  }
 }
}
function drawShadow(x,y,w,alpha=.27){
 ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle="#142132";ctx.beginPath();ctx.ellipse(x,y,w,11,0,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawSprite(name,x,foot,h,f,lean=0,slide=false,alpha=1){
 const img=images[name];
 if(!img.complete||!img.naturalWidth)return;
 const frame=((Math.floor(f)%8)+8)%8;
 const sx=(frame%4)*300,sy=Math.floor(frame/4)*360;
 const w=h*300/360;
 ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,foot);ctx.rotate(lean);
 if(slide){ctx.translate(0,7);ctx.scale(1.22,.68)}
 ctx.drawImage(img,sx,sy,300,360,-w/2,-h,w,h);
 ctx.restore();
}
function drawRunners(){
 const gap=state.gap;
 const charFrame=state.frame*.29;
 const jumpProgress=state.jump>0?(45-state.jump)/45:0;
 const jump=state.jump>0?Math.sin(jumpProgress*Math.PI)*127:0;
 const danger=clamp((72-gap)/57,0,1);
 // Lion sits behind the tiger, nearer the camera and laterally displaced.
 // Visual gap always leaves readable air between their silhouettes.
 const lionFoot=635-27*danger+Math.abs(Math.sin(clock*15+.9))*3.5;
 const lionH=171+19*danger;
 drawShadow(lionRenderX,lionFoot+6,53,.18+.11*danger);
 if(gap<27){ctx.save();ctx.shadowBlur=20;ctx.shadowColor="#fa3654";}
 drawSprite("lion",lionRenderX,lionFoot,lionH,charFrame*1.04+3.0,Math.sin(clock*4)*.018);
 if(gap<27)ctx.restore();
 if(gap<36){ctx.save();ctx.translate(lionRenderX,lionFoot-lionH);
   ctx.strokeStyle="#ff365b";ctx.lineWidth=4;ctx.shadowColor="#ff365b";ctx.shadowBlur=10;
   for(let i=0;i<3;i++){const ang=clock*7+i*Math.PI*2/3;ctx.beginPath();ctx.moveTo(Math.cos(ang)*48,Math.sin(ang)*29);ctx.lineTo(Math.cos(ang)*65,Math.sin(ang)*39);ctx.stroke();}
   ctx.restore();
 }
 drawShadow(renderX,PLAYER_FOOT+7,77*(1-jump/180),.30-jump/1000);
 if(state.boost>0){
  ctx.save();ctx.strokeStyle="#ffe064";ctx.lineWidth=6;ctx.shadowColor="#ffc247";ctx.shadowBlur=22;ctx.globalAlpha=.47+Math.sin(clock*13)*.13;
  ctx.beginPath();ctx.ellipse(renderX,PLAYER_FOOT-jump-111,110,129,0,0,Math.PI*2);ctx.stroke();ctx.restore();
 }
 const fading=state.invuln>0&&Math.floor(state.frame/5)%2===0;
 const lean=clamp((laneAt(state.lane,PLAYER_FOOT)-renderX)*.00028,-.13,.13)+Math.sin(clock*7)*.006;
 drawSprite("tiger",renderX,PLAYER_FOOT-jump,226,charFrame+.3,lean,state.slide>0,fading?.50:1);
 if(jump>32){ctx.save();ctx.fillStyle="#fff3b7";ctx.shadowColor="#001c42";ctx.shadowBlur=10;ctx.font="900 23px system-ui";ctx.textAlign="center";ctx.fillText("JUMP!",renderX,PLAYER_FOOT-jump-233);ctx.restore()}
 if(state.slide>0){ctx.save();ctx.fillStyle="#b2ebff";ctx.shadowColor="#001c42";ctx.shadowBlur=10;ctx.font="900 23px system-ui";ctx.textAlign="center";ctx.fillText("SLIDE!",renderX,PLAYER_FOOT-156);ctx.restore()}
}
function drawBaseball(x,y,r){
 ctx.fillStyle="#fff9eb";ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle="#df3154";ctx.lineWidth=2;ctx.beginPath();ctx.arc(x-r*.8,y,r*.88,-1.15,1.15);ctx.moveTo(x+r*.8,y-r*.76);ctx.arc(x+r*.8,y,r*.88,2,4.3);ctx.stroke();
}
function drawObstacle(o){
 if(o.z<0)return;
 const z=clamp(o.z,0,1.15),y=projectY(z),x=laneAt(o.lane,y),scale=.23+z*1.15;
 const high=o.type==="banner"||o.type==="net",gold=o.type==="goldball";
 ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
 drawShadow(0,2,47,gold?.16:.27);
 if(gold){
  const float=Math.sin(clock*5+o.id)*9;
  ctx.save();ctx.translate(0,-80+float);ctx.shadowBlur=24;ctx.shadowColor="#ffeb84";ctx.fillStyle="#f8b92f";ctx.beginPath();ctx.arc(0,0,43,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.strokeStyle="#fff3a2";ctx.lineWidth=5;ctx.stroke();ctx.fillStyle="#ffe4a6";ctx.font="1000 33px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("★",0,2);ctx.restore();
 }else if(o.type==="helmet"){
  ctx.save();ctx.translate(0,-34);
  ctx.fillStyle="#df2748";ctx.beginPath();ctx.arc(0,0,39,Math.PI,Math.PI*2);ctx.lineTo(40,20);ctx.lineTo(-40,20);ctx.closePath();ctx.fill();
  fillRound(-47,10,98,16,6,"#b51d37","#f6b0bb",2);
  ctx.fillStyle="#0c2348";ctx.beginPath();ctx.arc(-18,0,14,Math.PI,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#ffeaf0";ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(25,-20);ctx.lineTo(44,2);ctx.stroke();
  ctx.restore();
 }else if(o.type==="batbag"){
  ctx.save();ctx.translate(0,-31);
  ctx.lineWidth=10;ctx.strokeStyle="#dd9b52";ctx.beginPath();ctx.moveTo(-22,-77);ctx.lineTo(-29,-28);ctx.moveTo(18,-83);ctx.lineTo(5,-28);ctx.stroke();
  ctx.lineWidth=5;ctx.strokeStyle="#693a24";ctx.beginPath();ctx.moveTo(-21,-78);ctx.lineTo(-26,-55);ctx.moveTo(18,-83);ctx.lineTo(12,-61);ctx.stroke();
  fillRound(-50,-43,100,56,12,"#243b61","#d6e6f7",3);fillRound(-45,-40,90,17,8,"#eb3e60");
  ctx.fillStyle="#fff";ctx.font="900 17px system-ui";ctx.textAlign="center";ctx.fillText("BAT",0,-2);
  ctx.restore();
 }else if(o.type==="ballcart"){
  ctx.save();ctx.translate(0,-40);
  fillRound(-53,-59,106,68,6,"#47668a","#ebf5ff",3);
  ctx.strokeStyle="#d5e5ff88";ctx.lineWidth=3;
  for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(i*17,-54);ctx.lineTo(i*17,-1);ctx.stroke()}
  for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(-50,-50+i*16);ctx.lineTo(50,-50+i*16);ctx.stroke()}
  for(let i=0;i<7;i++)drawBaseball(-40+(i%4)*25,-52+Math.floor(i/4)*18,11);
  ctx.fillStyle="#24374e";for(const ox of [-38,38]){ctx.beginPath();ctx.arc(ox,14,11,0,Math.PI*2);ctx.fill()}ctx.restore();
 }else if(o.type==="cooler"){
  ctx.save();ctx.translate(0,-38);
  fillRound(-57,-61,114,69,9,"#c62646","#f1d0d6",3);
  fillRound(-66,-68,132,24,7,"#e6eef7","#8da2b9",2);
  ctx.fillStyle="#ffeaf1";ctx.font="900 17px system-ui";ctx.textAlign="center";ctx.fillText("KBO",0,-12);ctx.restore();
 }else if(o.type==="banner"){
  ctx.strokeStyle="#172b51";ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(-63,0);ctx.lineTo(-63,-172);ctx.moveTo(63,0);ctx.lineTo(63,-172);ctx.stroke();
  fillRound(-101,-170,202,48,8,"#1b6eca","#edfbff",4);
  ctx.fillStyle="#fff";ctx.font="900 20px system-ui";ctx.textAlign="center";ctx.fillText("CHEER UP!",0,-140);
  ctx.fillStyle="#fff3a2";ctx.font="900 22px system-ui";ctx.fillText("⬇",0,-125);
 }else if(o.type==="net"){
  ctx.strokeStyle="#253c59";ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(-65,0);ctx.lineTo(-65,-182);ctx.lineTo(65,-182);ctx.lineTo(65,0);ctx.stroke();
  ctx.strokeStyle="#9ed5ff77";ctx.lineWidth=1.8;
  for(let i=-60;i<=60;i+=14){ctx.beginPath();ctx.moveTo(i,-178);ctx.lineTo(i,-125);ctx.stroke()}
  for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(-62,-175+i*13);ctx.lineTo(62,-175+i*13);ctx.stroke()}
  fillRound(-90,-188,180,23,5,"#0e5196","#e1f5ff",2);
  ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="900 14px system-ui";ctx.fillText("BATTING CAGE",0,-171);
 }
 if(!gold && z>.37 && z<.96){
  const hint=high?"↓ 슬라이딩":"↑ 점프";
  ctx.textAlign="center";ctx.font="950 16px system-ui";const hw=ctx.measureText(hint).width+22;
  fillRound(-hw/2,(high?-214:-117),hw,25,8,high?"#1463c9ed":"#bf2140e9","#fffdff",2);
  ctx.fillStyle="#fff";ctx.fillText(hint,0,(high?-195:-98));
 }
 ctx.restore();
}
function renderParticles(dt){
 for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=300*dt;p.life-=dt;ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()}
 ctx.globalAlpha=1;particles=particles.filter(p=>p.life>0);
}
function render(dt){
 ctx.save();
 if(shake>0){ctx.translate(Math.sin(clock*97)*shake,Math.cos(clock*79)*shake*.65);shake*=Math.pow(.03,dt);if(shake<.5)shake=0}
 drawStadium();drawRoad();drawTrackside();
 for(const o of state.obstacles)if(o.z>=0&&o.z<.9)drawObstacle(o);
 drawRunners();
 for(const o of state.obstacles)if(o.z>=.9&&o.z<1.2)drawObstacle(o);
 renderParticles(dt);
 const v=ctx.createRadialGradient(600,360,150,600,360,810);v.addColorStop(0,"#00000000");v.addColorStop(1,"#030c256b");ctx.fillStyle=v;ctx.fillRect(0,0,1200,675);
 if(state.gap<28&&state.mode==="running"){
  ctx.fillStyle="rgba(250,23,60,"+((.05+(28-state.gap)*.006)*(0.9+Math.sin(clock*10)*.1))+")";ctx.fillRect(0,0,W,H);
 }
 if(flash>0){ctx.fillStyle="rgba(255,47,72,"+(flash*.4)+")";ctx.fillRect(0,0,W,H);flash-=dt}
 ctx.restore();
}
function refreshHud(){
 el("dist").innerHTML=Math.floor(state.distance).toLocaleString("ko-KR")+"<em>m</em>";
 el("score").textContent=Math.floor(state.score+state.distance*3).toLocaleString("ko-KR");
 el("level").textContent=String(state.level).padStart(2,"0");
 const fill=el("gapFill");fill.style.width=clamp(state.gap,0,100)+"%";
 fill.style.background=state.gap<32?"linear-gradient(90deg,#c91b39,#ff5169)":state.gap<54?"linear-gradient(90deg,#ec513b,#ffcf66)":"linear-gradient(90deg,#ffae47,#ffe08d,#5de3b7)";
 el("gapLabel").textContent=state.gap<32?"💥 위험!":state.gap<54?"⚠️ 아슬아슬":"추격 중";
}
function processGameEvents(prev){
 if(state.lastEvent&&state.eventAt!==eventIndex&&state.eventAt>=0){
  eventIndex=state.eventAt;notif(state.lastEvent,state.lastEvent.includes("LEVEL")?1.9:1.2);
  if(state.lastEvent.includes("충돌")){shake=12;flash=.34;emitDust(16);sfx(185,.27,"sawtooth",.1);try{navigator.vibrate?.(90)}catch{}}
  else if(state.lastEvent.includes("황금")){emitSpark(laneAt(state.lane,PLAYER_FOOT),PLAYER_FOOT-170,19);sfx(940,.2,"sine",.07)}
  else if(state.lastEvent.includes("LEVEL")){emitSpark(600,315,30);sfx(900,.23,"triangle",.07)}
  else if(state.lastEvent.includes("스퍼트")){sfx(450,.3,"square",.06)}
 }
 if(state.level!==shownLevel)shownLevel=state.level;
 if(state.mode==="over"&&displayMode!=="over")end();
}
function stepGame(){
 if(state.mode!=="running")return;
 const before=state;
 const check=validateAction(before,"local",{type:"tick"});
 if(!check.ok)return;
 state=applyAction(before,"local",{type:"tick"});
 if(state.frame%4===0&&state.jump===0&&state.slide===0)emitDust(1);
 processGameEvents(before);
}
function tick(now){
 if(!lastTime)lastTime=now;
 const dt=clamp((now-lastTime)/1000,0,.05);lastTime=now;clock+=dt;
 readGamepad();
 if(state.mode==="running"){
  accumulator=Math.min(.1,accumulator+dt);
  for(let i=0;i<6&&accumulator>=1/60;i++){stepGame();accumulator-=1/60;}
  const target=laneAt(state.lane,PLAYER_FOOT);
  renderX+=(target-renderX)*Math.min(1,dt*13);
  const side=state.lane===2?-1:1;
  const chaseTarget=clamp(renderX+side*(316-142*clamp((72-state.gap)/57,0,1)),125,1075);
  lionRenderX+=(chaseTarget-lionRenderX)*Math.min(1,dt*2.1);
 }
 if(clock>toastUntil)toast.classList.remove("show");
 if(now-hudTime>50){refreshHud();hudTime=now}
 render(dt);
 requestAnimationFrame(tick);
}
refreshHud();requestAnimationFrame(tick);
