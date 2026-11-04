"use strict";
// Approved character artwork/expressions. Independent copies in both products.
// Animation epochs survive quota updates and DOM recreation; completion plays once.
(() => {
 const bodies={"claude": "M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949z", "codex": "M9.064 3.344a4.578 4.578 0 012.285-.312c1 .115 1.891.54 2.673 1.275.01.01.024.017.037.021a.09.09 0 00.043 0 4.55 4.55 0 013.046.275l.047.022.116.057a4.581 4.581 0 012.188 2.399c.209.51.313 1.041.315 1.595a4.24 4.24 0 01-.134 1.223.123.123 0 00.03.115c.594.607.988 1.33 1.183 2.17.289 1.425-.007 2.71-.887 3.854l-.136.166a4.548 4.548 0 01-2.201 1.388.123.123 0 00-.081.076c-.191.551-.383 1.023-.74 1.494-.9 1.187-2.222 1.846-3.711 1.838-1.187-.006-2.239-.44-3.157-1.302a.107.107 0 00-.105-.024c-.388.125-.78.143-1.204.138a4.441 4.441 0 01-1.945-.466 4.544 4.544 0 01-1.61-1.335c-.152-.202-.303-.392-.414-.617a5.81 5.81 0 01-.37-.961 4.582 4.582 0 01-.014-2.298.124.124 0 00.006-.056.085.085 0 00-.027-.048 4.467 4.467 0 01-1.034-1.651 3.896 3.896 0 01-.251-1.192 5.189 5.189 0 01.141-1.6c.337-1.112.982-1.985 1.933-2.618.212-.141.413-.251.601-.33.215-.089.43-.164.646-.227a.098.098 0 00.065-.066 4.51 4.51 0 01.829-1.615 4.535 4.535 0 011.837-1.388z"};
 const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
 function line(c,points,width=4){c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1)){if(p.length===4)c.quadraticCurveTo(...p);else c.lineTo(...p);}c.stroke();}
 function oval(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,Math.max(.3,ry),0,0,Math.PI*2);c.fill();}
 function buddy(c,t,waiting){
  const shell=c.createLinearGradient(20,5,80,95);shell.addColorStop(0,'#effcf7');shell.addColorStop(.5,'#fff');shell.addColorStop(1,'#b6e8d9');
  const green=c.createLinearGradient(25,25,80,92);green.addColorStop(0,'#00a98d');green.addColorStop(.55,'#0fbe83');green.addColorStop(1,'#78e44b');
  c.fillStyle=shell;
  const ear=waiting?Math.sin(t*2)*2:Math.sin(t)*.5;
  c.beginPath();c.moveTo(12,51);c.bezierCurveTo(5,27,6,9+ear,17,8+ear);c.bezierCurveTo(26,7,40,23,42,25);c.lineTo(65,23);c.bezierCurveTo(76,7,86,2-ear,90,10);c.bezierCurveTo(96,21,95,42,91,56);c.closePath();c.fill();
  c.fillStyle='#35d46e';c.beginPath();c.moveTo(16,39);c.quadraticCurveTo(13,14,19,15);c.quadraticCurveTo(26,15,36,28);c.fill();c.beginPath();c.moveTo(72,26);c.quadraticCurveTo(85,10,87,14);c.quadraticCurveTo(92,23,89,42);c.fill();
  c.fillStyle=shell;c.beginPath();c.moveTo(8,54);c.bezierCurveTo(11,29,31,22,52,23);c.bezierCurveTo(77,20,96,39,97,64);c.bezierCurveTo(101,85,79,95,52,95);c.bezierCurveTo(23,98,2,86,5,68);c.closePath();c.fill();
  c.fillStyle=green;c.beginPath();c.moveTo(17,56);c.bezierCurveTo(22,40,48,37,70,38);c.bezierCurveTo(88,38,92,50,92,66);c.bezierCurveTo(93,83,73,88,52,89);c.bezierCurveTo(28,90,12,82,13,69);c.quadraticCurveTo(13,62,17,56);c.fill();
 }
 // Normalize the painted silhouette, not the transparent SVG/canvas box.
 // Preserve each silhouette aspect ratio; match optical weight, never stretch a head.
 const artwork = new Map();
 function bodyImage(provider) {
  if(artwork.has(provider))return artwork.get(provider);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=160;
  const c=canvas.getContext('2d');c.scale(1.6,1.6);
  if(provider==='workbuddy')buddy(c,0,false);
  else {c.save();if(provider==='codex'){c.translate(7,7);c.scale(86/18.02,86/18.02);c.translate(-2.99,-2.99);const g=c.createLinearGradient(12,3,12,21);g.addColorStop(0,'#B1A7FF');g.addColorStop(.5,'#7A9DFF');g.addColorStop(1,'#5557ee');c.fillStyle=g;}else{c.translate(4,0);c.scale(92/24,100/24);c.fillStyle='#d97757';}c.fill(new Path2D(bodies[provider]));c.restore();}
  const pixels=c.getImageData(0,0,160,160).data;
  let left=160,top=160,right=0,bottom=0;
  for(let y=0;y<160;y++)for(let x=0;x<160;x++)if(pixels[(y*160+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  const image={canvas,left,top,width:right-left+1,height:bottom-top+1};artwork.set(provider,image);return image;
 }
 function drawFace(item,t){
  const {canvas,provider,state}=item,c=canvas.getContext('2d');
  c.clearRect(0,0,160,160);c.save();c.scale(1.6,1.6);
  const body=bodyImage(provider);
  const width=provider==='claude'?92:78, height=width*body.height/body.width;
  c.drawImage(body.canvas,body.left,body.top,body.width,body.height,(100-width)/2,(100-height)/2,width,height);
  c.save();
  c.translate(50,54);c.scale(provider==='claude'?1:1.3,provider==='claude'?1:1.3);c.translate(-50,-54);
  const ink=provider==='workbuddy'?'#f3fff9':'#202137';c.fillStyle=ink;c.strokeStyle=ink;
  let y=provider==='claude'?43:provider==='workbuddy'?60:54;
  const center=provider==='workbuddy'?54:50,space=16;
  let gaze=0,expression='open',blink=1,squeeze=0;
  const cycle=(t+(provider==='codex'?.3:provider==='workbuddy'?.6:0))%5.8;
  if(cycle>3.6&&cycle<3.92)blink=1-Math.sin((cycle-3.6)/.32*Math.PI)*.94;
  if(state==='idle'){gaze=Math.sin(t*.8)*2; squeeze=smooth((cycle-1.1)/.28)*(1-smooth((cycle-2.1)/.35));if(squeeze>.001)expression='squint';}
  if(state==='running'){gaze=Math.sin(t*3)*2;expression='focus';}
  if(state==='waiting'){expression='attention';gaze=0;y-=1;}
  if(state==='done'){expression='proud';gaze=0;y-=3;}
  if(state==='multi'){const eventTime=t-item.eventAt;expression=eventTime<1.25?'shock':'focus';gaze=eventTime<1.25?0:Math.sin(t*3)*4;}
  const xs=[center-space+gaze,center+space+gaze];
  const terminal = provider==='codex';
  if(terminal){
   // Animate the two terminal strokes, not an added emoji face or mouth.
   const lift=expression==='proud'?-3:0;
   if(expression==='attention') {
     line(c,[[31,51],[35,44,40,49]],4.2);line(c,[[54,49],[59,44,65,51]],4.2);
   } else {
     const spread=expression==='shock'?11:8;
     line(c,[[33+gaze,51-spread+lift],[39+gaze,51+lift],[33+gaze,51+spread+lift]],4.5);
     if(expression==='squint'||expression==='shock')line(c,[[66+gaze,43],[60+gaze,51],[66+gaze,59]],4.5);
     else if(expression==='proud')line(c,[[53,55],[60,57,67,52]],4.5);
     else line(c,[[53+gaze,59],[67+gaze,59]],4.5);
   }
  } else xs.forEach((x,i)=>{
   c.strokeStyle=ink;c.fillStyle=ink;
   if(expression==='proud'){oval(c,x,y,4.1,3.1*blink,ink);line(c,[[x-4,y-8],[x+4,y-8]],1.8);}
   else if(expression==='squint') {const direction=i===0?1:-1;c.globalAlpha=1-squeeze;oval(c,x,y,3,6*(1-squeeze*.8),ink);c.globalAlpha=squeeze;line(c,[[x-direction*4,y-5],[x+direction*3,y],[x-direction*4,y+5]],3.8);c.globalAlpha=1;}
   else if(expression==='shock'){c.lineWidth=3.5;c.beginPath();c.ellipse(x,y,5.4,8,0,0,Math.PI*2);c.stroke();}
   else if(expression==='attention'){oval(c,x,y,3.9,6.6*blink,ink);line(c,[[x-4,y-11],[x,y-13,x+4,y-11]],1.7);}
   else if(expression==='focus'){oval(c,x,y,3.4,5.5*blink,ink);if(i===0)line(c,[[x-5,y-11],[x+4,y-9]],2);else line(c,[[x-4,y-9],[x+5,y-11]],2);}
   else {oval(c,x,y,3.8,(expression==='ask'?7:6)*blink,ink);}
  });
  c.strokeStyle=ink;c.fillStyle=ink;
  const mouthY=y+15;
  if(!terminal && expression==='proud'){line(c,[[center-6,mouthY-2],[center+1,mouthY+3,center+8,mouthY-4]],2.5);}
  else if(!terminal && expression==='shock'){c.lineWidth=2.2;c.beginPath();c.ellipse(center,mouthY,3,4,0,0,Math.PI*2);c.stroke();}
  else if(!terminal && expression==='attention'){const call=Math.max(0,Math.sin((t%4.6)*Math.PI/1.25));line(c,[[center-4,mouthY-1],[center,mouthY+1+call*2,center+4,mouthY-1]],2);}
  else if(!terminal && (state==='running'||state==='multi')){line(c,[[center-3,mouthY],[center+3,mouthY]],2);}
  c.restore();
  if(state==='waiting' && t%4.6<1.25){c.save();c.globalAlpha=Math.sin((t%4.6)/1.25*Math.PI)*.85;c.strokeStyle='#edca75';line(c,[[9,22],[5,17]],2.5);line(c,[[19,14],[18,8]],2.5);c.restore();}
  if(state==='multi'){
   const age=t-item.eventAt,appear=smooth(age/.2),settle=age<1.1?1:.65;
   c.save();c.translate(89,10);c.rotate(age<.6?-.3*(1-age/.6):0);c.scale(appear,appear);c.fillStyle='#f6cf6b';c.globalAlpha=settle;c.beginPath();c.moveTo(0,-9);c.quadraticCurveTo(2,-2,9,0);c.quadraticCurveTo(2,2,0,9);c.quadraticCurveTo(-2,2,-9,0);c.quadraticCurveTo(-2,-2,0,-9);c.fill();c.restore();
  }
  c.restore();
 }

 const epochs = new Map(), canvases = new Map();
 const origin = performance.now();
 const reduced = matchMedia('(prefers-reduced-motion: reduce)');
 let timer = null;
 const time = () => (performance.now() - origin) / 1000;
 function pose(task) {
   if (task.state === 'ended') return 'done';
   if (task.state === 'waiting') return 'waiting';
   if (task.state === 'running' && task.progress?.total > 1) return 'multi';
   return task.state;
 }
 function tick() {
   if (document.hidden) return;
   const t = time();
   for (const [provider,item] of canvases) {
     if (!item.canvas.isConnected) { canvases.delete(provider); continue; }
     drawFace(item, reduced.matches ? item.eventAt + 2 : t);
   }
   if (!canvases.size) { clearInterval(timer); timer = null; }
 }
 window.createNotchMascot = task => {
   const state = pose(task), now = time(), total = task.progress?.total || 0;
   let epoch = epochs.get(task.provider);
   if (!epoch || epoch.state !== state || (state === 'multi' && total > epoch.total)) {
     epoch = {state, total, at:now}; epochs.set(task.provider,epoch);
   } else epoch.total = total;
   const canvas = document.createElement('canvas');
   canvas.className = 'logo mascot'; canvas.width = canvas.height = 160;
   canvas.alt = task.provider; canvas.dataset.pose = state;
   canvas.setAttribute('aria-hidden','true');
   canvas.style.animationDelay = `${-(now - epoch.at)}s`;
   const item = {canvas, provider:task.provider, state, eventAt:epoch.at};
   canvases.set(task.provider,item); drawFace(item,reduced.matches ? epoch.at + 2 : now);
   if (!timer && !reduced.matches) timer=setInterval(tick, 1000/24);
   return canvas;
 };
 window.retainNotchMascots = providers => {
   for(const provider of epochs.keys()) if(!providers.includes(provider)) {epochs.delete(provider);canvases.delete(provider);}
   if(!canvases.size){clearInterval(timer);timer=null;}
 };
 reduced.addEventListener('change',()=>{clearInterval(timer);timer=null;tick();if(!reduced.matches&&canvases.size)timer=setInterval(tick,1000/24);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
 window.addEventListener('pagehide',()=>{clearInterval(timer);timer=null;canvases.clear();epochs.clear();});
})();
