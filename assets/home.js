/* TEI homepage v6.1 (TEI Launch v2, brief section 4). Lifted from the locked
   mock-up and adapted to the real page: the hero dot engine, the close's dot
   echo, the Wealth OS tour and member tools, then the page itself (video,
   Cost of Waiting teaser, Best Days, tiers, stage check, phone scroll).
   Visitors and members are told apart with /assets/members.js. Reduced
   motion: every count, draw-in, pan and autoplay rests at its end state. */
/* hero dot engine, lifted from the hero lab (concept A, headline 1, split poster) */
(function(){
var state={c:'a',lay:'top'};
function centred(){return true;}
function reduced(){return !!window.TEI_REDUCED;}
var CH='232,214,168',BL='185,202,230';
function ease(x){return x<=0?0:x>=1?1:1-Math.pow(1-x,3);}
function clamp(x){return x<0?0:x>1?1:x;}
function rnd(a,b){return a+Math.random()*(b-a);}
function Scene(site,phone,poster){
  this.w=site;this.phone=phone;this.poster=poster;this.hero=site.querySelector('.hero');
  this.cb=site.querySelector('.cv-b');this.cf=site.querySelector('.cv-f');
  this.m={x:-999,y:-999,on:false};this.t0=performance.now();this.mode=state.c;this.coreOn=false;this.sk=0;
  this.full=poster||(!phone&&centred());
  var self=this;
  this.w.addEventListener('pointermove',function(e){self.ptr(e);});
  this.w.addEventListener('pointerdown',function(e){self.ptr(e);});
  this.w.addEventListener('pointerleave',function(){self.m.on=false;});
  this.w.addEventListener('pointerup',function(e){if(e.pointerType!=='mouse')self.m.on=false;});
  this.w.addEventListener('pointercancel',function(){self.m.on=false;});
  this.layout();this.init();
}
Scene.prototype.scale=function(){var r=this.w.getBoundingClientRect();return r.width/this.w.offsetWidth||1;};
Scene.prototype.ptr=function(e){var r=this.w.getBoundingClientRect(),s=this.scale();this.m.x=(e.clientX-r.left)/s;this.m.y=(e.clientY-r.top)/s;this.m.on=true;};
Scene.prototype.rel=function(el){if(!el)return null;var r=el.getBoundingClientRect(),w=this.w.getBoundingClientRect(),s=this.scale();return {x:(r.left-w.left)/s,y:(r.top-w.top)/s,w:r.width/s,h:r.height/s};};
Scene.prototype.layout=function(){
  var W=this.w.offsetWidth,H=this.w.offsetHeight,d=Math.min(2,window.devicePixelRatio||1);
  this.W=W;this.H=H;this.d=d;
  [this.cb,this.cf].forEach(function(c){c.width=Math.round(W*d);c.height=Math.round(H*d);c.style.width=W+'px';c.style.height=H+'px';});
  this.xb=this.cb.getContext('2d');this.xf=this.cf.getContext('2d');
  this.anchor=this.rel(this.hero.querySelector('.anchor'));
  var st=this.hero.querySelector('.stage');this.stage=st&&st.offsetHeight>0&&getComputedStyle(st).display!=='none'?this.rel(st):null;
  this.tb=this.rel(this.hero.querySelector('.copy'));
  this.hr=this.rel(this.hero);
  this.core=this.hero.querySelector('.core');
  this.mid=this.poster?this.hero.querySelector('.mid'):null;this.midOn=false;
  var self=this;this.nodes=this.mid?[].slice.call(this.mid.querySelectorAll('.pc i')).map(function(n){var r=self.rel(n);return {x:r.x+r.w/2,y:r.y+r.h/2};}):[];
  this.chart=this.poster?this.rel(this.w.querySelector('#chart')):null;
  this.ecv=this.poster?this.w.querySelector('#ecv'):null;
};
Scene.prototype.scatter=function(p){
  var r=this.full?this.hr:(this.stage||{x:this.W*0.56,y:this.hr.y+20,w:this.W*0.4,h:this.hr.h-40});
  p.sx=rnd(r.x,r.x+r.w);p.sy=rnd(r.y,r.y+r.h);p.ph=rnd(0,6.28);p.ox=0;p.oy=0;
};
Scene.prototype.init=function(){
  var P=this.P=[],ph=this.phone,self=this,i,p,mode=this.mode,big=this.poster;
  if(mode==='a'){
    var a=this.anchor,el=this.hero.querySelector('.anchor'),cs=getComputedStyle(el);
    var off=document.createElement('canvas'),w=Math.ceil(a.w)+8,h=Math.ceil(a.h)+8;off.width=w;off.height=h;
    var o=off.getContext('2d');o.font=cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;try{o.letterSpacing=cs.letterSpacing;}catch(e){}
    var mt=o.measureText(el.textContent);o.fillStyle='#fff';o.textBaseline='alphabetic';
    o.fillText(el.textContent,cs.textAlign==='center'?Math.max(0,(a.w-mt.width)/2):0,h/2+(mt.actualBoundingBoxAscent-mt.actualBoundingBoxDescent)/2);
    var data=o.getImageData(0,0,w,h).data,gap=ph?(big?2.9:3.1):4.4,pts=[];
    for(var y=0;y<h;y+=gap)for(var x=0;x<w;x+=gap){var k=(Math.floor(y)*w+Math.floor(x))*4+3;if(data[k]>140)pts.push([a.x+x+rnd(-.4,.4),a.y+y+rnd(-.4,.4)]);}
    var LIM=ph?780:1320;while(pts.length>LIM)pts.splice(Math.floor(Math.random()*pts.length),1);
    var split=this.poster&&this.hero.classList.contains('split')&&this.stage;
    if(split){var st2=this.stage;this.cx=st2.x+st2.w/2;this.cy=st2.y+st2.h*0.5;var R0=Math.min(st2.w*0.38,st2.h*0.95);this.rings=[{rx:R0,ry:R0*0.5,sp:.16},{rx:R0*0.64,ry:R0*0.64*0.5,sp:-.26}];this.tilt=-0.16;this.split=true;}
    pts.forEach(function(q){p={tx:q[0],ty:q[1],r:gap*0.36,d:(split?1.5:0.45)+(q[0]-a.x)/a.w*0.9+rnd(0,split?.6:.35),blue:Math.random()<.12};self.scatter(p);
      if(split){p.ring=Math.random()<.55?0:1;p.a=rnd(0,6.28);}
      if(!self.full)p.sx=rnd(self.W*0.6,self.W*0.98);P.push(p);});
    if(split){['Pension','ISA','Savings','Debt','Goals'].forEach(function(lb,j){p={orb:1,label:lb,ring:0,a:j/5*6.28+0.4,r:3.2,d:j*0.05};self.scatter(p);P.push(p);});
      for(i=0;i<60;i++){p={orb:1,ring:Math.random()<.55?0:1,a:rnd(0,6.28),r:rnd(.8,1.5),d:rnd(0,.5),blue:Math.random()<.2};this.scatter(p);P.push(p);}}
    for(i=0;i<(split?0:(ph?40:90));i++){p={dust:1,r:rnd(.6,1.3),d:0,blue:Math.random()<.4};this.scatter(p);p.sx=rnd(0,this.W);p.sy=rnd(this.hr.y,this.hr.y+this.hr.h);P.push(p);}
  }
  if(mode==='b'){
    var a2=this.anchor,n=ph?(big?170:120):210;
    this.cx=a2.x+a2.w/2;this.cy=a2.y+a2.h*0.56;
    this.rings=[{rx:a2.w*0.62+(ph?20:34),ry:a2.h*(ph?0.62:0.6),sp:.34},{rx:a2.w*0.78+(ph?(big?50:36):96),ry:a2.h*(ph?1.05:0.98),sp:-.2}];
    for(i=0;i<n;i++){p={ring:i%3===0?0:1,a:rnd(0,6.28),d:rnd(.15,.9),r:rnd(1,1.9),blue:Math.random()<.15};this.scatter(p);P.push(p);}
  }
  if(mode==='c'||mode==='d'){
    var s=this.stage,cx=s.x+s.w/2,cy=s.y+s.h/2,R=Math.min(s.w,s.h*1.6)*(big?0.47:0.46);this.cx=cx;this.cy=cy;
    var sq=big?0.6:0.42;
    this.rings=[{rx:R,ry:R*sq,sp:.16},{rx:R*0.66,ry:R*0.66*sq,sp:-.26}];this.tilt=-0.16;
    if(mode==='c'){
      var tiny=ph&&!big&&state.lay==='side',L=ph?['Pension','ISA','Savings']:['Pension','ISA','Savings','Debt','Goals'];
      L.forEach(function(lb,j){p={label:lb,tiny:tiny,ring:0,a:j/L.length*6.28+0.4,d:j*0.06,r:tiny?2.4:3.4};self.scatter(p);p.hx=rnd(s.x+s.w*.1,s.x+s.w*.9);p.hy=rnd(s.y+s.h*.15,s.y+s.h*.85);P.push(p);});
      for(i=0;i<(ph?80:130);i++){p={ring:Math.random()<.55?0:1,a:rnd(0,6.28),d:rnd(0,.6),r:rnd(.8,1.6),blue:Math.random()<.18};this.scatter(p);p.hx=rnd(s.x,s.x+s.w);p.hy=rnd(s.y,s.y+s.h);P.push(p);}
      this.coreAt=2.9;
    }else{
      var cl=ph?54:80,rc=R*0.2;
      for(i=0;i<cl;i++){var ang=i*2.39996,rr=rc*Math.sqrt((i+.5)/cl);p={cl:1,cdx:Math.cos(ang)*rr,cdy:Math.sin(ang)*rr*0.8,ring:1,a:rnd(0,6.28),d:rnd(.2,.7),r:rnd(1,1.7)};this.scatter(p);P.push(p);}
      for(i=0;i<(ph?110:160);i++){p={ring:Math.random()<.55?0:1,a:rnd(0,6.28),d:rnd(0,.7),r:rnd(.8,1.6),blue:Math.random()<.15};this.scatter(p);P.push(p);}
      this.coreAt=2.8;
    }
  }
  if(mode==='e'){
    var t=this.tb,hr=this.hr;
    if(big){var h1=this.rel(this.hero.querySelector('h1'));this.cx=this.W*0.5;this.cy=h1.y+h1.h*0.5;this.rings=[{rx:this.W*0.62,ry:h1.h*1.25+40,sp:.1},{rx:this.W*0.8,ry:h1.h*1.6+70,sp:-.07}];this.tilt=-0.22;}
    else if(!ph&&centred()){var h1c=this.rel(this.hero.querySelector('h1')),dk=this.rel(this.hero.querySelector('.rest'));this.cx=this.W/2;this.cy=(h1c.y+dk.y+dk.h)/2;var hh=(dk.y+dk.h-h1c.y);this.rings=[{rx:this.W*0.36,ry:hh*0.62+20,sp:.1},{rx:this.W*0.45,ry:hh*0.8+40,sp:-.07}];this.tilt=-0.06;
      this.dimBox={x:Math.min(h1c.x,dk.x)-10,y:h1c.y-10,w:Math.max(h1c.w,dk.w)+20,h:hh+20};}
    else{this.cx=t.x+t.w*(ph?.5:.62);this.cy=t.y+t.h*.5;this.rings=[{rx:ph?t.w*.62:t.w*.78+this.W*.16,ry:t.h*(ph?.62:.72)+20,sp:.1},{rx:ph?t.w*.74:t.w*.95+this.W*.2,ry:t.h*(ph?.78:.92)+30,sp:-.07}];this.tilt=-0.08;}
    for(i=0;i<(ph?170:280);i++){p={ring:i%2,a:rnd(0,6.28),r:rnd(.8,1.8),blue:Math.random()<.2};p.d=0.1+((p.a%6.28)/6.28)*0.9;p.sx=this.W+40;p.sy=this.cy+rnd(-40,40);p.ph=rnd(0,6.28);p.ox=0;p.oy=0;P.push(p);}
    this.textEl=this.rel(this.hero.querySelector('h1'));
  }
  if(this.chart)this.assignChart();
};
/* poster hand-off: every particle gets a landing point on one of the two chart lines, ordered left to right */
Scene.prototype.assignChart=function(){
  var c=this.chart,P=this.P.filter(function(p){return !p.dust;}),N=P.length;
  P.forEach(function(p){p.key=p.tx!=null?p.tx:p.sx;});
  P.sort(function(a,b){return a.key-b.key;});
  var f=function(u){return (Math.exp(2.3*u)-1)/(Math.exp(2.3)-1);};
  P.forEach(function(p,i){
    var u=i/(N-1||1),line=i%2,x=c.x+u*c.w,y;
    if(line===0)y=c.y+c.h-c.h*0.92*f(u);
    else{var w=clamp((u-0.22)/0.78);y=c.y+c.h-c.h*0.92*f(w)*0.58;}
    p.cx=x;p.cy=y;p.u=u;p.line=line;
  });
  this.P.forEach(function(p){if(p.dust){p.cx=null;}});
};
Scene.prototype.ringPos=function(ring,a,t,tilt){
  var R=this.rings[ring],an=a+R.sp*t,x0=R.rx*Math.cos(an),y0=R.ry*Math.sin(an),ct=Math.cos(tilt||0),st=Math.sin(tilt||0);
  return {x:this.cx+x0*ct-y0*st,y:this.cy+x0*st+y0*ct,z:Math.sin(an)};
};
Scene.prototype.frame=function(now){
  var rm=reduced(),t=rm?60:(now-this.t0)/1000,xb=this.xb,xf=this.xf,d=this.d,W=this.W,H=this.H,m=this.m;
  xb.setTransform(d,0,0,d,0,0);xf.setTransform(d,0,0,d,0,0);xb.clearRect(0,0,W,H);xf.clearRect(0,0,W,H);
  var R=this.phone?52:80,R2=R*R,S=this.phone?2:2.4,mode=this.mode,sk=rm?0:this.sk;
  var gx=this.cx||(this.anchor?this.anchor.x+this.anchor.w/2:W*.7),gy=this.cy||(this.anchor?this.anchor.y+this.anchor.h/2:H*.5);
  var gr=xb.createRadialGradient(gx,gy,0,gx,gy,Math.max(40,Math.min(this.phone?170:280,H-gy-2,gy-2,W-gx-2,gx-2)));gr.addColorStop(0,'rgba('+CH+','+((mode==='e'?.05:.1)*(1-sk)*(window.TEI_MEMBER?1.7:1))+')');gr.addColorStop(1,'rgba('+CH+',0)');xb.fillStyle=gr;xb.fillRect(0,0,W,H);
  if(this.core&&!this.coreOn&&t>this.coreAt){this.core.classList.add('on');this.coreOn=true;}
  if(this.core&&this.poster)this.core.style.opacity=this.coreOn?String(1-Math.min(1,sk*2.2)):'';
  if(this.ecv)this.ecv.classList.toggle('on',sk>0.92||rm);
  var midAt=mode==='a'?2.9:(this.coreAt||2.6)+0.2;
  if(this.mid&&!this.midOn&&(t>midAt||rm)){this.mid.classList.add('on');this.midOn=true;}
  for(var i=0;i<this.P.length;i++){
    var p=this.P[i],x,y,z=1,al=.9,ctx=xb,drift=Math.sin(t*.7+p.ph)*10,drift2=Math.cos(t*.5+p.ph)*8;
    if(mode==='a'){
      if(p.dust){x=p.sx+Math.sin(t*.2+p.ph)*20;y=p.sy+Math.cos(t*.25+p.ph)*14;al=.22*(1-sk);
        if(this.nodes.length&&!rm){var nd=this.nodes[i%this.nodes.length],kn=ease((t-2.05-(i%this.nodes.length)*0.12)/0.85);x=x*(1-kn)+nd.x*kn;y=y*(1-kn)+nd.y*kn;al=kn>0?(.75*(1-kn)+.0):al;if(kn>=1)continue;}}
      else if(p.orb){var qo=this.ringPos(p.ring,p.a,t,this.tilt),ko=ease(t/1.0);x=p.sx*(1-ko)+qo.x*ko;y=p.sy*(1-ko)+qo.y*ko;z=qo.z;al=z>0?.95:.4;}
      else{if(rm)continue;var k=ease((t-p.d)/1.15),bx=p.sx+drift,by=p.sy+drift2;
        if(this.split){var qs=this.ringPos(p.ring,p.a,t,this.tilt),kg=ease(t/1.0);bx=p.sx*(1-kg)+qs.x*kg;by=p.sy*(1-kg)+qs.y*kg;}
        x=bx*(1-k)+(p.tx+Math.sin(t*2+p.ph)*.35)*k;y=by*(1-k)+(p.ty+Math.cos(t*2.2+p.ph)*.35)*k;al=.45+.5*k;ctx=xf;}
    }else if(mode==='b'){
      var q=this.ringPos(p.ring,p.a,t,-0.18),k2=ease((t-p.d)/1.5);x=(p.sx+drift)*(1-k2)+q.x*k2;y=(p.sy+drift2)*(1-k2)+q.y*k2;z=q.z;
      if(k2>.5&&z>0){ctx=xf;al=.95;}else{al=k2>.5?.3:.6;}
    }else if(mode==='c'){
      var q2=this.ringPos(p.ring,p.a,t,this.tilt),k3=ease((t-1.5-p.d)/1.5),fx=p.hx+Math.sin(t*.6+p.ph)*16,fy=p.hy+Math.cos(t*.5+p.ph)*12,k0=ease(t/0.9);
      fx=p.sx*(1-k0)+fx*k0;fy=p.sy*(1-k0)+fy*k0;x=fx*(1-k3)+q2.x*k3;y=fy*(1-k3)+q2.y*k3;z=q2.z;al=k3>.4?(z>0?.95:.4):.8;
    }else if(mode==='d'){
      var k4=ease((t-p.d)/1.4),q3=this.ringPos(p.ring,p.a,t,this.tilt),tx,ty;
      if(p.cl){var kd=ease((t-2.1-p.d*.4)/1.3);tx=(this.cx+p.cdx)*(1-kd)+q3.x*kd;ty=(this.cy+p.cdy)*(1-kd)+q3.y*kd;z=kd>.5?q3.z:1;}else{tx=q3.x;ty=q3.y;z=q3.z;}
      x=(p.sx+drift)*(1-k4)+tx*k4;y=(p.sy+drift2)*(1-k4)+ty*k4;al=k4>.5?(z>0?.95:.38):.6;
    }else{
      var q4=this.ringPos(p.ring,p.a,t,this.tilt),k5=ease((t-p.d)/1.6);x=p.sx*(1-k5)+q4.x*k5;y=p.sy*(1-k5)+q4.y*k5;z=q4.z;al=(z>0?.8:.35)*(.3+.7*k5);
      var tb=this.dimBox||this.textEl||this.tb;if(x>tb.x-10&&x<tb.x+tb.w+10&&y>tb.y-10&&y<tb.y+tb.h+10)al*=.28;
    }
    // scroll hand-off into the end-card chart (phone poster only)
    if(this.poster&&sk>0){y-=sk*70;al*=(1-sk);}
    if(m.on&&!rm){var dx=x+p.ox-m.x,dy=y+p.oy-m.y,dd=dx*dx+dy*dy;if(dd<R2){var dl=Math.sqrt(dd)||1,f=(1-dl/R)*S;p.ox+=dx/dl*f;p.oy+=dy/dl*f;}}
    p.ox*=.92;p.oy*=.92;var LM=this.phone?16:24,mg=Math.sqrt(p.ox*p.ox+p.oy*p.oy);if(mg>LM){p.ox*=LM/mg;p.oy*=LM/mg;}x+=p.ox;y+=p.oy;
    var r=p.r*(z>0?1.12:.8),warm=false;
    ctx.fillStyle='rgba('+(warm?'240,169,126':(p.blue?BL:CH))+','+al.toFixed(3)+')';ctx.beginPath();ctx.arc(x,y,r,0,6.2832);ctx.fill();
    if(p.label){
      var la=al;ctx=(z>0||mode!=='c')?xf:xb;
      ctx.strokeStyle='rgba('+CH+','+(la*.5).toFixed(3)+')';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,r+4,0,6.2832);ctx.stroke();
      ctx.fillStyle='rgba('+CH+','+(Math.min(1,la+.1)).toFixed(3)+')';ctx.font=(p.tiny?'9':'10.5')+'px "Geist Mono",monospace';ctx.fillText(p.label,x+r+8,y+3.5);
    }
  }
};
window.TEIHero={Scene:Scene};
})();

