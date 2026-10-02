import './junction.css';
import { planJunction, junctionSnapshotAt } from './junction';

type JunctionPlan = ReturnType<typeof planJunction>;
type JunctionSnapshot = ReturnType<typeof junctionSnapshotAt>;
type Pattern = 'compatible' | 'crossing' | 'mixed';
const GITHUB = 'https://github.com/ben4mn/universal-traffic-protocol';
const PATTERNS: Record<Pattern, {tab:string;setup:string}> = {
  compatible: { tab:'Three right turns', setup:'Three cars arrive together from the north, east and south. All stop for at least one second. In the reservation experiment, each turns right on a separate path.' },
  crossing: { tab:'Crossing paths', setup:'These routes cross. The reservation controller holds a car until the other vehicle’s buffered path is clear. More cars can move together only when their paths fit.' },
  mixed: { tab:'Mixed turns', setup:'Right turns, left turns and through traffic share the junction. Compare the waits across the same 24 arrivals, then add missing messages or a pedestrian crossing.' },
};
const CAR_COLORS = ['#d1f597','#92cdde','#efb585'];
const seconds = (n:number) => `${n.toFixed(1)} s`;

export function mountJunctionLab(element: HTMLElement): void {
  element.classList.add('junction-lab');
  element.innerHTML = `
    <div class="junction-heading"><div><p class="eyebrow">02 / A FULLY AUTONOMOUS JUNCTION</p><h2>Three cars moving.<br>All three stopped first.</h2></div><p>At a four-way stop, compatible paths can share the junction. Try the paths that fit, then the ones that need to wait.</p></div>
    <div class="junction-experiment">
      <div class="junction-top"><div class="junction-patterns" role="group" aria-label="Autonomous junction routes">${Object.entries(PATTERNS).map(([id,p]) => `<button data-junction-pattern="${id}" aria-pressed="${id === 'compatible'}">${p.tab}</button>`).join('')}</div><span class="junction-clock">VIEWED TIME<strong data-junction-clock>4.5 s</strong></span></div>
      <div class="junction-setup"><p data-junction-setup></p><span>24 MATCHED ARRIVALS</span></div>
      <div class="junction-panels">${(['sequential','reserved'] as const).map((mode,i) => `<article class="junction-panel"><div class="junction-panel-heading"><h3>${i === 0 ? 'One car at a time' : 'Reserved compatible paths'}</h3><span>${i === 0 ? 'A / LAB BASELINE' : 'B / CLOSED EXPERIMENT'}</span></div><canvas data-junction-map="${mode}" role="img" aria-label="Four-way stop with ${i === 0 ? 'one vehicle moving at a time' : 'compatible buffered path reservations'}"></canvas><div class="junction-now"><span><strong data-junction-active="${mode}">—</strong>moving now</span><span data-junction-state="${mode}"></span></div><div class="junction-totals-caption">FULL-RUN TOTALS / ALL 24 CARS</div><div class="junction-totals"><div><span>Mean wait before moving</span><strong data-junction-wait="${mode}"></strong></div><div><span>All cars finish at</span><strong data-junction-duration="${mode}"></strong></div><div><span>Most moving at once</span><strong data-junction-peak="${mode}"></strong></div></div></article>`).join('')}</div>
      <div class="junction-key"><span><i></i>Car 1 / north</span><span><i data-color="east"></i>Car 2 / east</span><span><i data-color="south"></i>Car 3 / south</span><span><i data-color="buffer"></i>Buffer for moving paths</span></div>
      <div class="junction-playback"><button data-junction-play>Play the junction</button><div class="junction-timeline"><label class="sr-only" for="junction-timeline">Viewed time in autonomous junction</label><input id="junction-timeline" type="range" min="0" step="0.1" value="4.5"><div><span>0 s</span><span data-junction-endtime></span></div></div><button data-junction-replay>Replay the three cars</button><button data-junction-finish>See all 24 finish</button></div>
      <div class="junction-controls"><div class="junction-control"><label for="junction-adoption">Cars with reservations<output data-junction-adoption-value>100%</output></label><input id="junction-adoption" type="range" min="0" max="100" step="10" value="100"><p>A car without a reservation waits for an exclusive turn.</p></div><div class="junction-control"><label for="junction-loss">Messages lost<output data-junction-loss-value>0%</output></label><input id="junction-loss" type="range" min="0" max="100" step="10" value="0"><p>A reservation needs a complete request and acknowledgement.</p></div><div class="junction-control"><label for="junction-buffer">Buffer between moving cars<output data-junction-buffer-value>0.50 m</output></label><input id="junction-buffer" type="range" min="25" max="120" step="5" value="50"><p>Larger buffers can leave fewer moving paths free at the same time.</p></div></div>
      <div class="junction-bottom"><label class="junction-pedestrians"><input id="junction-pedestrians" type="checkbox"> Add a protected pedestrian crossing</label><a href="${GITHUB}/blob/main/docs/autonomous-junction.md" target="_blank" rel="noreferrer">How this experiment works</a></div>
    </div>
    <div class="junction-answer"><span>WHAT THIS SHOWS</span><div><h3 data-junction-answer-title></h3><p data-junction-answer-body></p></div></div>
    <p class="junction-note">This is a closed experiment for a future reservation system. UTP 0.1 does not grant right of way or authorize these movements. The one-at-a-time baseline is a conservative laboratory rule. Every car makes a full stop; moving cars have checked body footprints, buffers and an extra 0.25 m simulation margin. Moving counts cover the path from a car’s stop to its exit.</p>
  `;
  const get = <T extends HTMLElement = HTMLElement>(selector:string) => element.querySelector<T>(selector)!;
  const adoption = get<HTMLInputElement>('#junction-adoption');
  const loss = get<HTMLInputElement>('#junction-loss');
  const buffer = get<HTMLInputElement>('#junction-buffer');
  const pedestrians = get<HTMLInputElement>('#junction-pedestrians');
  const timeline = get<HTMLInputElement>('#junction-timeline');
  const play = get<HTMLButtonElement>('[data-junction-play]');
  const canvases = [get<HTMLCanvasElement>('[data-junction-map="sequential"]'),get<HTMLCanvasElement>('[data-junction-map="reserved"]')];
  let pattern: Pattern = 'compatible';
  let plans: [JunctionPlan,JunctionPlan];
  let time = 4.5;
  let playing = false;
  let animation = 0;
  let lastTime = 0;
  let lastPaint = 0;
  const mark = (input:HTMLInputElement) => input.style.setProperty('--range-fill', `${100 * (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))}%`);
  function pause(): void { playing = false; play.textContent = 'Play the junction'; cancelAnimationFrame(animation); }
  function reset(): void {
    pause();
    const config = {pattern,adoption:Number(adoption.value)/100,packetLoss:Number(loss.value)/100,bufferMetres:Number(buffer.value)/100,pedestrians:pedestrians.checked};
    plans = [planJunction({...config,mode:'sequential'}),planJunction({...config,mode:'reserved'})];
    timeline.max = String(Math.max(plans[0].duration,plans[1].duration));
    time = 4.5;
    get('[data-junction-setup]').textContent = PATTERNS[pattern].setup;
    get('[data-junction-endtime]').textContent = `${Math.ceil(Number(timeline.max))} s`;
    get('[data-junction-adoption-value]').textContent = `${adoption.value}%`;
    get('[data-junction-loss-value]').textContent = `${loss.value}%`;
    get('[data-junction-buffer-value]').textContent = `${(Number(buffer.value)/100).toFixed(2)} m`;
    [adoption,loss,buffer].forEach(mark);
    for(const [i,mode] of (['sequential','reserved'] as const).entries()) {
      const plan = plans[i];
      get(`[data-junction-wait="${mode}"]`).innerHTML = `${plan.metrics.meanWait.toFixed(1)}<small>s</small>`;
      get(`[data-junction-duration="${mode}"]`).innerHTML = `${plan.duration.toFixed(1)}<small>s</small>`;
      get(`[data-junction-peak="${mode}"]`).textContent = String(plan.metrics.maxConcurrent);
    }
    const a = plans[0], b = plans[1];
    const together = b.vehicles.slice(0,3).every(v => Math.abs(v.entry-b.vehicles[0].entry)<.01);
    const saved = a.duration-b.duration;
    get('[data-junction-answer-title]').textContent = together ? 'These three cars can move together after stopping.' : b.metrics.maxConcurrent > 1 ? 'Some cars can share the junction. Crossing paths still wait.' : 'This run needs one car at a time.';
    get('[data-junction-answer-body]').textContent = `All 24 cars finish ${saved >= .05 ? `${saved.toFixed(1)} seconds earlier with reservations` : Math.abs(saved)<.05 ? 'at the same time in both experiments' : `${Math.abs(saved).toFixed(1)} seconds later with reservations`}. The mean wait is ${a.metrics.meanWait.toFixed(1)} seconds with one car at a time and ${b.metrics.meanWait.toFixed(1)} with reservations, including the required one-second stop. The controller checks the space each car will occupy as it moves; ${together ? 'the first three right-turn paths fit at the same time' : 'crossing paths must be staggered, and an unconfirmed reservation gets an exclusive turn'}. This shows a possible gain for these routes and arrivals. It does not mean every junction can serve three times as many cars.`;
    render();
  }
  function render(): void {
    if(!plans) return;
    timeline.value = String(time); mark(timeline);
    get('[data-junction-clock]').textContent = seconds(time);
    for(const [i,mode] of (['sequential','reserved'] as const).entries()) {
      const state = junctionSnapshotAt(plans[i],time);
      get(`[data-junction-active="${mode}"]`).textContent = String(state.metrics.active);
      get(`[data-junction-state="${mode}"]`).textContent = state.pedestrianActive ? 'People crossing / all cars wait' : `${state.metrics.completed} / 24 finished`;
      canvases[i].setAttribute('aria-label', `${mode === 'sequential' ? 'One car at a time' : 'Reserved paths'} at ${seconds(time)}: ${state.metrics.active} moving, ${state.metrics.completed} finished${state.pedestrianActive ? ', protected pedestrian crossing active' : ''}.`);
      drawJunction(canvases[i],plans[i],state,i===1);
    }
  }
  function tick(now:number): void {
    if(!playing) return;
    if(!lastTime) lastTime=now;
    time=Math.min(Number(timeline.max),time+(now-lastTime)/1000*2); lastTime=now;
    if(now-lastPaint>40) {render();lastPaint=now;}
    if(time>=Number(timeline.max)) {render();pause();return;}
    animation=requestAnimationFrame(tick);
  }
  element.querySelectorAll<HTMLButtonElement>('[data-junction-pattern]').forEach(button => button.addEventListener('click',()=>{
    pattern=button.dataset.junctionPattern as Pattern;
    element.querySelectorAll('[data-junction-pattern]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    reset();
  }));
  for(const input of [adoption,loss,buffer]) {
    input.addEventListener('input',()=>{
      mark(input);
      get(`[data-junction-${input===adoption?'adoption':input===loss?'loss':'buffer'}-value]`).textContent=input===buffer?`${(Number(input.value)/100).toFixed(2)} m`:`${input.value}%`;
    });
    input.addEventListener('change',reset);
  }
  pedestrians.addEventListener('change',reset);
  timeline.addEventListener('input',()=>{pause();time=Number(timeline.value);render();});
  play.addEventListener('click',()=>{
    if(playing) {pause();return;}
    if(time>=Number(timeline.max)) time=0;
    playing=true;lastTime=0;play.textContent='Pause the junction';animation=requestAnimationFrame(tick);
  });
  get('[data-junction-replay]').addEventListener('click',()=>{pause();time=0;render();});
  get('[data-junction-finish]').addEventListener('click',()=>{pause();time=Number(timeline.max);render();});
  new ResizeObserver(()=>render()).observe(element);
  document.addEventListener('visibilitychange',()=>{if(document.hidden) pause();});
  reset();
}

function drawJunction(canvas:HTMLCanvasElement,plan:JunctionPlan,state:JunctionSnapshot,reserved:boolean):void {
  const width=canvas.clientWidth,height=canvas.clientHeight,dpr=Math.min(2,window.devicePixelRatio||1);
  if(!width||!height) return;
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  const ctx=canvas.getContext('2d')!;ctx.scale(dpr,dpr);
  const scale=Math.min(width-32,height-28)/44, cx=width/2,cy=height/2;
  const x=(value:number)=>cx+value*scale,y=(value:number)=>cy+value*scale;
  ctx.fillStyle='#15261c';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#203829';
  for(const [bx,by] of [[-20,-20],[13,-20],[-20,13],[13,13]]) ctx.fillRect(x(bx),y(by),7*scale,7*scale);
  ctx.fillStyle='#293e2e';
  for(const [bx,by] of [[-19,-19],[14,-19],[-19,14],[14,14]]) ctx.fillRect(x(bx),y(by),5*scale,5*scale);
  ctx.fillStyle='#2b3b30';
  ctx.fillRect(x(-3.6),y(-22),7.2*scale,44*scale);ctx.fillRect(x(-22),y(-3.6),44*scale,7.2*scale);
  ctx.beginPath();ctx.roundRect(x(-11.75),y(-11.75),23.5*scale,23.5*scale,3*scale);ctx.fill();
  ctx.strokeStyle='#75906730';ctx.lineWidth=1;
  ctx.beginPath();ctx.roundRect(x(-11.75),y(-11.75),23.5*scale,23.5*scale,3*scale);ctx.stroke();
  ctx.setLineDash([5,7]);ctx.strokeStyle='#b5c5a542';ctx.lineWidth=1;
  for(const [x1,y1,x2,y2] of [[0,-22,0,-15],[0,15,0,22],[-22,0,-15,0],[15,0,22,0]]) {ctx.beginPath();ctx.moveTo(x(x1),y(y1));ctx.lineTo(x(x2),y(y2));ctx.stroke();}
  ctx.setLineDash([]);
  ctx.strokeStyle='#d6e0bd80';ctx.lineWidth=2;
  for(const [x1,y1,x2,y2] of [[-3.6,-11.75,0,-11.75],[11.75,-3.6,11.75,0],[0,11.75,3.6,11.75],[-11.75,0,-11.75,3.6]]) {ctx.beginPath();ctx.moveTo(x(x1),y(y1));ctx.lineTo(x(x2),y(y2));ctx.stroke();}
  ctx.font='10px "DM Sans",sans-serif';ctx.fillStyle='#8fa780';ctx.textAlign='center';
  ctx.fillText('N',x(0),y(-20.7));ctx.fillText('S',x(0),y(21.3));
  ctx.fillText('W',x(-20.7),y(.5));ctx.fillText('E',x(20.7),y(.5));
  for(const [sx,sy] of [[-5.1,-12.5],[12.5,-5.1],[5.1,12.5],[-12.5,5.1]]) {
    ctx.fillStyle='#905749';ctx.strokeStyle='#cf9d7e';ctx.lineWidth=.8;ctx.beginPath();
    for(let i=0;i<8;i++) {const a=Math.PI/8+i*Math.PI/4,px=x(sx)+Math.cos(a)*7,py=y(sy)+Math.sin(a)*7;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();ctx.stroke();
    ctx.font='5.5px "DM Sans",sans-serif';ctx.fillStyle='#f1d7bd';ctx.fillText('STOP',x(sx),y(sy)+2);
  }
  // Exact sampled trajectories used by the scheduler, highlighted for the first three arrivals.
  for(const [i,vehicle] of plan.vehicles.slice(0,3).entries()) {
    ctx.strokeStyle=CAR_COLORS[i];ctx.globalAlpha=reserved?.58:.26;ctx.lineWidth=1.5;ctx.setLineDash([4,4]);ctx.beginPath();
    for(const [j,p] of vehicle.path.entries()) j?ctx.lineTo(x(p.x),y(p.y)):ctx.moveTo(x(p.x),y(p.y));
    ctx.stroke();
  }
  ctx.globalAlpha=1;ctx.setLineDash([]);
  if(state.pedestrianActive) {
    ctx.fillStyle='#e9bd8830';ctx.beginPath();ctx.roundRect(x(-11),y(-11),22*scale,22*scale,2*scale);ctx.fill();
    for(let i=-3;i<=3;i++) {ctx.fillStyle='#dacaa657';ctx.fillRect(x(i*.9-.25),y(-9.8),.5*scale,3.2*scale);}
    ctx.font='11px "DM Sans",sans-serif';ctx.fillStyle='#efc89a';ctx.fillText('People crossing',cx,cy+4);
  } else {
    ctx.font='9px "DM Sans",sans-serif';ctx.fillStyle='#93aa7c';
    ctx.fillText(reserved?'Compatible paths':'Exclusive turn',cx,cy+4);
  }
  for(const vehicle of state.vehicles) {
    if(!vehicle.visible || vehicle.state==='done') continue;
    const index=plan.vehicles.findIndex(v=>v.id===vehicle.id);
    const color=index<3?CAR_COLORS[index]:'#bccbb0';
    ctx.save();ctx.translate(x(vehicle.x),y(vehicle.y));ctx.rotate(vehicle.heading);
    if(reserved && vehicle.state==='moving' && vehicle.canReserve) {
      const extra=plan.config.bufferMetres+plan.numericalMarginMetres;
      ctx.strokeStyle=color;ctx.globalAlpha=.65;ctx.lineWidth=1;ctx.setLineDash([3,3]);
      ctx.strokeRect((-2.25-extra)*scale,(-.95-extra)*scale,(4.5+extra*2)*scale,(1.9+extra*2)*scale);
      ctx.setLineDash([]);ctx.globalAlpha=1;
    }
    ctx.fillStyle='#0a170d70';ctx.fillRect(-2.25*scale+2,-.95*scale+2,4.5*scale,1.9*scale);
    ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(-2.25*scale,-.95*scale,4.5*scale,1.9*scale,.28*scale);ctx.fill();
    ctx.fillStyle='#39523e';ctx.fillRect(.5*scale,-.68*scale,.48*scale,1.36*scale);
    ctx.fillStyle='#eaf3dccc';ctx.fillRect(1.85*scale,-.65*scale,.17*scale,.3*scale);ctx.fillRect(1.85*scale,.35*scale,.17*scale,.3*scale);
    ctx.restore();
    if(index<3) {
      const lx=x(vehicle.x),ly=y(vehicle.y)-3.45*scale;
      ctx.fillStyle='#213324';ctx.beginPath();ctx.arc(lx,ly,6,0,Math.PI*2);ctx.fill();
      ctx.font='bold 9px "DM Sans",sans-serif';ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(String(index+1),lx,ly+3);
    }
    if(vehicle.state==='stopped' && index<3) {ctx.font='8px "DM Sans",sans-serif';ctx.fillStyle='#a7bb94';ctx.fillText('Stopped',x(vehicle.x),y(vehicle.y)+2.2*scale);}
  }
}
