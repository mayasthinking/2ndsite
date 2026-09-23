/** Washcode painter v2. Deterministic stroke materials; no source pixels or eval.
 * Helpers stay inside renderProgram so saved programs can export offline.
 */
export const PROGRAM_RENDERER_VERSION = '2.7.3';
export function validateProgram(p) {
  const media=['watercolor','sketch','oil'];
  if(p?.detail!=null&&p.detail!=='fine')throw Error('Invalid detail mode');
  if(p?.format!=='washcode-program'||!/^#[\da-f]{6}$/i.test(p.paper)||!Array.isArray(p.marks)||!p.marks.length)throw Error('Invalid painting program');
  if(p.medium!=null&&!media.includes(p.medium))throw Error('Invalid painting medium');
  if(p.seed!=null&&(!Number.isInteger(p.seed)||Math.abs(p.seed)>2147483647))throw Error('Invalid painting seed');
  for(const m of p.marks){
    if(m.seed!=null&&(!Number.isInteger(m.seed)||Math.abs(m.seed)>2147483648))throw Error('Invalid mark seed');
    if(!['wash','stroke'].includes(m.op)||!/^#[\da-f]{6}$/i.test(m.color)||!Array.isArray(m.points)||m.points.length<(m.op==='wash'?3:2))throw Error('Invalid paint mark');
    for(const pt of m.points)if(!Array.isArray(pt)||pt.length!==2||pt.some(n=>!Number.isFinite(n)||n < -100||n>1100))throw Error('Invalid mark coordinates');
    for(const [key,max] of [['opacity',1],['size',100],['bleed',1]])if(!Number.isFinite(m[key])||m[key]<0||m[key]>max)throw Error('Invalid paint material');
    if(m.medium!=null&&!media.includes(m.medium))throw Error('Invalid mark medium');
    if(m.brush!=null&&!['rubbed','dragged','woven'].includes(m.brush))throw Error('Invalid brush');
    if(m.pigments!=null&&(!Array.isArray(m.pigments)||m.pigments.length<1||m.pigments.length>8||m.pigments.some(c=>!/^#[\da-f]{6}$/i.test(c))))throw Error('Invalid brush pigments');
    for(const key of ['texture','wetness','smoothing','load','tooth','body','relief'])if(m[key]!=null&&(!Number.isFinite(m[key])||m[key]<0||m[key]>1))throw Error('Invalid '+key);
    if(m.angle!=null&&(!Number.isFinite(m.angle)||Math.abs(m.angle)>360))throw Error('Invalid brush angle');
    if(m.pressure!=null&&(!Array.isArray(m.pressure)||m.pressure.length<2||m.pressure.length>16||m.pressure.some(v=>!Number.isFinite(v)||v<0||v>1)))throw Error('Invalid pressure curve');
    if(m.taper!=null&&(!Array.isArray(m.taper)||m.taper.length!==2||m.taper.some(v=>!Number.isFinite(v)||v<0||v>1)))throw Error('Invalid stroke taper');
    if(m.blend!=null&&!['normal','multiply'].includes(m.blend))throw Error('Invalid paint blend');
  }
  return p;
}
export async function renderProgram(program,canvas,{width=1600,height=1200,onProgress,isCancelled,onMetrics}={}) {
  const now=()=>performance.now(),started=onMetrics?now():0;
  let textureMs=0,yieldMs=0,pixelReads=0;
  validateProgram(program);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096)throw Error('Canvas dimensions must be integers from 1 to 4096');
  if(isCancelled?.())return false;
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('Canvas 2D is unavailable');
  const unit=Math.min(width,height)/1000;
  const layer=canvas.ownerDocument.createElement('canvas');
  const lc=layer.getContext('2d',{willReadFrequently:true});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  let seed=program.seed??1885;
  function rand(){seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;}
  function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
  function tint(c,delta){return `rgb(${c.map(v=>Math.round(clamp(v+delta,0,255))).join(',')})`;}
  function hash(x,y){let n=Math.imul(x+1885,374761393)^Math.imul(y+37,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
  // Arc-length samples of a smooth Hermite path. Width/texture remain isotropic
  // on portrait and landscape output instead of stretching with normalized axes.
  function samples(points,smoothing){
    const out=[];let distance=0;
    for(let i=0;i<points.length-1;i++){
      const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];
      const steps=Math.max(2,Math.ceil(Math.hypot(c[0]-b[0],c[1]-b[1])/Math.max(1.5,2*unit)));
      for(let j=0;j<steps;j++){
        const t=j/steps,t2=t*t,t3=t2*t;
        const point=[0,1].map(k=>(2*t3-3*t2+1)*b[k]+(t3-2*t2+t)*(c[k]-a[k])*.5*smoothing+(-2*t3+3*t2)*c[k]+(t3-t2)*(d[k]-b[k])*.5*smoothing);
        if(out.length)distance+=Math.hypot(point[0]-out.at(-1).x,point[1]-out.at(-1).y);
        out.push({x:point[0],y:point[1],distance});
      }
    }
    const end=points.at(-1);distance+=Math.hypot(end[0]-out.at(-1).x,end[1]-out.at(-1).y);out.push({x:end[0],y:end[1],distance});
    for(let i=0;i<out.length;i++){const a=out[Math.max(0,i-1)],b=out[Math.min(out.length-1,i+1)],len=Math.hypot(b.x-a.x,b.y-a.y)||1;out[i].nx=-(b.y-a.y)/len;out[i].ny=(b.x-a.x)/len;out[i].t=out[i].distance/(distance||1);}
    return out;
  }
  function pressure(t,m){
    const curve=m.pressure??[.55,.95,.8,.45],u=t*(curve.length-1),i=Math.min(curve.length-2,Math.floor(u));
    let p=curve[i]+(curve[i+1]-curve[i])*(u-i);
    const taper=m.taper??[.45,.8];
    const smooth=t=>t*t*(3-2*t);
    if(t<.18)p*=1-taper[0]*(1-smooth(t/.18));
    if(t>.82)p*=1-taper[1]*(1-smooth((1-t)/.18));
    return p;
  }
  function ribbon(s,m,scale=1){
    const p=new Path2D();
    s.forEach((v,i)=>{const r=m.size*unit*pressure(v.t,m)*.5*scale,x=v.x+v.nx*r,y=v.y+v.ny*r;i?p.lineTo(x,y):p.moveTo(x,y);});
    for(let i=s.length-1;i>=0;i--){const v=s[i],r=m.size*unit*pressure(v.t,m)*.5*scale;p.lineTo(v.x-v.nx*r,v.y-v.ny*r);}p.closePath();return p;
  }
  function outline(points,smoothing){
    const p=new Path2D();
    if(!smoothing){points.forEach((v,i)=>i?p.lineTo(...v):p.moveTo(...v));p.closePath();return p;}
    // Round only a fraction of each corner, preserving the footprint and details.
    const f=smoothing*.44;
    const before=points.map((v,i)=>{const a=points[(i+points.length-1)%points.length];return [v[0]+(a[0]-v[0])*f,v[1]+(a[1]-v[1])*f];});
    const after=points.map((v,i)=>{const b=points[(i+1)%points.length];return [v[0]+(b[0]-v[0])*f,v[1]+(b[1]-v[1])*f];});
    p.moveTo(...before[0]);for(let i=0;i<points.length;i++){p.quadraticCurveTo(...points[i],...after[i]);p.lineTo(...before[(i+1)%points.length]);}p.closePath();return p;
  }
  function principalAngle(points){
    const cx=points.reduce((s,p)=>s+p[0],0)/points.length,cy=points.reduce((s,p)=>s+p[1],0)/points.length;
    let xx=0,xy=0,yy=0;for(const [x,y] of points){xx+=(x-cx)**2;xy+=(x-cx)*(y-cy);yy+=(y-cy)**2;}return .5*Math.atan2(2*xy,xx-yy);
  }
  // Filaments follow a shared centerline but differ in offset, coverage and pigment.
  function bristles(target,s,m,medium,c){
    const texture=m.texture??(medium==='oil'?.7:.6),count=medium==='oil'?36:14;
    for(let j=0;j<count;j++){
      const offset=(j/(count-1)-.5)*.95,jitter=(rand()-.5)*unit;
      target.strokeStyle=tint(c,medium==='oil'?(rand()-.42)*42:(rand()-.5)*15);
      target.lineWidth=Math.max(.25*unit,m.size*unit/(count*(medium==='oil'?1.5:2.2)));
      target.globalAlpha=medium==='oil'?.35+rand()*.4:.18+rand()*.35;
      target.beginPath();let pen=false;
      for(const v of s){
        const coverage=pressure(v.t,m);if(coverage<.015||rand()<texture*(medium==='oil'?.045:.2)){pen=false;continue;}
        const r=offset*m.size*unit*coverage+jitter*Math.sin(v.t*9+j),x=v.x+v.nx*r,y=v.y+v.ny*r;
        if(pen)target.lineTo(x,y);else target.moveTo(x,y);pen=true;
      }
      target.stroke();
    }
  }
  function noise(x,y){
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
    const u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
    return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v;
  }
  // Paint is deposited as coherent bristle tracks, with persistent gaps along the
  // gesture. Color stays on individual filaments instead of averaging to gray.
  function surfaceBrush(target,s,m,c){
    const kind=m.brush,load=m.load??.8,tooth=m.tooth??.65;
    const pigments=(m.pigments??[m.color]).map(rgb);
    const body=m.body??0;
    // Oil has a loaded pigment body beneath bristle tracks. Previously the
    // surface-brush path ignored medium here, leaving oil as transparent filaments.
    if(m.medium==='oil'&&body>0){
      target.save();target.fillStyle=m.color;target.globalAlpha=body*load*.88;
      target.fill(ribbon(s,m));target.restore();
    }
    // Overlapping loaded passes: dark shoulder, body, broken lighter face.
    if(m.relief>0){for(let i=0;i<s.length-1;i+=3){
      const v=s[i],end=s[Math.min(s.length-1,i+6)],w=m.size*unit*pressure(v.t,m);
      if(w<.2*unit)continue;
      for(let band=0;band<3;band++){
        const offset=(band-1)*.22*w,contact=noise(v.distance/(unit*13),band+41);
        target.strokeStyle=tint(c,[-17,0,13][band]*m.relief);
        target.globalAlpha=(.32+contact*.3)*m.relief*load;
        target.lineWidth=w*(.32+contact*.18);
        target.beginPath();target.moveTo(v.x+v.nx*offset,v.y+v.ny*offset);
        target.lineTo(end.x+end.nx*offset,end.y+end.ny*offset);target.stroke();
      }
    }}
    if(body>0){
      // Local overlapping pigment patches give the stroke substance beneath detail.
      for(let i=0;i<s.length;i+=2){const v=s[i],w=m.size*unit*pressure(v.t,m);if(w<unit)continue;
        target.fillStyle=tint(pigments[Math.floor(rand()*pigments.length)],(rand()-.5)*8);target.globalAlpha=body*(.16+load*.14);target.beginPath();
        target.ellipse(v.x+v.nx*(rand()-.5)*w*.48,v.y+v.ny*(rand()-.5)*w*.48,w*(.12+rand()*.16),w*(.08+rand()*.15),Math.atan2(-v.nx,v.ny),0,Math.PI*2);target.fill();}
    }
    if(kind==='rubbed'){
      // Broad pigment contact is built from small overlapping deposits. There are
      // deliberately no longitudinal bristle rails in a rubbed mark.
      for(let i=0;i<s.length;i++){
        const v=s[i],p=pressure(v.t,m),width=m.size*unit*p;
        const deposits=Math.max(2,Math.ceil(width/unit*2));
        for(let j=0;j<deposits;j++){
          const offset=(rand()-.5)*width,along=(rand()-.5)*3*unit;
          const x=v.x+v.nx*offset+v.ny*along,y=v.y+v.ny*offset-v.nx*along;
          const contact=noise(x/(unit*5),y/(unit*5));
          const edge=Math.max(0,1-Math.pow(Math.abs(offset)/(width*.5||1),5));
          if(rand()>(.35+contact*.65)*load*edge)continue;
          const pigment=pigments[Math.min(pigments.length-1,Math.floor(noise(x/(unit*37),y/(unit*31))*pigments.length))];
          target.fillStyle=tint(pigment,(rand()-.5)*10);
          target.globalAlpha=(.12+rand()*.38)*edge;
          target.beginPath();target.ellipse(x,y,(.35+rand()*.85)*unit,(.2+rand()*.55)*unit,rand()*Math.PI,0,Math.PI*2);target.fill();
        }
      }
      return;
    }
    if(kind==='woven'){
      // Short interleaved diagonal gestures share the path's local tangent. They
      // cross one another, rather than repeating full-length parallel filaments.
      // The local body deposits provide coverage; no continuous silhouette fill.
      for(let pass=0;pass<3;pass++)for(let i=0;i<s.length;i+=2){
        const v=s[i],p=pressure(v.t,m),width=m.size*unit*p;
        for(let j=0;j<Math.ceil(width/(3*unit));j++){
          const offset=(rand()-.5)*width*.93;
          const cx=v.x+v.nx*offset,cy=v.y+v.ny*offset;
          const sign=pass%2?-1:1,angle=sign*(.35+rand()*.5);
          const tx=v.ny*Math.cos(angle)+v.nx*Math.sin(angle),ty=-v.nx*Math.cos(angle)+v.ny*Math.sin(angle);
          const len=(2+rand()*7)*unit;
          target.strokeStyle=tint(pigments[Math.floor(rand()*pigments.length)],(rand()-.5)*12);
          target.globalAlpha=(.25+rand()*.5)*load;
          target.lineWidth=(.25+rand()*.55)*unit;
          target.beginPath();target.moveTo(cx-tx*len/2,cy-ty*len/2);
          target.quadraticCurveTo(cx+v.nx*unit,cy+v.ny*unit,cx+tx*len/2,cy+ty*len/2);target.stroke();
        }
      }
      return;
    }
    // Dragged paint: continuous, subpixel bristle grooves with softly changing
    // pigment loading. Segment opacity fades instead of leaving rectangular gaps.
    // Overlapping bristle bundles carry substantial paint, interrupted by tooth.
    // A shared contact field keeps gaps coherent across neighboring filaments.
    const bundles=Math.max(7,Math.min(48,Math.ceil(m.size*.65)));
    for(let j=0;j<bundles;j++){
      const offset=(j+.5)/bundles-.5,phase=rand()*24;
      target.strokeStyle=tint(pigments[Math.floor(rand()*pigments.length)],(rand()-.5)*7);
      let prev=null;
      for(const v of s){
        const w=m.size*unit*pressure(v.t,m),d=v.distance/unit;
        const contact=noise(d/9,offset*8+12),edge=Math.pow(Math.max(0,1-Math.pow(Math.abs(offset)*2,4)),.65);
        const r=offset*w+(noise(d/18,phase)-.5)*w*.055;
        const x=v.x+v.nx*r,y=v.y+v.ny*r;
        if(prev&&w>unit*.2){
          target.lineWidth=Math.max(.3*unit,w/bundles*1.8);
          target.globalAlpha=load*edge*Math.max(0,contact-tooth*.36)*.95;
          target.beginPath();target.moveTo(prev[0],prev[1]);target.lineTo(x,y);target.stroke();
        }
        prev=[x,y];
      }
    }
    const count=Math.min(360,Math.max(32,Math.ceil(m.size*3.5)));
    for(let j=0;j<count;j++){
      const offset=(j+.15+rand()*.7)/count-.5,phase=rand()*80;
      const pigment=pigments[Math.floor(rand()*pigments.length)];
      target.strokeStyle=tint(pigment,(rand()-.5)*12);
      target.lineWidth=Math.max(.16*unit,m.size*unit/count*(.55+rand()*.75));
      let previous=null;
      for(const v of s){
        const p=pressure(v.t,m),distance=v.distance/unit;
        const loading=noise(distance/38,phase);
        const wobble=(noise(distance/42,phase+90)-.5)*m.size*unit*.016;
        const r=offset*m.size*unit*p+wobble,x=v.x+v.nx*r,y=v.y+v.ny*r;
        if(previous&&p>.01){
          target.globalAlpha=Math.max(0,loading-.12-tooth*.18-v.t*.06)*load*1.4*Math.max(0,1-Math.pow(Math.abs(offset)*2,6));
          target.beginPath();target.moveTo(previous[0],previous[1]);target.lineTo(x,y);target.stroke();
        }
        previous=[x,y];
      }
    }
    target.save();target.globalCompositeOperation='destination-out';
    for(let j=0;j<Math.ceil(m.size*.18*tooth);j++){
      const offset=(rand()-.5)*.94,start=rand()*.65,end=Math.min(1,start+.1+rand()*.35);
      target.globalAlpha=.15+rand()*.3;target.lineWidth=(.12+rand()*.28)*unit;target.beginPath();let pen=false;
      for(const v of s){if(v.t<start||v.t>end)continue;const r=offset*m.size*unit*pressure(v.t,m),x=v.x+v.nx*r,y=v.y+v.ny*r;if(pen)target.lineTo(x,y);else target.moveTo(x,y);pen=true;}target.stroke();
    }
    target.restore();
  }
  ctx.fillStyle=program.paper;ctx.fillRect(0,0,width,height);
  for(let index=0;index<program.marks.length;index++){
    if(isCancelled?.())return false;
    const m=program.marks[index],medium=m.medium??program.medium??'watercolor';
    if(m.seed!=null)seed=m.seed;
    if(m.opacity===0||(m.op==='stroke'&&(m.size===0||m.pressure?.every(p=>p===0))))continue;
    const c=rgb(m.color),texture=m.texture??(medium==='watercolor'?.5:.65),wetness=m.wetness??m.bleed;
    const smoothing=m.smoothing??(m.op==='stroke'?.65:Math.min(.9,.35+m.bleed*.5));
    const pts=m.points.map(([x,y])=>[x*width/1000,y*height/1000]);
    const s=m.op==='stroke'?samples(pts,smoothing):null;
    const shape=s?ribbon(s,m):outline(pts,smoothing);
    const extent=s?s.map(v=>[v.x,v.y]):pts;
    const pad=Math.ceil((m.op==='stroke'?m.size*.6:0)*unit+12*unit*wetness+4);
    const bx=Math.max(0,Math.floor(Math.min(...extent.map(p=>p[0]))-pad)),by=Math.max(0,Math.floor(Math.min(...extent.map(p=>p[1]))-pad));
    const right=Math.min(width,Math.ceil(Math.max(...extent.map(p=>p[0]))+pad)),bottom=Math.min(height,Math.ceil(Math.max(...extent.map(p=>p[1]))+pad));
    if(right<=bx||bottom<=by)continue;
    layer.width=right-bx;layer.height=bottom-by;
    lc.setTransform(1,0,0,1,-bx,-by);lc.lineJoin='round';lc.lineCap='round';
    lc.fillStyle=m.color;
    if(m.brush){
      lc.save();if(!s)lc.clip(shape);
      if(s)surfaceBrush(lc,s,{...m,medium},c);
      else{
        const angle=(m.angle??-25)*Math.PI/180,dx=Math.cos(angle),dy=Math.sin(angle),cx=bx+layer.width/2,cy=by+layer.height/2,d=Math.hypot(layer.width,layer.height);
        const brushSize=Math.max(4,m.size),step=brushSize*unit*.65;
        for(let offset=-d/2;offset<d/2;offset+=step){
          const pts=[[-d/2,offset],[0,offset+(rand()-.5)*step],[d/2,offset]].map(([x,y])=>[cx+x*dx-y*dy,cy+x*dy+y*dx]);
          surfaceBrush(lc,samples(pts,.8),{...m,medium,size:brushSize,pressure:[1,1],taper:[0,0]},c);
        }
      }
      lc.restore();
    }else if(medium==='watercolor'){
      lc.globalAlpha=.76;lc.fill(shape);
      lc.save();lc.clip(shape);
      // Broad pigment blooms and paper reserves inside each mark, not global grain.
      const d=Math.hypot(layer.width,layer.height),patches=Math.min(22,Math.max(4,Math.round(d/(35*unit))));
      for(let j=0;j<patches;j++){
        const x=bx+rand()*layer.width,y=by+rand()*layer.height,r=(.1+rand()*.24)*d;
        const g=lc.createRadialGradient(x,y,0,x,y,Math.max(1,r));
        g.addColorStop(0,`rgba(${c.map(v=>Math.round(v*.8)).join(',')},${.15+texture*.12})`);g.addColorStop(1,`rgba(${c.join(',')},0)`);
        lc.globalAlpha=1;lc.fillStyle=g;lc.fillRect(x-r,y-r,r*2,r*2);
      }
      // Directional deposits make washes read as laid pigment, rather than flat cells.
      const angle=(m.angle==null?principalAngle(pts):m.angle*Math.PI/180),cx=bx+layer.width/2,cy=by+layer.height/2;
      lc.translate(cx,cy);lc.rotate(angle);
      for(let j=0;j<14;j++){
        const y=(rand()-.5)*d;lc.strokeStyle=tint(c,(rand()-.6)*20);lc.globalAlpha=.025+texture*.035;lc.lineWidth=(2+rand()*10)*unit;lc.beginPath();lc.moveTo(-d/2,y);lc.quadraticCurveTo(0,y+(rand()-.5)*12*unit,d/2,y+(rand()-.5)*8*unit);lc.stroke();
      }
      lc.restore();
      lc.save();lc.clip(shape);lc.globalAlpha=.1*wetness;lc.strokeStyle=tint(c,-24);lc.lineWidth=(1+2*wetness)*unit;lc.setLineDash([8*unit,15*unit,18*unit,27*unit]);lc.stroke(shape);lc.restore();
    }else if(medium==='sketch'){
      lc.save();lc.clip(shape);
      if(s){bristles(lc,s,m,medium,c);}
      else{
        // Legacy washes become pressure-varied hatching, not filled silhouettes.
        const angle=(m.angle??-32)*Math.PI/180,cx=bx+layer.width/2,cy=by+layer.height/2,d=Math.hypot(layer.width,layer.height);
        lc.translate(cx,cy);lc.rotate(angle);lc.strokeStyle=m.color;
        for(let y=-d/2;y<d/2;y+=(2.2+texture*1.8)*unit){
          lc.globalAlpha=.25+rand()*.45;lc.lineWidth=(.35+rand()*.9)*unit;lc.beginPath();lc.moveTo(-d/2,y);lc.quadraticCurveTo(0,y+(rand()-.5)*4*unit,d/2,y+(rand()-.5)*2*unit);lc.stroke();
        }
      }
      lc.restore();
    }else{
      lc.globalAlpha=1;lc.fill(shape);lc.save();lc.clip(shape);
      if(s)bristles(lc,s,m,medium,c);
      else{
        const angle=m.angle==null?principalAngle(pts):m.angle*Math.PI/180,cx=bx+layer.width/2,cy=by+layer.height/2,d=Math.hypot(layer.width,layer.height);
        lc.translate(cx,cy);lc.rotate(angle);
        // Varied loading and parallel ridges simulate the visible track of bristles.
        for(let y=-d/2;y<d/2;y+=(.8+rand()*1.3)*unit){
          lc.strokeStyle=tint(c,(rand()-.48)*45*texture);lc.globalAlpha=.3+rand()*.5;lc.lineWidth=(.35+rand()*.9)*unit;
          lc.beginPath();lc.moveTo(-d/2,y);lc.quadraticCurveTo(0,y+(rand()-.5)*6*unit,d/2,y+(rand()-.5)*3*unit);lc.stroke();
        }
      }
      lc.restore();
    }
    // Texture affects pigment alpha locally; untouched paper remains untouched.
    lc.setTransform(1,0,0,1,0,0);
    if(texture>0){
      const textureStarted=onMetrics?now():0;
      const pixels=lc.getImageData(0,0,layer.width,layer.height),a=pixels.data;
      pixelReads++;
      for(let y=0;y<layer.height;y++)for(let x=0;x<layer.width;x++){
        const i=(y*layer.width+x)*4;if(!a[i+3])continue;
        const n=hash(Math.floor((bx+x)/unit),Math.floor((by+y)/unit));
        const fiber=hash(Math.floor((bx+x)/(unit*3)),Math.floor((by+y)/(unit*.7)));
        if(m.brush){
          const px=(bx+x)/unit,py=(by+y)/unit;
          const tooth=m.tooth??.65;
          const relief=noise(px/.65,py/.65)*.7+noise(px/2.3,py/1.8)*.3;
          const load=m.load??(m.brush==='rubbed'?.45:.8);
          const contact=clamp((relief-(.15+tooth*.22))*(5+load*3),0,1);
          const strength=tooth*(m.brush==='dragged'?.38:.75);
          a[i+3]*=(1-strength)+strength*contact;
        }else if(medium==='watercolor')a[i+3]*=1-texture*(n*.15+(fiber>.82?.15:0));
        else if(medium==='sketch')a[i+3]*=1-texture*(fiber>.64?.65:n*.25);
        else for(let k=0;k<3;k++)a[i+k]=clamp(a[i+k]+(n-.5)*5*texture,0,255);
      }
      lc.putImageData(pixels,0,0);
      if(onMetrics)textureMs+=now()-textureStarted;
    }
    // Deposit pigment by default so light strokes can cover dark underpainting.
    // Transparent glazing remains available with explicit blend: 'multiply'.
    ctx.save();ctx.globalCompositeOperation=m.blend==='multiply'?'multiply':'source-over';
    // High opacity remains available for opaque oil. Input opacity is never raised.
    if(medium==='watercolor'&&wetness>0){
      ctx.globalAlpha=m.opacity*.28*wetness;ctx.filter=`blur(${(.35+wetness*3.5)*unit}px)`;ctx.drawImage(layer,bx,by);ctx.filter='none';ctx.globalAlpha=m.opacity*(1-.28*wetness);ctx.drawImage(layer,bx,by);
    }else{ctx.globalAlpha=m.opacity;ctx.drawImage(layer,bx,by);}
    ctx.restore();
    if(index%4===0){onProgress?.(Math.round((index+1)/program.marks.length*100),'Layering '+medium+' brushwork');const t=onMetrics?now():0;await new Promise(r=>setTimeout(r,0));if(onMetrics)yieldMs+=now()-t;}
  }
  onProgress?.(100,'Painting complete');
  if(onMetrics){const totalMs=now()-started;onMetrics({totalMs,textureMs,yieldMs,drawingMs:Math.max(0,totalMs-textureMs-yieldMs),pixelReads});}
  return !isCancelled?.();
}
export function programHTML(p,size={}){
  validateProgram(p);
  const settings={width:size.width??1600,height:size.height??1200};
  if(Object.values(settings).some(v=>!Number.isInteger(v)||v<1||v>4096))throw Error('Invalid export dimensions');
  // Keep only numeric export options; never interpolate arbitrary callbacks/content.
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Washcode painting</title><style>body{margin:0;background:#faf9f6;display:grid;place-items:center;min-height:100vh}canvas{max-width:100vw;max-height:100vh;object-fit:contain}</style><canvas aria-label="Washcode painting"></canvas><script>${validateProgram.toString()}\n${renderProgram.toString()}\nrenderProgram(${JSON.stringify(p).replace(/</g,'\\u003c')},document.querySelector('canvas'),${JSON.stringify(settings)}).then(()=>document.body.dataset.ready='true');<\/script></html>`;
}