/* close dot echo, lifted from the close lab */
(function(){
var reduce=!!window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function Echo(el,member){
  var cv=el.querySelector('canvas'),self=this;this.cv=cv;this.member=member;this.m={x:-999,y:-999,on:false};
  var W=el.offsetWidth,H=el.offsetHeight,d=Math.min(2,window.devicePixelRatio||1);cv.width=W*d;cv.height=H*d;this.x=cv.getContext('2d');this.W=W;this.H=H;this.d=d;
  var P=this.P=[],n=Math.round(W*0.9),R=W*0.36;
  for(var i=0;i<n;i++){var ring=i%5===0?1:0,a=i/n*6.283+Math.random()*.05,r=ring?R*0.55:R+Math.random()*3-1.5;P.push({a:a,r:r,ring:ring,ox:0,oy:0,s:Math.random()<.2?.6:1});}
  var host=el.closest('.bnd')||el;
  host.addEventListener('pointermove',function(e){var b=cv.getBoundingClientRect(),sc=b.width/W;self.m.x=(e.clientX-b.left)/sc;self.m.y=(e.clientY-b.top)/sc;self.m.on=true;});
  host.addEventListener('pointerleave',function(){self.m.on=false;});
  this.t0=performance.now();
}
Echo.prototype.frame=function(now){
  var x=this.x,W=this.W,H=this.H,cx=W/2,cy=H/2,t=reduce?0:(now-this.t0)/1000,m=this.m,R=W*.32,R2=R*R;
  x.setTransform(this.d,0,0,this.d,0,0);x.clearRect(0,0,W,H);
  var g=x.createRadialGradient(cx,cy,0,cx,cy,W*.5);g.addColorStop(0,'rgba(232,214,168,'+(this.member?.22:.12)+')');g.addColorStop(1,'rgba(232,214,168,0)');x.fillStyle=g;x.fillRect(0,0,W,H);
  for(var i=0;i<this.P.length;i++){
    var p=this.P[i],a=p.a+(p.ring?-1:1)*t*0.08,px=cx+Math.cos(a)*p.r,py=cy+Math.sin(a)*p.r;
    if(m.on&&!reduce){var dx=px+p.ox-m.x,dy=py+p.oy-m.y,dd=dx*dx+dy*dy;if(dd<R2){var dl=Math.sqrt(dd)||1,f=(1-dl/R)*1.6;p.ox+=dx/dl*f;p.oy+=dy/dl*f;}}
    p.ox*=.9;p.oy*=.9;
    x.fillStyle='rgba(232,214,168,'+(p.ring?.45:.9*p.s)+')';x.beginPath();x.arc(px+p.ox,py+p.oy,p.ring?1:1.3,0,6.283);x.fill();
  }
  x.fillStyle='rgba(232,214,168,.95)';x.beginPath();x.arc(cx,cy,W*.05,0,6.283);x.fill();
  if(this.member){x.strokeStyle='rgba(232,214,168,.35)';x.lineWidth=1;x.beginPath();x.arc(cx,cy,W*.46,0,6.283);x.stroke();}
};
window.TEIEcho=Echo;
})();

