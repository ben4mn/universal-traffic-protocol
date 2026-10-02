import './regional.css';
import { RegionalSimulation, REGIONAL_TOPOLOGY, runExperiment, type RegionalExperiment } from './regional';

type RegionalSnapshot = ReturnType<RegionalSimulation['snapshot']>;
type RegionalScenario = 'pulse' | 'steady' | 'overload';
type Pair = { local: RegionalSnapshot; shared: RegionalSnapshot };
const DURATION = 1800;
const INTERVAL = 10;
const SOURCE = 'https://github.com/ben4mn/universal-traffic-protocol';
const CASES: Record<RegionalScenario, { tab: string; title: string; setup: string }> = {
  pulse: {
    tab: '01 / A short slowdown',
    title: 'A four-minute slowdown at the freeway exit.',
    setup: 'At minute 5, the freeway exit drops from 102 to 15 vehicles a minute. At minute 9, normal capacity returns. Watch the queue reach nearby streets and the freeway ramps, then see whether it drains.',
  },
  steady: {
    tab: '02 / Rush hour',
    title: 'Keep the same busy roads running for half an hour.',
    setup: 'Trip requests continue throughout the run. Both cities have the same road capacity. One uses queues at each junction; the other can also see how much room is left downstream.',
  },
  overload: {
    tab: '03 / Demand exceeds capacity',
    title: 'More trips arrive than the city can finish.',
    setup: 'A growing queue has to go somewhere. Watch the roads, ramps and queues outside the map. Sharing information may change where vehicles wait; it cannot create another exit.',
  },
};

