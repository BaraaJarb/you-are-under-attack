// Background network animation + confetti. Exposes window.UA_BG.{setMode,burst,cheer}.
(function(){
var bg=document.getElementById('bg'),fx=document.getElementById('fx');
if(!bg)return;
var bx=bg.getContext('2d'),fc=fx?fx.getContext('2d'):null;
var W=0,H=0,nodes=[],pkts=[],mode='alert',last=0,parts=[],fxOn=false;
var reduce=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
var small=window.innerWidth<700;
function size(){
  W=bg.width=window.innerWidth;H=bg.height=window.innerHeight;
  if(fx){fx.width=W;fx.height=H;}
  var n=Math.max(18,Math.min(small?28:64,Math.round(W*H/26000)));nodes=[];pkts=[];
  for(var i=0;i<n;i++)nodes.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.25});
}
function draw(ts){
  requestAnimationFrame(draw);
  if(ts-last<(small?50:33))return;last=ts;
  bx.clearRect(0,0,W,H);
  var L=150,i,j,a,b,dx,dy,d;
  for(i=0;i<nodes.length;i++){
    a=nodes[i];
    if(!reduce){a.x+=a.vx;a.y+=a.vy;if(a.x<0||a.x>W)a.vx*=-1;if(a.y<0||a.y>H)a.vy*=-1;}
    for(j=i+1;j<nodes.length;j++){
      b=nodes[j];dx=a.x-b.x;dy=a.y-b.y;d=dx*dx+dy*dy;
      if(d<L*L){bx.strokeStyle='rgba(120,160,230,'+(0.17*(1-Math.sqrt(d)/L)).toFixed(3)+')';bx.lineWidth=1;bx.beginPath();bx.moveTo(a.x,a.y);bx.lineTo(b.x,b.y);bx.stroke();}
    }
  }
  bx.fillStyle='rgba(143,208,255,.55)';
  for(i=0;i<nodes.length;i++){bx.beginPath();bx.arc(nodes[i].x,nodes[i].y,1.8,0,6.283);bx.fill();}
  if(reduce)return;
  if(Math.random()<(mode==='calm'?0.03:0.1)&&pkts.length<14&&nodes.length){
    a=nodes[Math.floor(Math.random()*nodes.length)];var near=[];
    for(j=0;j<nodes.length;j++){b=nodes[j];if(b===a)continue;dx=a.x-b.x;dy=a.y-b.y;if(dx*dx+dy*dy<L*L)near.push(b);}
    if(near.length)pkts.push({a:a,b:near[Math.floor(Math.random()*near.length)],t:0,s:.014+Math.random()*.02});
  }
  var col=mode==='safe'?'47,230,161':(mode==='calm'?'143,208,255':'255,59,48');
  for(i=pkts.length-1;i>=0;i--){
    var p=pkts[i];p.t+=p.s;if(p.t>=1){pkts.splice(i,1);continue;}
    var x=p.a.x+(p.b.x-p.a.x)*p.t,y=p.a.y+(p.b.y-p.a.y)*p.t;
    var tx=p.a.x+(p.b.x-p.a.x)*Math.max(0,p.t-.12),ty=p.a.y+(p.b.y-p.a.y)*Math.max(0,p.t-.12);
    bx.strokeStyle='rgba('+col+',.55)';bx.lineWidth=2;bx.beginPath();bx.moveTo(tx,ty);bx.lineTo(x,y);bx.stroke();
    bx.fillStyle='rgba('+col+',.95)';bx.beginPath();bx.arc(x,y,3,0,6.283);bx.fill();
  }
}
function burst(x,y,n){
  if(reduce||!fc)return;
  var cols=['#2fe6a1','#8fd0ff','#ffb224','#eaf1fb','#ff3b30'];
  for(var i=0;i<n;i++)parts.push({x:x,y:y,vx:(Math.random()-.5)*14,vy:-Math.random()*14-3,g:.36,r:3+Math.random()*4,c:cols[Math.floor(Math.random()*cols.length)],life:90+Math.random()*50,rot:Math.random()*6,vr:(Math.random()-.5)*.4});
  if(!fxOn){fxOn=true;requestAnimationFrame(loop);}
}
function loop(){
  fc.clearRect(0,0,W,H);
  parts=parts.filter(function(p){return p.life>0&&p.y<H+30;});
  parts.forEach(function(p){p.vy+=p.g;p.x+=p.vx;p.y+=p.vy;p.vx*=.99;p.life--;p.rot+=p.vr;fc.save();fc.translate(p.x,p.y);fc.rotate(p.rot);fc.fillStyle=p.c;fc.globalAlpha=Math.min(1,p.life/30);fc.fillRect(-p.r,-p.r/2,p.r*2,p.r);fc.restore();});
  if(parts.length)requestAnimationFrame(loop);else{fxOn=false;fc.clearRect(0,0,W,H);}
}
size();window.addEventListener('resize',size);requestAnimationFrame(draw);
var lastCheer=0;
window.UA_BG={
  setMode:function(m){mode=m;var s=document.getElementById('sirens');if(s)s.classList.toggle('calm',m==='safe');},
  burst:burst,
  cheer:function(){if(Date.now()-lastCheer<4000)return;lastCheer=Date.now();burst(W/2,H*0.3,small?60:110);}
};
})();