/* members showcase, lifted from the showcase lab */
(function(){
var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var LOCK='<svg viewBox="0 0 12 12"><rect x="2.5" y="5.5" width="7" height="5" rx="1"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/></svg>';

/* ---------- Wealth OS mock (example figures for a sample member, Priya) ---------- */
function app(kind){
  var PORTF='<div class="oc"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><div><span class="k c">Your portfolio</span><div style="font-size:20px;margin-top:3px">Everything you own · £48,260</div></div><div class="chips hide-m" style="margin-left:auto"><span class="on">Set and forget</span><span>Earmarked</span></div></div>'+
    '<div class="tm" style="margin-top:12px">'+
      '<div style="grid-row:span 2;background:#123063;box-shadow:inset 0 0 0 1.5px #E8D6A8;transition-delay:.05s">Global tracker<b>38.4%</b></div>'+
      '<div style="grid-row:span 2;background:#1E4A86;transition-delay:.15s">Workplace default<b>33.6%</b></div>'+
      '<div style="background:#2C5D9E;transition-delay:.25s">LISA tracker<b>14.9%</b></div>'+
      '<div style="background:#7A92B8;color:#0F1E36;transition-delay:.35s;display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:0;background:none"><div style="background:#7A92B8;border-radius:10px;padding:8px;opacity:1;transform:none">Cash ISA<b style="font-size:16px">8.1%</b></div><div style="background:#B9CAE6;border-radius:10px;padding:8px;opacity:1;transform:none;color:#0F1E36">Other<b style="font-size:16px">5.0%</b></div></div>'+
    '</div><div class="fine" style="margin-top:10px">Planning changes happen with your coach in <span style="color:#E8D6A8;text-decoration:underline">Portfolio Lab</span>.</div></div>';
  var growth='<svg class="ch" viewBox="0 0 600 150" preserveAspectRatio="none" style="height:150px"><defs><linearGradient id="hg'+kind+'" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#C9D3E3" stop-opacity=".28"/><stop offset="1" stop-color="#C9D3E3" stop-opacity="0"/></linearGradient></defs><path d="M0 128 L80 126 160 122 220 120 260 104 300 86 360 82 420 80 480 70 520 40 560 22 600 18 L600 150 L0 150Z" fill="url(#hg'+kind+')"/><path class="draw" pathLength="1" d="M0 128 L80 126 160 122 220 120 260 104 300 86 360 82 420 80 480 70 520 40 560 22 600 18" fill="none" stroke="#E8D6A8" stroke-width="2.2" vector-effect="non-scaling-stroke"/></svg>';
  var A=[['Pensions','#E8D6A8',44],['ISAs','#B9CAE6',31],['Lifetime ISA','#C9B37A',15],['Cash','#7488A8',10]];
  var alloc='<div class="alloc">'+A.map(function(a){return '<i style="background:'+a[1]+';width:'+a[2]+'%"></i>';}).join('')+'</div><div class="legend">'+A.map(function(a){return '<span style="--c:'+a[1]+'">'+a[0]+' '+a[2]+'%</span>';}).join('')+'</div>';
  var home='<div class="view on" data-v="0" style="display:grid;grid-template-columns:2fr 1fr;grid-template-rows:auto auto;gap:14px;align-content:start">'+
    '<div class="oc ohero" style="grid-row:span 2"><div style="display:flex;justify-content:space-between"><span class="k">Total wealth</span><span class="pill hide-m">Updated Nov \'26</span></div><div class="num tnum" data-count="48260">£48,260</div><div style="font-size:13px;margin-top:4px"><span class="up">+£1,140</span> up since last month</div><div style="margin-top:14px">'+growth+'</div>'+alloc+'<div style="font-size:12px;color:#E8D6A8;margin-top:12px">See your wealth &rsaquo;</div></div>'+
    '<div class="oc"><span class="k c">Next step · 1 of 3</span><div style="font-size:19px;margin-top:6px;letter-spacing:-.01em">Move £150 a month into your ISA</div><p style="font-size:12px;color:#AAB6C8;margin:6px 0 12px;line-height:1.5">Your safety net is full, so this money can start working.</p><span class="btn-s">See how</span> <span class="btn-s o">Mark as done</span></div>'+
    '<div class="oc" style="display:flex;gap:14px;align-items:center"><svg class="ring" width="84" height="84" viewBox="0 0 36 36" style="--p:62"><circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="2.6"/><circle class="arc" cx="18" cy="18" r="15.9" fill="none" stroke="#E8D6A8" stroke-width="2.6" stroke-linecap="round" transform="rotate(-90 18 18)"/><text x="18" y="20.5" text-anchor="middle" font-size="7.5" fill="#F7F4ED" font-family="Geist,sans-serif">62%</text></svg><div><span class="k c">Headline goal</span><div style="font-size:17px;margin-top:3px">First home by 2028</div><div style="font-size:12px;color:#B9E0C4;margin-top:2px">On track</div></div></div>'+
    '<div class="oc hide-m" style="grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;background:none;box-shadow:none;padding:0">'+
      '<div class="oc"><span class="k c">Safety net</span><div style="font-size:19px;margin-top:4px">Working buffer</div><div class="bar" style="--w:100%"><i></i></div><div style="font-size:11.5px;color:#AAB6C8;margin-top:6px">3.0 months of spending covered</div></div>'+
      '<div class="oc"><span class="k c">Cashflow · November</span><div style="display:flex;gap:8px;margin-top:8px"><div class="st" style="flex:1"><div class="k">Take-home</div><b>£2,450</b></div><div class="st" style="flex:1"><div class="k">Into wealth</div><b>£620</b></div></div><div style="display:flex;justify-content:space-between;font-size:11.5px;margin-top:8px"><span>Wealth conversion</span><span>25% · target 20%</span></div><div class="bar" style="--w:25%"><i></i></div></div>'+
      '<div class="oc"><span class="k c">Next session</span><div style="font-size:19px;margin-top:4px">Thu 20 Nov, 6:30pm</div><div style="font-size:11.5px;color:#AAB6C8;margin-top:6px">Quarterly review with your coach</div></div>'+
    '</div></div>';
  var nw='<svg class="ch" viewBox="0 0 900 220" preserveAspectRatio="none" style="height:190px"><defs><linearGradient id="wg'+kind+'" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#C9D3E3" stop-opacity=".22"/><stop offset="1" stop-color="#C9D3E3" stop-opacity="0"/></linearGradient></defs>'+
    [40,80,120,160,200].map(function(y){return '<line x1="0" x2="900" y1="'+y+'" y2="'+y+'" stroke="rgba(201,211,227,.07)"/>';}).join('')+
    '<path d="M0 170 C120 168 220 166 300 162 S420 120 480 112 S640 106 700 98 S820 50 900 40 L900 220 L0 220Z" fill="url(#wg'+kind+')"/><path class="draw" pathLength="1" d="M0 170 C120 168 220 166 300 162 S420 120 480 112 S640 106 700 98 S820 50 900 40" fill="none" stroke="#E8D6A8" stroke-width="2.2" vector-effect="non-scaling-stroke"/><path d="M0 186 H150 V180 H300 V172 H450 V164 H600 V156 H750 V148 H900" fill="none" stroke="#C9D3E3" stroke-opacity=".7" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/></svg>';
  var wealth='<div class="view" data-v="1"><div class="vs" style="display:grid;gap:14px;align-content:start">'+
    '<div class="oc ohero"><div style="display:flex;align-items:flex-start;gap:12px"><div><span class="k c">Net worth</span><div class="num tnum">£48,260</div><div style="font-size:12.5px;margin-top:4px"><span class="up">+£3,940 gain</span> · +8.9% since Jan \'26</div></div><div class="chips hide-m" style="margin-left:auto"><span>1M</span><span>3M</span><span>YTD</span><span>1Y</span><span class="on">All</span></div></div><div style="margin-top:10px">'+nw+'</div><div class="legend"><span style="--c:#E8D6A8">Value</span><span style="--c:#C9D3E3">Paid in</span><span class="hide-m" style="--c:transparent">Move across the chart to see any month</span></div></div>'+
    '<div><div style="font-size:19px;font-weight:300;letter-spacing:-.02em">What this means</div><div style="font-size:11.5px;color:#AAB6C8;margin-top:2px">Your coach\'s view first, then what stands out in your figures.</div></div>'+
    '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px" class="wm">'+
      '<div class="oc"><span class="k">What stands out</span><div style="margin-top:6px"><span class="pill ok">Doing well</span></div><p style="font-size:14px;line-height:1.5;margin:8px 0 0">Your ISA is doing the heavy lifting this year. Keeping the £150 a month going is what moves your house goal forward.</p></div>'+
      '<div class="oc hide-m"><span class="pill att">Needs attention</span><p style="font-size:12.5px;line-height:1.5;margin:8px 0 0">Your workplace pension shows no employer match logged. If your employer offers one, it is usually worth taking.</p></div>'+
      '<div class="oc hide-m"><span class="pill">Worth knowing</span><p style="font-size:12.5px;line-height:1.5;margin:8px 0 0">Your largest five holdings make up 88% of your portfolio.</p></div>'+
    '</div>'+
    '<div class="oc"><div style="display:flex;justify-content:space-between"><span class="k c">Health</span><span class="fine hide-m">Simple signals, not a score</span></div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:10px" class="hl">'+
      [['Concentration','22%','Fine',30],['Cash drag','8%','Worth knowing',45],['Safety net','3.0 months','Fine',60],['Spread','9 holdings','Fine',70]].map(function(h){return '<div class="st"><div class="k">'+h[0]+'</div><b>'+h[1]+'</b><div class="bar" style="--w:'+h[3]+'%"><i></i></div><div style="font-size:10px;color:'+(h[2]==='Fine'?'#B9E0C4':'#E8D6A8')+';margin-top:5px">'+h[2]+'</div></div>';}).join('')+
    '</div></div>'+PORTF+'</div></div>';
  var T=[['Global tracker','38.4%','#123063',1,1,2],['Workplace default fund','33.6%','#1E4A86',1,1,1],['LISA global tracker','14.9%','#2C5D9E',1,1,1],['Cash ISA','8.1%','#7A92B8',1,1,1],['Clean energy fund','3.2%','#A9BAD6',1,1,1],['Others','1.8%','#C9D3E3',1,1,1]];
  var portfolio='';
  var forecast='<div class="view" data-v="2" style="display:grid;gap:14px;align-content:start"><div class="oc ph"><span class="k c">Forecast</span><div class="phl">Forecast screen: taken from the live Wealth OS page at build, once it has been updated.</div><div class="sk" style="width:40%;height:34px"></div><div class="sk" style="height:180px"></div><div style="display:flex;gap:10px"><div class="sk" style="flex:1;height:54px"></div><div class="sk" style="flex:1;height:54px"></div><div class="sk" style="flex:1;height:54px"></div></div></div></div>';
  var titles=[['Thursday, 6 November 2026','Good morning, Priya',''],['How much you have, and where it is','Wealth','Update balances'],['What you hold','Portfolio','']];
  return '<div class="app '+kind+'"><aside class="side"><div class="back">&lsaquo; Client Hub</div><div class="brand"><span class="omark"></span>Wealth OS</div>'+
    ['Home','Wealth','Goals','Forecast','Cashflow','Settings'].map(function(n,i){return '<div class="nv'+(i===0?' on':'')+'" data-n="'+i+'">'+n+'</div>';}).join('')+
    '<div class="me"><span class="av">PS</span><div>Priya S.<small>TEI member</small></div></div></aside>'+
    '<div class="main"><div class="mtop"><div><div class="kick" data-kick>'+titles[0][0]+'</div><h3 data-title>'+titles[0][1]+'</h3></div><span class="act" data-act hidden></span></div>'+home+wealth+forecast+
    '<div class="omnav"><span class="on" data-mn="0">Home</span><span data-mn="1">Wealth</span><span>Goals</span><span data-mn="2">Forecast</span><span>More</span></div></div></div>';
}
var TITLES=[['Thursday, 6 November 2026','Good morning, Priya',''],['How much you have, and where it is','Wealth','Update balances'],['Where you are heading','Forecast','']];

/* ---------- the members' article tease (Paddy, 10 Nov 2026) ----------
   One slot, many teases. /assets/home-teases.json lists them (slug, image,
   alt, link; width, height and bg optional) and "live" names the one shown.
   Switching it changes this slot only: no code change, nothing else rebuilt.
   The tease links to the membership page, never to the article. TEASE is the
   live NBIS tease, so the slot still works if the config cannot be read. */
var TEASE={slug:'nbis-current',image:'/assets/img/home/tool-article.webp',width:2000,height:1260,
  alt:'A members\' article, Nebius: Sizing up the Opportunity. Everything under the title is blurred, with a Members only label.',link:'/membership.html'};
function hx(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function teaseLink(t){return /^\/(?!\/)/.test(t.link||'')?t.link:'/membership.html';}
function teaseHtml(t){
  var wide=t.width&&t.height&&t.width/t.height>1.6;
  return '<a class="tlmedia tltease'+(wide?' is-wide':'')+'" href="'+hx(teaseLink(t))+'" data-tease="'+hx(t.slug)+'"'+(t.bg?' style="background:'+hx(t.bg)+'"':'')+'>'+
    '<img src="'+hx(t.image)+'" alt="'+hx(t.alt)+'" loading="lazy" decoding="async"'+(t.width?' width="'+(+t.width)+'" height="'+(+t.height)+'"':'')+'></a>';
}
function teaseApply(t){
  TEASE=t;
  [].forEach.call(document.querySelectorAll('[data-tease]'),function(a){a.outerHTML=teaseHtml(t);});
}
(function(){
  if(!window.fetch)return;
  fetch('/assets/home-teases.json',{cache:'no-cache'}).then(function(r){return r.ok?r.json():null;}).then(function(c){
    if(!c||!c.teases)return;
    var t=c.teases.filter(function(x){return x&&x.slug===c.live;})[0];
    if(t&&t.image&&t.alt&&t.slug!==TEASE.slug)teaseApply(t);
  }).catch(function(){});
})();

/* ---------- the four tools, detailed ---------- */
function tools(){
  var V=[
   ['Members\' articles','In-depth research, explained in plain English',
    teaseHtml(TEASE)+'<div class="fine">A recent members\' article. The full article is in the Client Hub.</div>',0],
   ['Portfolio Lab','Test a mix before you change anything',
    '<div class="tlmedia"><video muted playsinline preload="none" data-dur="28.9" data-ch="0:Analyse|5.7:Optimise|12.9:Compare|17.8:Implement|21.9:Results" poster="/assets/img/home/tool-lab-poster.webp" aria-label="A walkthrough of the Portfolio Lab with example holdings: filtering by account, choosing the Equal weight preset, then Compare, Implement and Results."><source src="/assets/video/tool-lab.mp4" type="video/mp4"></video></div><div class="fine">The live Portfolio Lab, with example holdings.</div>',0],
   ['Coach Forecast','Your written forecast, built by your coach',
    '<div class="tlmedia"><video muted playsinline preload="none" data-dur="18.8" data-ch="0:Growth rates|8.4:What if|13.6:Towards the goal" poster="/assets/img/home/tool-forecast.webp" aria-label="A Coach Forecast for a sample member: switching between cautious, central and optimistic growth, testing a market fall, and showing only what counts towards the goal."><source src="/assets/video/tool-forecast.mp4" type="video/mp4"></video></div><div class="fine">An example Coach Forecast, for a sample member. Illustrative, not a guarantee.</div>',0]
  ];
  return '<div class="card-tools"><div class="tl-top"><div class="t" data-tt>'+V[0][0]+'<small data-ts>'+V[0][1]+'</small></div><span class="lockb">'+LOCK+'Members only</span></div>'+
    V.map(function(v,i){return '<div class="tview'+(i===0?' on':'')+'" data-i="'+i+'" data-name="'+v[0]+'" data-sub="'+v[1]+'"'+(v[3]?' data-soon="1"':'')+'>'+(v[3]?'<span class="tsoon">Coming soon · preview</span>':'')+v[2]+'</div>';}).join('')+
    '<div class="tl-foot"><div class="idx">'+V.map(function(v,i){return '<button type="button" data-j="'+i+'" aria-pressed="'+(i===0)+'">'+v[0]+'</button>';}).join('')+'</div></div></div>';
}
function fitApp(root,phone){
  var v=root.querySelector('[data-appv]'),a=v.querySelector('.app');
  if(phone){a.className='app m';}
  var W=phone?390:1180,H=phone?540:760,s=v.clientWidth/W;a.style.transform='scale('+s+')';v.style.height=Math.round(H*s)+'px';
}
function Tour(root){
  var self=this;this.r=root;this.tabs=[].slice.call(root.querySelectorAll('.tab'));this.views=[].slice.call(root.querySelectorAll('.view'));this.i=0;this.paused=false;this.dur=5000;
  this.tabs.forEach(function(t){t.addEventListener('click',function(){self.go(+t.getAttribute('data-t'),true);});});
  var w=root.querySelector('.card-wos');w.addEventListener('pointerenter',function(e){if(e.pointerType==='mouse'){self.paused=true;self.bar(false);clearTimeout(self.t);}});
  w.addEventListener('pointerleave',function(e){if(e.pointerType==='mouse'){self.paused=false;self.go(self.i,false);}});
  this.go(0,false);
}
Tour.prototype.bar=function(run){var self=this;this.tabs.forEach(function(t,j){var i=t.querySelector('.pr i');i.style.transition='none';i.style.transform='scaleX('+(j<self.i?1:0)+')';});
  if(run&&!reduce){var c=this.tabs[this.i].querySelector('.pr i');void c.offsetWidth;c.style.transition='transform '+this.dur+'ms linear';c.style.transform='scaleX(1)';}};
Tour.prototype.go=function(i,user){
  if(!this.tabs[0].isConnected)return;var self=this,r=this.r;clearTimeout(this.t);this.i=i;
  this.tabs.forEach(function(t,j){t.setAttribute('aria-selected',j===i?'true':'false');});
  this.views.forEach(function(v,j){v.classList.remove('on');});void r.offsetWidth;this.views[i].classList.add('on');
  r.querySelector('[data-kick]').textContent=TITLES[i][0];r.querySelector('[data-title]').textContent=TITLES[i][1];
  var act=r.querySelector('[data-act]');act.hidden=!TITLES[i][2];act.textContent=TITLES[i][2];
  r.querySelectorAll('.nv').forEach(function(n){var k=+n.getAttribute('data-n');n.classList.toggle('on',(i===0&&k===0)||(i===1&&k===1)||(i===2&&k===3));});
  r.querySelectorAll('[data-mn]').forEach(function(n){var k=+n.getAttribute('data-mn');n.classList.toggle('on',k===i);});
  if(i===0&&!reduce){var el=this.views[0].querySelector('[data-count]'),to=+el.getAttribute('data-count'),t0=performance.now();(function st(t){var p=Math.min(1,(t-t0)/1100),e=1-Math.pow(1-p,3);el.textContent='£'+Math.round(to*e).toLocaleString('en-GB');if(p<1)requestAnimationFrame(st);})(t0);}
  if(user)this.paused=true;
  this.bar(!this.paused);
  if(!this.paused&&!reduce)this.t=setTimeout(function(){self.go((self.i+1)%self.views.length,false);},this.dur);
};
function Tools(root){
  var vs=[].slice.call(root.querySelectorAll('.tview')),bs=[].slice.call(root.querySelectorAll('.idx button')),tt=root.querySelector('[data-tt]'),i=0,t,paused=false;
  function go(j,user){if(!vs[0].isConnected)return;i=j;vs.forEach(function(v,k){v.classList.toggle('on',k===j);});bs.forEach(function(b,k){b.setAttribute('aria-pressed',k===j?'true':'false');});
    tt.innerHTML=vs[j].getAttribute('data-name')+'<small>'+vs[j].getAttribute('data-sub')+'</small>';
    if(user)paused=true;clearTimeout(t);if(!paused&&!reduce)t=setTimeout(function(){go((i+1)%vs.length);},6000);}
  bs.forEach(function(b){b.addEventListener('click',function(){go(+b.getAttribute('data-j'),true);});});
  var c=root.querySelector('.card-tools');c.addEventListener('pointerenter',function(e){if(e.pointerType==='mouse'){paused=true;clearTimeout(t);}});c.addEventListener('pointerleave',function(e){if(e.pointerType==='mouse'){paused=false;go(i);}});
  go(0);
}
window.TEIShow={app:app,tools:tools,fitApp:fitApp,Tour:Tour,Tools:Tools,LOCK:LOCK};
})();

/* ---------- the page (the mock-up's controller, without its review frame) ---------- */
(function(){
'use strict';
var body=document.body;
var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
window.TEI_REDUCED=reduce;body.classList.toggle('reduced',reduce);
var PHONEQ=window.matchMedia('(max-width:860px)');
function isPhone(){return PHONEQ.matches;}
var BD={"a": [10000, 10483, 10273, 10332, 11089, 11632, 11373, 12398, 12108, 12743, 12282, 11035, 11664, 10610, 8490, 7347, 5800, 7823, 8534, 9310, 9717, 9975, 9996, 9760, 10267, 11070, 11691, 12092, 12037, 10161, 11009, 12522, 12407, 12539, 13352, 13192, 14154, 15246, 15955, 16019, 16915, 17588, 17967, 19006, 19079, 19952, 20522, 20389, 20826, 19014, 20543, 19057, 20756, 21573, 21910, 22155, 23846, 24285, 24819, 25767, 27307, 27555, 27700, 29047, 30415, 28836, 28968, 31007, 31671, 32121, 33679, 36081, 30259, 33974, 36855, 39085, 42584, 45446, 47368, 49281, 52061, 50981, 48956, 42732, 44952, 44434, 46520, 46915, 49809, 50798, 51608, 55623, 59003, 63163, 63719, 69042, 70648, 62600, 72254, 76423, 77814, 80619], "b": [10000, 10483, 10273, 10332, 11089, 11632, 11373, 12398, 12108, 12743, 12282, 11035, 11664, 10610, 7609, 5220, 4121, 4879, 5322, 5806, 6060, 6221, 6234, 6087, 6403, 6904, 7291, 7541, 7507, 6337, 6866, 7809, 7737, 7820, 8327, 8227, 8827, 9508, 9951, 9990, 10549, 10968, 11205, 11853, 11899, 12443, 12798, 12716, 12988, 11858, 12811, 11885, 12944, 13454, 13664, 13817, 14871, 15145, 15478, 16069, 17030, 17184, 17275, 18115, 18968, 17984, 18066, 19337, 19752, 20032, 21004, 22501, 14742, 16553, 17956, 19042, 20748, 22142, 23078, 24010, 25365, 24838, 23852, 20820, 21901, 21649, 22665, 22858, 24267, 24749, 25144, 27100, 28747, 30774, 31044, 33638, 34420, 27849, 32144, 33999, 34617, 35865]};
function fmt(n,c){return (c||'£')+Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');}
function $(id){return document.getElementById(id);}
function clamp(x){return x<0?0:x>1?1:x;}

/* Links: every link goes somewhere live (TEI Launch v2 plan, 9 Nov 2026). */
var L={book:'/book',wa:'https://wa.me/447843868245',hub:'/hub/index.html',wos:'/hub/wealth-os.html',wosSettings:'/hub/wealth-os.html?page=mydetails',
  cow:'/guides/cost-of-waiting.html',bestDays:'/articles/missing-the-best-days.html',tax:'/guides/tax.html',stages:'/guides/stages.html',
  principles:'/guides/principles.html',first10k:'/articles/your-first-10k.html',market:'/articles/how-the-stock-market-works.html',
  guides:'/guides.html',membership:'/membership.html',about:'/about.html'};
var LEADS_URL='https://ztyqijiiayrengvxsqkw.supabase.co/rest/v1/leads',LEADS_KEY='sb_publishable_-ufG5z9acIv49A_TSU0YiQ_D2XNDl92';

/* ---------- visitor or member ---------- */
var member=false,heroScene=null,echo=null;
function setWho(m){
  member=!!m;window.TEI_MEMBER=member;body.classList.toggle('member',member);
  msBuild();startEcho();
}

/* ---------- hero ---------- */
function setHero(){
  var ph=isPhone(),hero=$('top'),cp=hero.querySelector('.copy');
  hero.className='hero c-a longlead '+(ph?'poster split':'centre');
  cp.style.opacity='';cp.style.transform='';
  var el=hero.querySelector('.anchor');el.style.fontSize='';
  if(ph){var avail=el.parentElement.clientWidth;el.style.display='inline-block';el.style.fontSize='100px';var w=el.offsetWidth||1;el.style.fontSize=Math.min(130,Math.floor(84*avail/w))+'px';el.style.display='';}
}
function startHero(){
  var ph=isPhone();
  try{heroScene=new TEIHero.Scene($('hwrap'),ph,ph);body.classList.add('dots');if(reduce)heroScene.frame(performance.now());}catch(e){heroScene=null;body.classList.remove('dots');}
}
function startEcho(){
  try{echo=new TEIEcho($('echo'),member);if(reduce)echo.frame(0);}catch(e){echo=null;}
}
function onScreen(el){var r=el.getBoundingClientRect();return r.bottom>0&&r.top<window.innerHeight;}
function loop(now){
  if(!document.hidden&&!reduce){
    if(heroScene&&heroScene.sk<1&&onScreen($('hwrap')))heroScene.frame(now);
    if(echo&&onScreen($('echo')))echo.frame(now);
  }
  requestAnimationFrame(loop);
}

/* ---------- Cost of Waiting teaser ---------- */
function model(monthly,wait){
  var age=28,retire=60,rate=5,inf=0.025,g=Math.pow(1+rate/100,1/12)-1,n=(retire-age)*12,nw=n-12*wait;
  var grow=function(k){return k>0?(Math.pow(1+g,k)-1)/g:0;},toToday=Math.pow(1+inf,retire-age);
  var gap=(monthly*grow(n)-monthly*grow(nw))/toToday,now=[],w=[];
  for(var i=0;i<=32;i++){var t=i*12,d=Math.pow(1+inf,i),tw=t-12*wait;now.push(monthly*grow(t)/d);w.push(tw>0?monthly*grow(tw)/d:0);}
  return {gap:gap,now:now,wait:w};
}
function countTo(el,to,dur,from){
  if(reduce||!dur){el.textContent=fmt(to);el.setAttribute('data-v',to);return;}
  var f=from!=null?from:Number(el.getAttribute('data-v')||0),t0=performance.now();el.setAttribute('data-v',to);
  (function step(t){var p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3);el.textContent=fmt(f+(to-f)*e);if(p<1)requestAnimationFrame(step);})(t0);
}
function pathOf(arr,max,min){min=min||0;return arr.map(function(v,i){return (i/(arr.length-1)*1000).toFixed(1)+' '+(400-((v-min)/(max-min))*380).toFixed(1);});}
var tz={m:300,w:1},tzv=$('tz-v');
function tzRender(anim){
  var m=model(tz.m,tz.w),A=12,now=m.now.slice(A),wt=m.wait.slice(A),max=now[now.length-1]*1.04,min=wt[0]*0.92;
  tz.g=m.now.map(function(v,i){return v-m.wait[i];});
  $('tz-mv').textContent=fmt(tz.m);
  countTo(tzv,m.gap,anim?700:0);
  $('tz-now').textContent=fmt(m.now[32]);$('tz-wait').textContent=fmt(m.wait[32]);$('tz-wl').textContent=tz.w===1?'Wait 1 year':'Wait 5 years';
  var pn=pathOf(now,max,min),pw=pathOf(wt,max,min);
  $('g-now').setAttribute('d','M'+pn.join(' L'));$('g-line').setAttribute('d','M'+pw.join(' L'));
  $('g-area').setAttribute('d','M'+pn.join(' L')+' L'+pw.slice().reverse().join(' L')+'Z');
  var y=function(v){return ((400-((v-min)/(max-min))*380)/400*100).toFixed(2);};
  $('g-dotn').style.top='calc('+y(m.now[32])+'% - 4px)';$('g-dot').style.top='calc('+y(m.wait[32])+'% - 4px)';
  $('tz-run').setAttribute('href',L.cow+'?monthly='+tz.m+'&wait='+tz.w);
}
$('tz-m').addEventListener('input',function(e){tz.m=Number(e.target.value);tzRender(true);});
document.querySelectorAll('.wait button').forEach(function(b){b.addEventListener('click',function(){tz.w=Number(b.getAttribute('data-w'));
  document.querySelectorAll('.wait button').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false');});tzRender(true);});});
tzRender(false);
var lit=false;
function lightTeaser(){if(lit)return;lit=true;var t=$('teaser');t.classList.add('lit');countTo(tzv,model(tz.m,tz.w).gap,reduce?0:1400,0);setTimeout(function(){t.classList.remove('lit');},2600);}

/* scrubbing: horizontal drags and hover read the chart; vertical swipes still scroll */
function scrub(el,line,tip,render){
  var off=0;
  function at(e){var r=el.getBoundingClientRect(),u=clamp((e.clientX-r.left)/r.width);el.classList.add('scrub-on');line.style.left=(u*100)+'%';tip.style.left=Math.min(84,Math.max(16,u*100))+'%';tip.innerHTML=render(u);clearTimeout(off);}
  el.addEventListener('pointermove',at);el.addEventListener('pointerdown',at);
  el.addEventListener('pointerleave',function(){el.classList.remove('scrub-on');});
  el.addEventListener('pointerup',function(e){if(e.pointerType!=='mouse')off=setTimeout(function(){el.classList.remove('scrub-on');},1400);});
}
scrub($('gchart'),$('g-sg'),$('g-tip'),function(u){var i=12+Math.round(u*20);return '<small>Age '+(28+i)+'</small>Waiting costs '+fmt(tz.g[i]);});

/* best days chart from the article's own data */
(function bdDraw(){
  var max=85000,min=0,a=pathOf(BD.a,max,min),b=pathOf(BD.b,max,min);
  $('bd-a').setAttribute('d','M'+a.join(' L'));$('bd-b').setAttribute('d','M'+b.join(' L'));
  $('bd-area').setAttribute('d','M'+a.join(' L')+' L1000 400 L0 400Z');
  var ya=(1-(BD.a[BD.a.length-1]/max)*0.95)*100,yb=(1-(BD.b[BD.b.length-1]/max)*0.95)*100;
  $('bd-ea').style.top='calc('+ya.toFixed(2)+'% - 6px)';$('bd-eb').style.top='calc('+yb.toFixed(2)+'% - 6px)';
  $('bd-va').style.top=ya.toFixed(2)+'%';$('bd-vb').style.top=yb.toFixed(2)+'%';
})();
scrub($('bdc'),$('bd-sg'),$('bd-tip'),function(u){var n=BD.a.length,i=Math.round(u*(n-1)),yr=2006+Math.floor(i/(n-1)*19.99);
  return '<small>'+yr+'</small>'+fmt(BD.a[i],'$')+' <span style="color:#F0A97E">or '+fmt(BD.b[i],'$')+'</span>';});

/* tiers: a typical year of support, one dot per contact */
var SUP={core:{r:[2,8],c:[]},mom:{r:[0,3,6,9],c:[]},ic:{r:[0,3,6,9],c:[1,2,4,5,7,8,10,11]}};
document.querySelectorAll('.tier').forEach(function(t){var s=SUP[t.getAttribute('data-k')],cells='';
  for(var m=0;m<12;m++){cells+='<i class="'+(s.r.indexOf(m)>-1?'r':(s.c.indexOf(m)>-1?'c':''))+'"></i>';}
  t.querySelector('.strip').innerHTML='<small>A year of support</small><div class="row" aria-hidden="true">'+cells+'</div>';});
var tiers=document.querySelectorAll('#tiers .tier');
document.querySelectorAll('.ptabs button').forEach(function(b){b.addEventListener('click',function(){var i=Number(b.getAttribute('data-t'));
  document.querySelectorAll('.ptabs button').forEach(function(x){x.setAttribute('aria-selected',x===b?'true':'false');});
  tiers.forEach(function(t,k){t.classList.toggle('cur',k===i);});});});

/* ---------- Wealth OS and the member tools ---------- */
function msBuild(){
  var mem=member,S=window.TEIShow,m=$('mshow');
  if(window.__osT)clearTimeout(window.__osT);if(window.__tlT)clearTimeout(window.__tlT);
  var tabs=['Wealth','Live forecast','Cashflow'].map(function(n,i){return '<button type="button" class="ostab" role="tab" data-t="'+i+'" aria-selected="'+(i===0)+'">'+n+'<span class="pr"><i></i></span></button>';}).join('');
  var tmp=document.createElement('div');tmp.innerHTML=S.tools();
  var tv=[].slice.call(tmp.querySelectorAll('.tview'));
  var list=tv.map(function(v,i){return '<button type="button" class="lsi" role="tab" data-j="'+i+'" aria-selected="'+(i===0)+'"><b>'+v.getAttribute('data-name')+(v.getAttribute('data-soon')?'<span class="soon">Coming soon</span>':'')+'</b><small>'+v.getAttribute('data-sub')+'</small><span class="pr"><i></i></span></button>';}).join('');
  var stage=tv.map(function(v,i){return '<div class="tview'+(i===0?' on':'')+'" data-i="'+i+'">'+v.innerHTML+'</div>';}).join('');
  var SH=['wealth','forecast','cashflow'],shots=function(v){return SH.map(function(k,i){return '<img class="shot'+(i===0?' on':'')+'" src="/assets/img/home/os-'+k+'-'+v+'.webp" alt="" decoding="async">';}).join('');};
  m.innerHTML='<div class="devs" role="img" aria-label="A sample member\'s Wealth OS on a laptop and a phone: the Wealth, Forecast and Cashflow pages. Example figures.">'+
      '<div class="dkf"><div class="chrome" aria-hidden="true"><i></i><i></i><i></i></div><div class="scr d"><div class="vp">'+shots('d')+'</div></div></div>'+
      '<div class="phf"><span class="island" aria-hidden="true"></span><div class="scr m"><div class="sb9" aria-hidden="true">9:41</div><div class="vp">'+shots('m')+'</div><div class="ptb" aria-hidden="true"><span data-pt="h"><svg viewBox="0 0 24 24"><path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>Home</span><span data-pt="w"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v8l5.5 5.5"/></svg>Wealth</span><span data-pt="p"><svg viewBox="0 0 24 24"><path d="M5 19V9M12 19V5M19 19v-7"/></svg>Plan</span><span data-pt="l"><svg viewBox="0 0 24 24"><path d="M5 4h4v16H5zM10 4h4v16h-4zM15.5 5l3.6-.9 3.4 15.5-3.6.8z"/></svg>Library</span><span data-pt="m"><svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1-3.6 3.8-5.5 7-5.5s6 1.9 7 5.5"/></svg>Me</span></div></div></div>'+
      '<span class="eg">Example figures</span></div>'+
    '<div class="ostabs" role="tablist" aria-label="Wealth OS screens">'+tabs+'</div>'+
    (mem?'<p class="memnote oscta">All of this is in your Client Hub. <a class="lnk" href="'+L.wos+'">Open Wealth OS &rarr;</a></p>'
        :'<div class="oscta"><a class="btn xl" href="'+L.membership+'">See everything members get</a><p>or <a class="lnk" href="'+L.book+'" target="_blank" rel="noopener">book a 30-minute call</a> first</p></div>')+
    '<div class="tl2"><div class="tl2h"><span class="lockb">'+(mem?'<svg viewBox="0 0 12 12"><path d="M2.5 6.5l2.2 2.2L9.5 3.8"/></svg>In your membership':S.LOCK+'Members only')+'</span><h3 class="h">There is more inside, for members.</h3></div>'+
      '<div class="ls"><div class="lsl" role="tablist" aria-label="Member tools">'+list+'</div><div class="lss">'+stage+'</div></div>'+
      '<div class="also4"><p class="alsoh">Also included</p><div class="also"><div><b>Research notes</b>Company and theme notes</div><div><b>Tax and strategy tools</b>Coming soon</div><div><b>Lessons</b>Five stages, at your pace</div><div><b>Knowledge library</b>Every term in one place</div></div></div></div>';
  osTour(m);tlRotate(m);
}
function osTour(m){
  /* each screen scrolls the whole page once, at an even reading speed; the tab moves on when it reaches the bottom */
  var tabs=[].slice.call(m.querySelectorAll('.ostab')),vps=[].slice.call(m.querySelectorAll('.scr .vp')),i=0,paused=false,dur=6500,pt=['w','p','p'],WAIT=900,HOLD=1600;
  function bar(run){tabs.forEach(function(t,j){var b=t.querySelector('.pr i');b.style.transition='none';b.style.transform='scaleX('+(j<i?1:0)+')';});
    if(run&&!reduce){var c=tabs[i].querySelector('.pr i');void c.offsetWidth;c.style.transition='transform '+dur+'ms linear';c.style.transform='scaleX(1)';}}
  function pan(vp,img){img.style.transition='none';img.style.transform='translateY(0)';clearTimeout(img.__t);
    if(reduce||!vp.clientHeight||!vp.offsetParent)return 0;void img.offsetWidth;
    var over=img.offsetHeight-vp.clientHeight;if(over<=0)return 0;
    var t=Math.max(3000,Math.min(14000,over/vp.clientHeight*3200));
    img.__t=setTimeout(function(){img.style.transition='transform '+Math.round(t)+'ms cubic-bezier(.4,0,.25,1)';img.style.transform='translateY(-'+Math.round(over)+'px)';},WAIT);
    return t;}
  function go(j,user){if(!tabs[0].isConnected)return;i=j;clearTimeout(window.__osT);
    tabs.forEach(function(t,k){t.setAttribute('aria-selected',k===j?'true':'false');});
    var longest=0;
    vps.forEach(function(vp){var im=vp.querySelectorAll('.shot');im.forEach(function(x,k){x.classList.toggle('on',k===j);});longest=Math.max(longest,pan(vp,im[j]));});
    dur=longest?WAIT+longest+HOLD:6500;
    m.querySelectorAll('.ptb [data-pt]').forEach(function(x){x.classList.toggle('on',x.getAttribute('data-pt')===pt[j]);});
    if(user)paused=true;bar(!paused);
    if(!paused&&!reduce)window.__osT=setTimeout(function(){go((i+1)%3,false);},dur);}
  tabs.forEach(function(t){t.addEventListener('click',function(){go(+t.getAttribute('data-t'),true);});});
  var d=m.querySelector('.devs');d.addEventListener('pointerenter',function(e){if(e.pointerType==='mouse'){paused=true;bar(false);clearTimeout(window.__osT);}});
  d.addEventListener('pointerleave',function(e){if(e.pointerType==='mouse'){paused=false;go(i,false);}});
  var first=m.querySelectorAll('.shot.on'),left=first.length;
  first.forEach(function(x){if(x.complete)left--;else x.addEventListener('load',function(){if(--left===0)go(i,false);},{once:true});});
  go(0,false);
}
/* Video controls for the member tools: play and pause, a scrubber with chapter
   marks, the time, playback speed, and chapter buttons that skip to a step. */
function vcx(v,onUse){
  var box=v.closest('.tlmedia'),ch=(v.getAttribute('data-ch')||'').split('|').filter(Boolean).map(function(s){var k=s.indexOf(':');return [parseFloat(s.slice(0,k)),s.slice(k+1)];});
  var est=parseFloat(v.getAttribute('data-dur'))||10,SP=[1,1.5,2],si=0,raf=0;
  var PLAY='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',PAUSE='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';
  function len(){return (isFinite(v.duration)&&v.duration)||est;}
  function mmss(s){s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
  var w=document.createElement('div');w.className='vcx';
  w.innerHTML='<div class="vcx-bar" role="group" aria-label="Video controls"><button type="button" class="vcx-pp" aria-label="Play">'+PLAY+'</button>'+
    '<div class="vcx-track"><i class="vcx-fill"></i>'+ch.slice(1).map(function(c){return '<b class="vcx-tick" style="left:'+(c[0]/est*100).toFixed(2)+'%"></b>';}).join('')+
    '<input class="vcx-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Seek"></div>'+
    '<span class="vcx-t tnum">0:00 / '+mmss(est)+'</span><button type="button" class="vcx-sp" aria-label="Playback speed, 1 times">1&times;</button></div>'+
    (ch.length?'<div class="vcx-ch" role="group" aria-label="Skip to">'+ch.map(function(c,k){return '<button type="button" data-k="'+k+'">'+c[1]+'</button>';}).join('')+'</div>':'');
  box.insertAdjacentElement('afterend',w);
  var pp=w.querySelector('.vcx-pp'),seek=w.querySelector('.vcx-seek'),fill=w.querySelector('.vcx-fill'),tt=w.querySelector('.vcx-t'),sp=w.querySelector('.vcx-sp'),cbs=[].slice.call(w.querySelectorAll('.vcx-ch button'));
  function paint(){var d=len(),c=v.currentTime||0,p=Math.min(1,c/d);fill.style.width=(p*100)+'%';if(document.activeElement!==seek)seek.value=String(Math.round(p*1000));
    tt.textContent=mmss(c)+' / '+mmss(d);seek.setAttribute('aria-valuetext',mmss(c)+' of '+mmss(d));
    var on=0;ch.forEach(function(x,k){if(c>=x[0]-0.05)on=k;});cbs.forEach(function(b,k){if(k===on)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');});}
  function loop(){paint();if(!v.paused)raf=requestAnimationFrame(loop);}
  function state(){var on=!v.paused&&!v.ended;pp.innerHTML=on?PAUSE:PLAY;pp.setAttribute('aria-label',on?'Pause':'Play');cancelAnimationFrame(raf);if(on)raf=requestAnimationFrame(loop);else paint();}
  function go(){var p=v.play();if(p&&p.catch)p.catch(function(){});}
  ['play','pause','ended','loadedmetadata','seeked'].forEach(function(e){v.addEventListener(e,state);});
  box.addEventListener('click',function(){onUse();if(v.paused)go();else v.pause();});
  pp.addEventListener('click',function(){onUse();if(v.paused)go();else v.pause();});
  seek.addEventListener('input',function(){onUse();try{v.currentTime=seek.value/1000*len();}catch(e){}paint();});
  sp.addEventListener('click',function(){onUse();si=(si+1)%SP.length;v.playbackRate=SP[si];sp.innerHTML=SP[si]+'&times;';sp.setAttribute('aria-label','Playback speed, '+SP[si]+' times');});
  cbs.forEach(function(b){b.addEventListener('click',function(){onUse();try{v.currentTime=ch[+b.getAttribute('data-k')][0];}catch(e){}paint();go();});});
  v.addEventListener('ratechange',function(){var k=SP.indexOf(v.playbackRate);if(k>-1){si=k;sp.innerHTML=SP[k]+'&times;';}});
  paint();
}
function tlRotate(m){
  /* Items rotate every 6s. An item with a video stays up until the video ends,
     plays only while the list is on screen, and loops once someone picks it. */
  var bs=[].slice.call(m.querySelectorAll('.lsi')),vs=[].slice.call(m.querySelectorAll('.lss .tview')),i=0,paused=false,seen=false,DUR=6000;
  function vid(j){return vs[j]&&vs[j].querySelector('video');}
  function vlen(v){return (isFinite(v.duration)&&v.duration)||parseFloat(v.getAttribute('data-dur'))||6;}
  function dur(j){var v=vid(j);if(!v)return DUR;return Math.max(DUR,(vlen(v)-(v.currentTime||0))/(v.playbackRate||1)*1000+400);}
  /* someone used a video's controls: the list stops rotating and the video loops */
  function takeOver(){paused=true;clearTimeout(window.__tlT);var c=bs[i].querySelector('.pr i');c.style.transition='none';c.style.transform='scaleX(0)';var v=vid(i);if(v)v.loop=true;}
  vs.forEach(function(view){var v=view.querySelector('video');if(v)vcx(v,takeOver);});
  function play(j){var v=vid(j);if(!v||reduce||!seen)return;v.loop=paused;var p=v.play();if(p&&p.catch)p.catch(function(){});}
  function bar(j,ms,from){var c=bs[j].querySelector('.pr i');c.style.transition='none';c.style.transform='scaleX('+(from||0)+')';if(paused||reduce||!seen)return;void c.offsetWidth;c.style.transition='transform '+ms+'ms linear';c.style.transform='scaleX(1)';}
  function tick(){clearTimeout(window.__tlT);if(paused||reduce||!seen)return;var ms=dur(i),v=vid(i),from=v&&v.duration?Math.min(1,v.currentTime/v.duration):0;bar(i,ms,from);window.__tlT=setTimeout(function(){go((i+1)%bs.length);},ms);}
  function go(j,user){if(!bs[0].isConnected)return;i=j;clearTimeout(window.__tlT);
    if(user)paused=true;
    bs.forEach(function(b,k){b.setAttribute('aria-selected',k===j?'true':'false');var p=b.querySelector('.pr i');p.style.transition='none';p.style.transform='scaleX(0)';});
    vs.forEach(function(v,k){v.classList.toggle('on',k===j);var x=vid(k);if(x&&k!==j){x.pause();try{x.currentTime=0;}catch(e){}}});
    var v=vid(j);if(v){try{v.currentTime=0;}catch(e){}play(j);}
    tick();}
  bs.forEach(function(b){b.addEventListener('click',function(){go(+b.getAttribute('data-j'),true);});});
  var ls=m.querySelector('.ls');
  ls.addEventListener('pointerenter',function(e){if(e.pointerType==='mouse'&&!paused){paused=true;clearTimeout(window.__tlT);var c=bs[i].querySelector('.pr i');c.style.transform=getComputedStyle(c).transform;c.style.transition='none';var v=vid(i);if(v)v.loop=true;ls.__hover=true;}});
  ls.addEventListener('pointerleave',function(e){if(e.pointerType==='mouse'&&ls.__hover){ls.__hover=false;paused=false;var v=vid(i);if(v)v.loop=false;tick();}});
  if('IntersectionObserver' in window){new IntersectionObserver(function(es){es.forEach(function(e){seen=e.isIntersecting;var v=vid(i);if(seen){play(i);tick();}else{clearTimeout(window.__tlT);if(v)v.pause();}});},{threshold:.35}).observe(ls);}
  else seen=true;
  go(0);
}

/* ---------- stage check ---------- */
var Q=[
  {q:'Do you have money set aside for emergencies?',o:[['Yes, at least three months of spending','y'],['Some, but not much','some'],['Not yet','n']]},
  {q:'Are you investing yet?',o:[['Yes, regularly','y'],['A little, now and then','some'],['Not yet','n']]},
  {q:'Do you have a goal with a date on it?',o:[['Yes','y'],['Not yet','n']]}
];
var R={
  net:{stg:'Closest stage · 1, The Foundations',h:'Start with the safety net.',p:'A cash buffer for the unexpected comes first in every plan we write.',a:[['Guide','Five Stages, Stage 1','lead',L.stages],['Article','Your First £10k','',L.first10k]]},
  save:{stg:'Closest stage · 2, Building the Base',h:'You are saving. Next is time in the market.',p:'Cash is safe in the short term but loses buying power over time.',a:[['Tool','Cost of Waiting','lead',L.cow],['Article','How the Stock Market Works','',L.market]]},
  order:{stg:'Closest stage · 3, Growing with Confidence',h:'You are investing. Now put it in order.',p:'Which account, in which order, and what it is all for.',a:[['Guide','The Tax Wrapper Guide','lead',L.tax],['Coaching','Book a call','',L.book]]},
  plan:{stg:'Closest stage · 4, Investment Philosophy',h:'You have the pieces. A plan joins them up.',p:'One written plan, the reasoning behind each step, and someone checking it with you.',a:[['Coaching','Book a call','lead',L.book],['Guide','Our principles','',L.principles]]}
};
var qz=$('quiz'),ans=[],qi=0;
function result(){if(ans[0]==='n')return 'net';if(ans[1]==='n')return 'save';if(ans[2]==='n')return 'order';return 'plan';}
function renderQ(){
  if(qi>=Q.length)return renderR();
  var d=Q.map(function(_,i){return '<i class="'+(i<=qi?'on':'')+'"></i>';}).join('');
  qz.innerHTML='<div class="qdots">'+d+'<span>Question '+(qi+1)+' of '+Q.length+'</span></div><h3>'+Q[qi].q+'</h3><div class="opts">'+
    Q[qi].o.map(function(o){return '<button type="button" data-a="'+o[1]+'">'+o[0]+'</button>';}).join('')+'</div>'+
    (qi>0?'<button class="qback" type="button">Back</button>':'<p class="illus" style="margin-top:16px">No sign-up needed. Your answers stay on this page.</p>');
  qz.querySelectorAll('.opts button').forEach(function(b){b.addEventListener('click',function(){ans[qi]=b.getAttribute('data-a');qi++;renderQ();var f=qz.querySelector('button');if(f)f.focus();});});
  var bk=qz.querySelector('.qback');if(bk)bk.addEventListener('click',function(){qi--;renderQ();});
}
function renderR(){
  var key=result(),x=R[key];
  qz.innerHTML='<div class="qdots"><i class="on"></i><i class="on"></i><i class="on"></i><span>Your result</span></div><div class="res"><div class="stg">'+x.stg+'</div><h3>'+x.h+'</h3><p>'+x.p+'</p>'+
    '<div class="go2">'+x.a.map(function(a){return '<a href="'+a[3]+'" class="'+a[2]+'"'+(a[3]===L.book?' target="_blank" rel="noopener"':'')+'><span><small>'+a[0]+'</small><b>'+a[1]+'</b></span><span aria-hidden="true">→</span></a>';}).join('')+'</div>'+
    '<form class="mailme" id="mm" novalidate><label for="mm-e" style="position:absolute;left:-9999px">Email address</label><input id="mm-e" type="email" placeholder="Email me my result (optional)" autocomplete="email"><button class="btn o" type="submit">Send</button></form><p class="sent" id="mm-ok" hidden>Sent. Check your inbox.</p>'+
    '<div class="res-foot"><a href="'+L.wa+'" target="_blank" rel="noopener">Rather talk first? WhatsApp us</a><button type="button" id="rt">Retake</button></div></div>';
  $('rt').addEventListener('click',function(){ans=[];qi=0;renderQ();});
  /* "Email me my result" goes to leads, source stage-check, with the stage. */
  $('mm').addEventListener('submit',function(e){e.preventDefault();var v=$('mm-e').value.trim(),ok=$('mm-ok'),btn=this.querySelector('button');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)){ok.textContent='Enter a valid email address.';ok.hidden=false;$('mm-e').focus();return;}
    btn.disabled=true;
    fetch(LEADS_URL,{method:'POST',headers:{'Content-Type':'application/json','apikey':LEADS_KEY,'Authorization':'Bearer '+LEADS_KEY,'Prefer':'return=minimal'},
      body:JSON.stringify({contact_method:'email',contact_value:v,source:'stage-check',stage:x.stg.replace('Closest stage · ','')})})
      .then(function(r){if(!r.ok)throw new Error(r.status);ok.textContent='Sent. Check your inbox.';ok.hidden=false;$('mm').reset();})
      .catch(function(){ok.textContent='That did not go through. Please try again.';ok.hidden=false;})
      .then(function(){btn.disabled=false;});});
}
renderQ();
var lastFocus=null;
function openSheet(){lastFocus=document.activeElement;body.classList.add('sheet-on');$('sheet').setAttribute('aria-hidden','false');$('sheet').removeAttribute('inert');setTimeout(function(){var b=qz.querySelector('button');if(b)b.focus();},350);}
function closeSheet(){body.classList.remove('sheet-on');$('sheet').setAttribute('aria-hidden','true');$('sheet').setAttribute('inert','');if(lastFocus)lastFocus.focus();}
$('sheet').setAttribute('inert','');
document.querySelectorAll('.js-check').forEach(function(b){b.addEventListener('click',function(e){e.preventDefault();openSheet();});});
$('shx').addEventListener('click',closeSheet);$('scrim').addEventListener('click',closeSheet);
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&body.classList.contains('sheet-on'))closeSheet();});

/* ---------- reveal on view (the resting state shows within 7s regardless) ---------- */
(function watch(){
  var els=document.querySelectorAll('.anim');
  if(reduce||!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('on');});
    var t=$('teaser');if(reduce&&'IntersectionObserver' in window){var o=new IntersectionObserver(function(es){if(es.some(function(e){return e.isIntersecting;})){o.disconnect();lightTeaser();}},{threshold:.2});o.observe(t);}
    return;}
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;e.target.classList.add('on');io.unobserve(e.target);});},{threshold:.2});
  els.forEach(function(e){io.observe(e);});
  setTimeout(function(){els.forEach(function(e){e.classList.add('on');});},7000);
})();