const amount = (n: number) => Math.round(n).toLocaleString();
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** A paired regional experiment; replay changes the view of a run, never its results. */
export function mountRegionalLab(element: HTMLElement): void {
  element.classList.add('regional-lab');
  element.innerHTML = `
    <div class="regional-heading"><div><p class="eyebrow">03 / FROM A JUNCTION TO A CITY</p><h2>Can a small slowdown become a citywide jam?</h2></div><p>Try a larger city: 35 junctions, an eastbound freeway and three sets of ramps. Follow a queue beyond the place where it started.</p></div>
    <div class="regional-experiment">
      <div class="regional-top"><div class="regional-scenarios" role="group" aria-label="Regional traffic scenario">${Object.entries(CASES).map(([id, c]) => `<button data-regional-case="${id}" aria-pressed="${id === 'pulse'}">${escape(c.tab)}</button>`).join('')}</div><button class="regional-runbutton" data-regional-finish>Show the full 30 minutes</button></div>
      <div class="regional-setup"><div><span class="regional-location">Fictional city / 5 × 7 street grid</span><h3 data-regional-title></h3><p data-regional-setup></p></div><div class="regional-timebox"><span>VIEWED TIME</span><strong data-regional-time>09:00</strong><small data-regional-event></small></div></div>
      <div class="regional-maps">${(['local', 'shared'] as const).map((mode, i) => `<article class="regional-map"><div class="regional-mapheading"><h3>${i === 0 ? 'Local queue control' : 'Shared downstream reports'}</h3><span>${i === 0 ? 'A / SAME CAPACITY' : 'B / <b data-regional-equipped>100% EQUIPPED</b>'}</span></div><canvas data-regional-map="${mode}" role="img" aria-label="Regional network with ${mode === 'local' ? 'local traffic signal control' : 'shared downstream occupancy reports'}"></canvas><p class="regional-mapnote" data-regional-mapnote="${mode}"></p><div class="regional-metrics"><div><span>Congestion queue</span><strong data-regional-stat="${mode}-queue">—</strong><small>Roads + outside</small></div><div><span>Trips finished</span><strong data-regional-stat="${mode}-completed">—</strong><small>Since minute 0</small></div><div><span>All trip time</span><strong data-regional-stat="${mode}-time">—</strong><small>Vehicle-minutes, moving + waiting</small></div></div></article>`).join('')}</div>
      <div class="regional-key"><span><i></i>Room available</span><span><i data-key="busy"></i>Filling up</span><span><i data-key="full"></i>Nearly full</span><span><i data-key="blocked"></i>80%+ full</span><span>Line color = vehicles / road storage</span></div>
      <div class="regional-playback"><button class="regional-playbutton" data-regional-play>Play the run</button><div class="regional-slider"><label class="sr-only" for="regional-timeline">Viewed time in regional experiment</label><input id="regional-timeline" type="range" min="0" max="1800" step="10" value="540"><div><span>00:00</span><span>15:00</span><span>30:00</span></div></div><button class="regional-replay" data-regional-replay>Replay from the start</button></div>
      <div class="regional-chartbox"><div class="regional-charttitle"><span>How far does the queue grow?</span><div><span><i></i>Local control</span><span><i data-line="shared"></i>Shared reports</span></div></div><svg class="regional-chart" data-regional-chart role="img" aria-label="Congestion queue over 30 minutes"></svg><p class="regional-chart-foot">Includes vehicles waiting to enter. Road queues count vehicles above the model’s free-flow threshold. The shaded window marks the temporary slowdown.</p></div>
      <div class="regional-settings"><div class="regional-setting"><label for="regional-adoption">Participating signals<output data-regional-adoption-value>100%</output></label><input id="regional-adoption" type="range" min="0" max="100" step="10" value="100"><p>Signals with reports can account for downstream storage.</p></div><div class="regional-setting"><label for="regional-demand">Trip requests<output data-regional-demand-value>1.0×</output></label><input id="regional-demand" type="range" min="50" max="160" step="10" value="100"><p>More requests do not add lanes or increase exit capacity.</p></div><div class="regional-setting"><label for="regional-loss">Messages lost<output data-regional-loss-value>0%</output></label><input id="regional-loss" type="range" min="0" max="100" step="10" value="0"><p>Missing or expired reports return signals to local control.</p></div></div>
      <div class="regional-bottom"><span>Matched trip requests and seed 7 · 30-minute experiment</span><button data-regional-export>Download this run as CSV</button><a href="${SOURCE}/blob/main/docs/regional-model.md" target="_blank" rel="noreferrer">Model assumptions</a></div>
    </div>
    <div class="regional-answer"><span>AT 30 MINUTES</span><div><h3 data-regional-answer-title></h3><div class="regional-shock" data-regional-shock hidden><p>Extra time caused by the slowdown</p><div><span>Local control<strong data-regional-shock-local></strong></span><span>Shared reports<strong data-regional-shock-shared></strong></span></div><small>Vehicle-minutes above the same run without the exit restriction</small></div><p data-regional-answer-body></p></div></div>
    <div class="regional-repeat"><div class="regional-repeat-heading"><div><h3>Does the result hold across different runs?</h3><p>Repeat these settings with seeds 7, 19 and 41. Each pair receives the same trip requests.</p></div><button data-regional-repeat>Repeat with 3 seeds</button></div><div data-regional-seed-results hidden><p class="regional-seed-summary" data-regional-seed-summary></p><p class="regional-seed-shock" data-regional-seed-shock hidden></p><div class="regional-table-scroll"><table class="regional-seed-table"><caption>All trip time after 30 minutes, including unfinished trips</caption><thead><tr><th scope="col">Seed</th><th scope="col">Local control</th><th scope="col">Shared reports</th><th scope="col">Change</th></tr></thead><tbody data-regional-seed-rows></tbody></table></div><button class="regional-seed-export" data-regional-seed-export>Download the 3-seed results</button></div></div>
    <p class="regional-note">This model tests finite road space and queues spilling into upstream links. It moves groups of vehicles between road segments. Individual braking waves on a freeway need a separate car-following experiment.</p>
  `;
  const get = <T extends HTMLElement = HTMLElement>(query: string) => element.querySelector<T>(query)!;
  const adoption = get<HTMLInputElement>('#regional-adoption');
  const demand = get<HTMLInputElement>('#regional-demand');
  const loss = get<HTMLInputElement>('#regional-loss');
  const timeline = get<HTMLInputElement>('#regional-timeline');
  const playButton = get<HTMLButtonElement>('[data-regional-play]');
  const canvases = [get<HTMLCanvasElement>('[data-regional-map="local"]'), get<HTMLCanvasElement>('[data-regional-map="shared"]')];
  let scenario: RegionalScenario = 'pulse';
  let frames: Pair[] = [];
  let index = 54;
  let playing = false;
  let lastFrameTime = 0;
  let lastPaintTime = 0;
  let animation = 0;
  let seedResults: RegionalExperiment | null = null;
  let unshocked: Pair | null = null;
  let seedCounterfactual: RegionalExperiment | null = null;

  const markSlider = (input: HTMLInputElement) => input.style.setProperty('--range-fill', `${100 * (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))}%`);
  function stop(): void {
    playing = false;
    playButton.textContent = 'Play the run';
    cancelAnimationFrame(animation);
  }
  function run(selectTime = 540): void {
    stop();
    seedResults = null;
    seedCounterfactual = null;
    unshocked = null;
    get('[data-regional-seed-results]').hidden = true;
    const config = { scenario, adoption: Number(adoption.value) / 100, packetLoss: Number(loss.value) / 100, demandScale: Number(demand.value) / 100, seed: 7 };
    const local = new RegionalSimulation({ ...config, strategy: 'local' });
    const shared = new RegionalSimulation({ ...config, strategy: 'shared' });
    frames = [{ local: local.snapshot(), shared: shared.snapshot() }];
    for (let t = INTERVAL; t <= DURATION; t += INTERVAL) {
      local.step(INTERVAL);
      shared.step(INTERVAL);
      frames.push({ local: local.snapshot(), shared: shared.snapshot() });
    }
    if (scenario === 'pulse') {
      const noSlowdownLocal = new RegionalSimulation({ ...config, scenario: 'steady', strategy: 'local' });
      const noSlowdownShared = new RegionalSimulation({ ...config, scenario: 'steady', strategy: 'shared' });
      noSlowdownLocal.step(DURATION); noSlowdownShared.step(DURATION);
      unshocked = { local: noSlowdownLocal.snapshot(), shared: noSlowdownShared.snapshot() };
    }
    index = Math.min(frames.length - 1, Math.round(selectTime / INTERVAL));
    get('[data-regional-title]').textContent = CASES[scenario].title;
    get('[data-regional-setup]').textContent = CASES[scenario].setup;
    get('[data-regional-adoption-value]').textContent = `${adoption.value}%`;
    get('[data-regional-demand-value]').textContent = `${(Number(demand.value) / 100).toFixed(1)}×`;
    get('[data-regional-loss-value]').textContent = `${loss.value}%`;
    get('[data-regional-equipped]').textContent = `${adoption.value}% EQUIPPED`;
    [adoption, demand, loss].forEach(markSlider);
    updateAnswer();
    render();
  }
  function updateAnswer(): void {
    const end = frames.at(-1)!;
    const before = frames[Math.max(0, frames.length - Math.round(300 / INTERVAL) - 1)];
    const a = end.local.metrics, b = end.shared.metrics;
    const added = b.generated - b.completed;
    const growth = b.queue - before.shared.metrics.queue;
    const cut = a.totalVehicleSeconds > 0 ? 100 * (a.totalVehicleSeconds - b.totalVehicleSeconds) / a.totalVehicleSeconds : 0;
    const queuesSame = Math.abs(a.queue - b.queue) < .5 && Math.abs(a.completed - b.completed) < .5 && Math.abs(cut) < .05;
    const title = queuesSame
      ? 'Both controllers produce the same result here.'
      : b.queue < 5 && scenario === 'pulse'
        ? a.queue < 5 ? 'Both queues are small by minute 30.' : 'The shared queue is small by minute 30.'
        : growth > 5
          ? 'The shared queue grew in the last five minutes.'
          : 'Some trips are still waiting at minute 30.';
    const comparison = Math.abs(cut) < .05 ? 'Total trip time is about the same in both cities.' : `Shared control uses ${Math.abs(cut).toFixed(1)}% ${cut >= 0 ? 'less' : 'more'} total trip time.`;
    const bound = end.shared.bound;
    const capacity = bound.minimumGrowthPerMinute > 0
      ? ` Demand exceeds the exits’ maximum by ${amount(bound.minimumGrowthPerMinute)} vehicles a minute on average. Those extra trips have to wait somewhere.`
      : ' Demand is below the total exit limit, but individual streets can still bottleneck.';
    let shockText = '';
    get('[data-regional-shock]').hidden = !unshocked;
    if (unshocked) {
      const shockLocal = a.totalVehicleSeconds - unshocked.local.metrics.totalVehicleSeconds;
      const shockShared = b.totalVehicleSeconds - unshocked.shared.metrics.totalVehicleSeconds;
      get('[data-regional-shock-local]').textContent = amount(shockLocal / 60);
      get('[data-regional-shock-shared]').textContent = amount(shockShared / 60);
      const change = shockLocal > 1 ? (shockShared / shockLocal - 1) * 100 : null;
      shockText = change === null ? ` The slowdown adds ${amount(shockLocal / 60)} vehicle-minutes with local control and ${amount(shockShared / 60)} with shared reports.` : ` The slowdown itself adds ${Math.abs(change).toFixed(1)}% ${change < 0 ? 'less' : 'more'} extra trip time under shared control. ${change > 0 ? 'This controller has not contained the extra cost of the interruption.' : 'In this run, it reduces the extra cost of the interruption.'}`;
    }
    get('[data-regional-answer-title]').textContent = title;
    get('[data-regional-answer-body]').textContent = `${comparison} At minute 30, the estimated queue is ${amount(b.queue)} with shared reports and ${amount(a.queue)} with local control. ${amount(added)} shared-city trips are unfinished, including ${amount(b.waitingOutside)} waiting outside.${shockText}${capacity}`;
  }
  function render(): void {
    const pair = frames[index];
    if (!pair) return;
    timeline.value = String(pair.local.time);
    markSlider(timeline);
    get('[data-regional-time]').textContent = clock(pair.local.time);
    const event = pair.local.event;
    get('[data-regional-event]').textContent = scenario === 'pulse'
      ? event.active ? 'Freeway exit: 15 vehicles/min' : pair.local.time < event.start ? `Slowdown at ${clock(event.start)}` : 'Freeway exit capacity restored'
      : scenario === 'overload' ? 'Continuous excess demand' : 'Continuous rush-hour demand';
    for (const [i, mode] of (['local', 'shared'] as const).entries()) {
      const state = pair[mode];
      const m = state.metrics;
      get(`[data-regional-stat="${mode}-queue"]`).textContent = amount(m.queue);
      get(`[data-regional-stat="${mode}-completed"]`).textContent = amount(m.completed);
      get(`[data-regional-stat="${mode}-time"]`).textContent = amount(m.totalVehicleSeconds / 60);
      get(`[data-regional-mapnote="${mode}"]`).textContent = `Street queue ${amount(m.cityQueue)} · Freeway ${amount(m.freewayQueue)} · Ramps ${amount(m.rampQueue)}. Outside: ${amount(m.waitingOutside)}. ${m.spillbackLinks} links are at least 80% full.`;
      canvases[i].setAttribute('aria-label', `${mode === 'local' ? 'Local control' : 'Shared reports'} city at ${clock(state.time)}: ${amount(m.queue)} in the congestion queue, ${amount(m.waitingOutside)} waiting outside, ${m.spillbackLinks} links at least eighty percent full.`);
      drawMap(canvases[i], state, mode === 'shared');
    }
    drawChart();
  }
  function drawChart(): void {
    const plot = element.querySelector<SVGSVGElement>('[data-regional-chart]')!;
    const w = Math.max(280, plot.clientWidth), h = plot.clientHeight || 175, left = 45, right = 8, top = 12, bottom = 25;
    const pw = w - left - right, ph = h - top - bottom;
    const max = Math.max(10, ...frames.flatMap(f => [f.local.metrics.queue, f.shared.metrics.queue]));
    const ceiling = Math.ceil(max / 50) * 50;
    const x = (time: number) => left + pw * time / DURATION;
    const y = (value: number) => top + ph * (1 - value / ceiling);
    const path = (mode: 'local' | 'shared') => frames.map((f, i) => `${i ? 'L' : 'M'}${x(f[mode].time).toFixed(1)},${y(f[mode].metrics.queue).toFixed(1)}`).join(' ');
    const cursor = frames[index].local.time;
    plot.setAttribute('viewBox', `0 0 ${w} ${h}`);
    plot.setAttribute('preserveAspectRatio', 'none');
    plot.setAttribute('aria-label', `Congestion queue over thirty minutes. Final local queue ${amount(frames.at(-1)!.local.metrics.queue)}; shared queue ${amount(frames.at(-1)!.shared.metrics.queue)}. Cursor at ${clock(cursor)}.`);
    plot.innerHTML = `${scenario === 'pulse' ? `<rect x="${x(300)}" y="${top}" width="${x(540) - x(300)}" height="${ph}" fill="#ebac6520"/><text x="${x(300) + 5}" y="${top + 11}">slowdown</text>` : ''}${[0, .5, 1].map(r => `<line x1="${left}" y1="${y(ceiling * r)}" x2="${w - right}" y2="${y(ceiling * r)}" stroke="#cadfab17"/><text x="${left - 7}" y="${y(ceiling * r) + 3}" text-anchor="end">${amount(ceiling * r)}</text>`).join('')}<path d="${path('local')}" fill="none" stroke="#e8b07b" stroke-width="2.5"/><path d="${path('shared')}" fill="none" stroke="#d1f597" stroke-width="2.5"/><line x1="${x(cursor)}" y1="${top}" x2="${x(cursor)}" y2="${h - bottom}" stroke="#edf8d4" stroke-opacity=".5" stroke-dasharray="3 4"/>${[0, 600, 1200, 1800].map(t => `<text x="${x(t)}" y="${h - 6}" text-anchor="${t === 0 ? 'start' : t === 1800 ? 'end' : 'middle'}">${Math.round(t / 60)} min</text>`).join('')}`;
  }
  function tick(now: number): void {
    if (!playing) return;
    if (!lastFrameTime) lastFrameTime = now;
    const advance = Math.floor((now - lastFrameTime) / 250);
    if (advance) {
      index = Math.min(frames.length - 1, index + advance);
      lastFrameTime += advance * 250;
      if (now - lastPaintTime > 140) { render(); lastPaintTime = now; }
    }
    if (index === frames.length - 1) { render(); stop(); return; }
    animation = requestAnimationFrame(tick);
  }
  element.querySelectorAll<HTMLButtonElement>('[data-regional-case]').forEach(button => button.addEventListener('click', () => {
    scenario = button.dataset.regionalCase as RegionalScenario;
    element.querySelectorAll<HTMLButtonElement>('[data-regional-case]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    run(scenario === 'pulse' ? 540 : 900);
  }));
  for (const control of [adoption, demand, loss]) {
    control.addEventListener('input', () => {
      markSlider(control);
      get(`[data-regional-${control === adoption ? 'adoption' : control === demand ? 'demand' : 'loss'}-value]`).textContent = control === demand ? `${(Number(control.value) / 100).toFixed(1)}×` : `${control.value}%`;
    });
    control.addEventListener('change', () => run(Number(timeline.value)));
  }
  timeline.addEventListener('input', () => { stop(); index = Math.round(Number(timeline.value) / INTERVAL); render(); });
  playButton.addEventListener('click', () => {
    if (playing) { stop(); return; }
    if (index === frames.length - 1) index = 0;
    playing = true;
    lastFrameTime = 0;
    playButton.textContent = 'Pause the run';
    animation = requestAnimationFrame(tick);
  });
  get('[data-regional-replay]').addEventListener('click', () => { stop(); index = 0; render(); });
  get('[data-regional-finish]').addEventListener('click', () => { stop(); index = frames.length - 1; render(); });
  get('[data-regional-export]').addEventListener('click', () => {
    const rows = ['scenario,seed,strategy,adoption,loss,demand_scale,time_seconds,generated,completed,on_network,waiting_outside,congestion_queue,links_at_least_80_percent_full,total_vehicle_seconds'];
    for (const pair of frames) for (const mode of ['local', 'shared'] as const) {
      const s = pair[mode], m = s.metrics;
      rows.push([scenario, 7, mode, Number(adoption.value) / 100, Number(loss.value) / 100, Number(demand.value) / 100, s.time, m.generated, m.completed, m.onNetwork, m.waitingOutside, m.queue, m.spillbackLinks, m.totalVehicleSeconds].join(','));
    }
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `utp-regional-${scenario}-seed7.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const changeLabel = (value: number) => Math.abs(value) < .05 ? 'No change' : `${Math.abs(value).toFixed(1)}% ${value < 0 ? 'less' : 'more'}`;
  get<HTMLButtonElement>('[data-regional-repeat]').addEventListener('click', () => {
    seedResults = runExperiment({ scenario, adoption: Number(adoption.value) / 100, packetLoss: Number(loss.value) / 100, demandScale: Number(demand.value) / 100 });
    seedCounterfactual = scenario === 'pulse' ? runExperiment({ ...seedResults.config, scenario: 'steady' }) : null;
    const sum = seedResults.summary;
    const worse = seedResults.results.filter(r => r.vehicleSecondsChangePercent > .05).length;
    const average = Math.abs(sum.vehicleSecondsChangePercent) < .05 ? 'Both controllers use the same total trip time on average.' : `Shared control uses ${changeLabel(sum.vehicleSecondsChangePercent).toLowerCase()} total trip time on average.`;
    get('[data-regional-seed-summary]').textContent = `${average} Results range from ${changeLabel(sum.minimumPercent).toLowerCase()} to ${changeLabel(sum.maximumPercent).toLowerCase()}. Shared control takes more time in ${worse} of ${seedResults.results.length} runs. These three seeds test repeatability within this model; they do not estimate real-city benefits.`;
    get('[data-regional-seed-shock]').hidden = !seedCounterfactual;
    if (seedCounterfactual) {
      const meanLocal = seedResults.results.reduce((sum, r, i) => sum + r.local.totalVehicleSeconds - seedCounterfactual!.results[i].local.totalVehicleSeconds, 0) / seedResults.results.length;
      const meanShared = seedResults.results.reduce((sum, r, i) => sum + r.shared.totalVehicleSeconds - seedCounterfactual!.results[i].shared.totalVehicleSeconds, 0) / seedResults.results.length;
      const change = meanLocal > 1 ? (meanShared / meanLocal - 1) * 100 : null;
      get('[data-regional-seed-shock]').textContent = `Now isolate the slowdown: compared with matched runs without the exit restriction, it adds ${amount(meanLocal / 60)} vehicle-minutes under local control and ${amount(meanShared / 60)} with shared reports, on average.${change === null ? '' : ` Shared control produces ${Math.abs(change).toFixed(1)}% ${change < 0 ? 'less' : 'more'} added trip time from the restriction.`} Lower overall trip time alone does not establish that a controller dampens this disturbance.`;
    }
    get('[data-regional-seed-rows]').innerHTML = seedResults.results.map(r => `<tr><th scope="row">${r.seed}</th><td>${amount(r.local.totalVehicleSeconds / 60)}<small>vehicle-minutes</small></td><td>${amount(r.shared.totalVehicleSeconds / 60)}<small>vehicle-minutes</small></td><td class="${r.vehicleSecondsChangePercent > .05 ? 'regional-worse' : ''}">${changeLabel(r.vehicleSecondsChangePercent)}</td></tr>`).join('');
    get('[data-regional-seed-results]').hidden = false;
  });
  get('[data-regional-seed-export]').addEventListener('click', () => {
    if (!seedResults) return;
    const rows = ['scenario,seed,strategy,adoption,loss,demand_scale,duration_seconds,generated,completed,on_network,waiting_outside,congestion_queue,links_at_least_80_percent_full,total_vehicle_seconds,shared_time_change_percent,extra_seconds_from_slowdown'];
    for (const [i, result] of seedResults.results.entries()) for (const mode of ['local', 'shared'] as const) {
      const m = result[mode];
      const shockSeconds = seedCounterfactual ? m.totalVehicleSeconds - seedCounterfactual.results[i][mode].totalVehicleSeconds : ''; 
      rows.push([scenario, result.seed, mode, seedResults.config.adoption, seedResults.config.packetLoss, seedResults.config.demandScale, seedResults.duration, m.generated, m.completed, m.onNetwork, m.waitingOutside, m.queue, m.spillbackLinks, m.totalVehicleSeconds, result.vehicleSecondsChangePercent, shockSeconds].join(','));
    }
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `utp-regional-${scenario}-3-seeds.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  new ResizeObserver(() => render()).observe(element);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  run();
}

function drawMap(canvas: HTMLCanvasElement, state: RegionalSnapshot, shared: boolean): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return;
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const left = 18, right = width - 18;
  const top = 82, bottom = height - 45;
  const x = (v: number) => left + (right - left) * (v + 1.05) / 8.1;
  const y = (v: number) => top + (bottom - top) * (v + .8) / 5.6;
  ctx.fillStyle = '#15261c'; ctx.fillRect(0, 0, width, height);
  // District shapes orient the viewer; roads and queues below come from model state.
  ctx.fillStyle = '#1c3224';
  ctx.beginPath(); ctx.moveTo(x(.3), y(.8)); ctx.lineTo(x(1.6), y(.8)); ctx.lineTo(x(1.6), y(2.6)); ctx.lineTo(x(.3), y(2.6)); ctx.fill();
  ctx.fillStyle = '#26382b';
  for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
    const bx = x(col) + 12, by = y(row) + 10, bw = x(col + 1) - x(col) - 24, bh = y(row + 1) - y(row) - 20;
    if (bw > 4 && bh > 4) ctx.fillRect(bx, by, bw, bh);
  }
  ctx.font = '10px "DM Sans", sans-serif';
  ctx.fillStyle = '#7f9b72'; ctx.textAlign = 'left';
  ctx.fillText('EASTBOUND FREEWAY', x(0), 25);
  ctx.font = '9px "DM Sans", sans-serif';
  ctx.fillText('Westbank', x(.05), height - 18);
  ctx.textAlign = 'center'; ctx.fillText('City centre', x(3), height - 18);
  ctx.textAlign = 'right'; ctx.fillText('Eastern exits →', x(6.8), height - 18);
  const colors = (load: number) => load < .45 ? '#729566' : load < .8 ? '#a7b76a' : load < .95 ? '#d8bc70' : '#e59168';
  for (const link of state.links) {
    const dx = x(link.x2) - x(link.x1), dy = y(link.y2) - y(link.y1);
    const len = Math.hypot(dx, dy), offset = link.kind === 'street' ? 2 : 3;
    const ox = len ? -dy / len * offset : 0, oy = len ? dx / len * offset : 0;
    const load = link.storage ? link.occupancy / link.storage : 0;
    const px1 = x(link.x1) + ox, py1 = y(link.y1) + oy, px2 = x(link.x2) + ox, py2 = y(link.y2) + oy;
    ctx.lineCap = 'round'; ctx.strokeStyle = '#334833'; ctx.lineWidth = link.kind === 'freeway' ? 8 : link.kind === 'ramp' ? 5 : 4;
    ctx.beginPath(); ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.stroke();
    ctx.strokeStyle = colors(load); ctx.lineWidth = link.kind === 'freeway' ? 5 : link.kind === 'ramp' ? 3 : 2;
    ctx.beginPath(); ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.stroke();
    if (load > .96 || link.congested) {
      ctx.strokeStyle = '#e59168'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc((px1 + px2) / 2, (py1 + py2) / 2, link.kind === 'freeway' ? 5 : 3.6, 0, Math.PI * 2); ctx.stroke();
    }
    if (link.kind === 'freeway') {
      const mx = (px1 + px2) / 2, my = (py1 + py2) / 2;
      ctx.fillStyle = '#d3e6bb'; ctx.beginPath(); ctx.moveTo(mx + 3, my); ctx.lineTo(mx - 2, my - 2); ctx.lineTo(mx - 2, my + 2); ctx.fill();
    }
  }
  for (const node of state.nodes) {
    if (node.kind !== 'junction') continue;
    ctx.fillStyle = shared && node.connected && node.fresh ? '#d1f597' : '#859777';
    ctx.beginPath(); ctx.arc(x(node.x), y(node.y), shared && node.connected && node.fresh ? 2.6 : 2, 0, Math.PI * 2); ctx.fill();
  }
  // The eastern exit event has an exact location and schedule in the model.
  if (state.event.active) {
    ctx.strokeStyle = '#e9aa74'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x(6.4), y(-.8), 10, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#edb88a'; ctx.font = '9px "DM Sans", sans-serif'; ctx.textAlign = 'right'; ctx.fillText('Slow exit', x(6.8), y(-.8) - 15);
  }
  for (const source of state.sources) {
    if (source.waiting < .5) continue;
    const radius = Math.min(13, 5 + Math.sqrt(source.waiting) / 3);
    ctx.fillStyle = '#3d3927'; ctx.strokeStyle = '#e2aa73'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x(source.x), y(source.y), radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f1c191'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
    ctx.fillText(amount(source.waiting), x(source.x), y(source.y) + 3);
  }
  ctx.fillStyle = '#9cb38b'; ctx.font = '9px monospace'; ctx.textAlign = 'left';
  ctx.fillText(`Outside queue: ${amount(state.metrics.waitingOutside)}`, x(0), 45);
  // Guard against accidentally drawing an inferred network unrelated to the model.
  if (REGIONAL_TOPOLOGY.nodes.length !== state.nodes.length) throw new Error('Regional map topology and state do not match');
}