/* ---------- The Hidden Cost video ---------- */
var vfig=$('vid'),hcv=$('hcv'),hcs=$('hcs'),vprog=$('vprog'),vctl=$('vctl'),vStarted=false,vio=null;
function setCut(){
  var ph=isPhone(),src=ph?'/assets/video/hidden-cost-9x16.mp4':'/assets/video/hidden-cost-16x9.mp4',pst=ph?'/assets/video/hidden-cost-poster-9x16.webp':'/assets/video/hidden-cost-poster-16x9.webp';
  if(hcs.getAttribute('src')===src){watchVid();return;}
  try{hcv.pause();}catch(e){}hcs.setAttribute('src',src);hcv.setAttribute('poster',pst);hcv.load();vStarted=false;vfig.classList.remove('playing');vprog.style.width='0';vctl.textContent='Play';vctl.setAttribute('aria-label','Play');
  watchVid();
}
function vPlay(){var p=hcv.play();if(p&&p.catch)p.catch(function(){});}
hcv.addEventListener('play',function(){vfig.classList.add('playing');vctl.textContent='Pause';vctl.setAttribute('aria-label','Pause');});
hcv.addEventListener('pause',function(){if(!hcv.ended){vctl.textContent='Play';vctl.setAttribute('aria-label','Play');}});
hcv.addEventListener('ended',function(){vfig.classList.remove('playing');vctl.textContent='Replay';vctl.setAttribute('aria-label','Replay');lightTeaser();});
hcv.addEventListener('timeupdate',function(){if(hcv.duration)vprog.style.width=(hcv.currentTime/hcv.duration*100)+'%';});
$('vplay').addEventListener('click',function(){vStarted=true;vPlay();});
vctl.addEventListener('click',function(){vStarted=true;if(hcv.ended){hcv.currentTime=0;vPlay();}else if(hcv.paused)vPlay();else hcv.pause();});
hcv.addEventListener('click',function(){if(!hcv.paused)hcv.pause();});
function watchVid(){
  if(vio)vio.disconnect();
  if(reduce||!('IntersectionObserver' in window))return; /* reduced motion: poster and the play button only */
  vio=new IntersectionObserver(function(es){es.forEach(function(e){
    if(e.isIntersecting&&!vStarted){vStarted=true;vPlay();}
    else if(!e.isIntersecting&&!hcv.paused)hcv.pause();
  });},{threshold:.5});
  vio.observe(hcv);
}

/* ---------- phone scroll: hero fades and drifts up ---------- */
window.addEventListener('scroll',function(){
  if(!isPhone())return;
  var hh=$('top').offsetHeight,st=window.scrollY,sk=clamp((st-30)/(hh*0.75)),cp=$('top').querySelector('.copy');
  if(heroScene){heroScene.sk=sk;if(reduce)heroScene.frame(performance.now());}
  if(!reduce){cp.style.opacity=String(1-sk);cp.style.transform='translateY('+(-sk*36).toFixed(1)+'px)';}
},{passive:true});

/* ---------- tools lift point and star mask follow the real layout ---------- */
function starMask(){
  var page=$('page'),stars=page.querySelector('.stars');
  var pr=page.getBoundingClientRect();
  function top(el){return el.getBoundingClientRect().top-pr.top;}
  var ins=$('inside'),tl=ins.querySelector('.tl2'),v=$('wait'),te=$('tei');
  var ph=isPhone(),fh=ph?140:240,fl=ph?180:320,lf=ph?180:300;
  var lift=tl?Math.max(0,top(tl)-top(ins)-(ph?24:48)):null;
  if(lift!=null)ins.style.setProperty('--lift-at',lift+'px');
  if(!stars)return;
  var a=top(v),b=top(ins),c=b+(lift==null?1e6:lift),d=top(te),px=function(n){return Math.round(n)+'px';};
  var m='linear-gradient(to bottom,#000 0,#000 '+px(a)+',transparent '+px(a+fh)+',transparent '+px(b)+',#000 '+px(b+fl)+',#000 '+px(c)+',transparent '+px(c+lf)+',transparent '+px(d)+',#000 '+px(d+fl)+',#000 100%)';
  stars.style.webkitMaskImage=m;stars.style.maskImage=m;
}
var smT;function queueMask(){clearTimeout(smT);smT=setTimeout(starMask,60);}
try{new ResizeObserver(queueMask).observe($('page'));}catch(e){}

/* ---------- start ---------- */
function layoutAll(){setCut();setHero();requestAnimationFrame(function(){startHero();startEcho();queueMask();});}
var lastPhone=isPhone();
window.addEventListener('resize',function(){queueMask();if(isPhone()!==lastPhone){lastPhone=isPhone();msBuild();}clearTimeout(window.__hpR);window.__hpR=setTimeout(layoutAll,200);});
(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(function(){
  body.classList.add('js');
  msBuild();layoutAll();requestAnimationFrame(loop);
  /* Members see their own version: the existing session check (/assets/members.js). */
  if(window.TeiMembers&&TeiMembers.ready){TeiMembers.ready().then(function(r){if(r)setWho(true);}).catch(function(){});}
});
})();
