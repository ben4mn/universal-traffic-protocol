import "./style.css";
import {
  TrafficSimulation,
  type Scenario,
  type SimulationSnapshot,
} from "./simulation";
import { CityView } from "./city";
import { SCENARIOS, inspectScenario } from "./scenarios";
import type { ScenarioInspection } from "./scenarios";

const github = "https://github.com/ben4mn/universal-traffic-protocol";
const icon = (name: string) => {
  const paths: Record<string, string> = {
    play: '<path d="m9 5 10 7-10 7Z"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
    code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/>',
    network:
      '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="m11 7-5 9m7-9 5 9M7 18h10"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    github:
      '<path d="M9 19c-5 1-5-3-7-3m14 6v-4c0-1 .1-2-1-3 4 0 6-2 6-5 0-1-1-3-2-4 0-1 0-3-1-3-2 0-3 1-4 1-2-1-4-1-6 0-1 0-2-1-4-1-1 0-1 2-1 3-1 1-2 3-2 4 0 3 2 5 6 5-1 1-1 2-1 3v4"/>',
  };
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.network}</svg>`;
};

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <header class="site-header wrap">
    <a href="#" class="brand" aria-label="Universal Traffic Protocol home"><span class="brand-mark">u<span>t</span>p</span><span class="brand-name">Universal<br>Traffic Protocol</span></a>
    <nav aria-label="Main navigation"><a class="nav-lab" href="#lab">Simulation</a><a href="#protocol">Protocol</a><a class="source-link" aria-label="Open source on GitHub" href="${github}" target="_blank" rel="noreferrer">${icon("github")}<span>GitHub</span></a></nav>
  </header>
  <main>
    <section class="intro wrap" aria-labelledby="headline">
      <div><p class="eyebrow"><span class="tiny-cross">✳</span> UNIVERSAL TRAFFIC PROTOCOL / V0.1</p><h1 id="headline">What if cars could<br>work <em>together?</em></h1></div>
      <div class="intro-right"><p>Cars from different companies should be able to talk to each other.</p><p class="intro-description">And to traffic lights, crossing sensors, and parking systems. UTP is a first attempt at a common protocol for that.</p><span class="draft-label">UTP / 0.1 <span>EARLY DRAFT</span></span></div>
    </section>

    <section id="lab" class="lab wrap" aria-labelledby="lab-heading">
      <div class="lab-heading"><div><span class="section-number">01 /</span><h2 id="lab-heading">Compare the two cities</h2></div><button id="model-open" class="text-button">About the model ${icon("code")}</button></div>
      <div class="experiment">
        <div class="experiment-top"><div class="scenario-buttons" role="group" aria-label="Traffic scenario"><button data-scenario="rush" class="selected" aria-pressed="true">01 <span>Morning commute</span></button><button data-scenario="school" aria-pressed="false">02 <span>The school crossing</span></button><button data-scenario="incident" aria-pressed="false">03 <span>Roadworks</span></button></div><div class="run-tools"><span class="clock-label">Run time</span><span id="sim-time" class="sim-time" title="Elapsed simulation time">01:00</span><button id="pause" class="icon-button" aria-label="Pause simulation">${icon("pause")}</button><button id="reset" class="icon-button" aria-label="Restart experiment">${icon("reset")}</button></div></div>
        <div class="scenario-brief"><div><p id="scenario-location" class="scenario-location">Market Street × Oak Avenue</p><h3 id="scenario-title">Rush hour on Market Street</h3><p id="scenario-setup"></p></div><div class="scene-event"><span id="scenario-event"></span><button id="scene-replay">Replay this scene ${icon("reset")}</button></div></div>
        <div class="view-bar"><div class="view-switch" role="group" aria-label="Simulation scale"><button data-view="micro" class="selected" aria-pressed="true"><span>Micro</span>One junction</button><button data-view="macro" aria-pressed="false"><span>Macro</span>Whole network</button></div><p id="view-note">The same run, up close</p><button id="advance" class="advance-button">Advance 3 min</button></div>
        <div class="cities"><article class="city-panel isolated"><div class="city-label"><div><span class="city-index">A</span><h3>Fixed traffic lights</h3></div><span class="mode-note">BASELINE</span></div><canvas id="isolated-city" role="img" aria-label="Animated baseline city with fixed traffic signals and no shared information"></canvas><div class="city-key"><span><i class="car-key"></i>Moving</span><span><i class="car-key stopped-key"></i>Waiting</span></div><div class="city-readout"><p id="a-live" class="local-state"></p><div class="readout-stats"><div><span id="a-local-label-1">Approach queue</span><strong id="a-local-1">—</strong></div><div><span id="a-local-label-2">Green for</span><strong id="a-local-2">—</strong></div><div><span id="a-local-label-3">Reports</span><strong id="a-local-3">—</strong></div></div><p id="a-explanation" class="city-explanation"></p></div><div class="metrics-caption">Across the whole network</div><div class="metrics"><div><span>Delay per finished trip</span><strong id="a-delay">—<small>s</small></strong></div><div><span>Trips completed</span><strong id="a-trips">—</strong></div><div><span>In the queue</span><strong id="a-queue">—</strong></div></div></article>
        <article class="city-panel connected"><div class="city-label"><div><span class="city-index">B</span><h3>Connected traffic lights</h3></div><span class="mode-note"><span id="b-mode-label">ADAPTIVE SIGNALS</span></span></div><canvas id="connected-city" role="img" aria-label="Animated comparison city whose participating signals use shared traffic observations"></canvas><div class="city-key"><span><i class="car-key connected-key"></i>Connected</span><span><i class="car-key"></i>Unconnected</span><button id="network-toggle" aria-pressed="true">${icon("network")}<span>Show connections</span></button></div><div class="city-readout"><p id="b-live" class="local-state"></p><div class="readout-stats"><div><span id="b-local-label-1">Approach queue</span><strong id="b-local-1">—</strong></div><div><span id="b-local-label-2">Green for</span><strong id="b-local-2">—</strong></div><div><span id="b-local-label-3">Reports</span><strong id="b-local-3">—</strong></div></div><p id="b-explanation" class="city-explanation"></p></div><div class="metrics-caption">Across the whole network</div><div class="metrics"><div><span>Delay per finished trip</span><strong id="b-delay">—<small>s</small></strong></div><div><span>Trips completed</span><strong id="b-trips">—</strong></div><div><span>In the queue</span><strong id="b-queue">—</strong></div></div></article></div>
        <div class="controls"><div class="control"><label for="adoption">Network adoption<output id="adoption-value" for="adoption">75%</output></label><input id="adoption" type="range" min="0" max="100" step="5" value="75"><div class="range-notes"><span>Nobody</span><span>Everyone</span></div></div><div class="control"><label for="demand">Traffic demand<output id="demand-value" for="demand">1.0×</output></label><input id="demand" type="range" min="40" max="200" step="10" value="100"><div class="range-notes"><span>Low demand</span><span>High demand</span></div></div><div class="control"><label for="loss">Messages lost<output id="loss-value" for="loss">0%</output></label><input id="loss" type="range" min="0" max="100" step="5" value="0"><div class="range-notes"><span>No loss</span><span>All messages lost</span></div></div></div>
        <div class="experiment-foot"><span>${icon("network")} Same road layout and requested trips.</span><button id="speed" class="speed-button">Time: 1×</button><span>Street names describe a fictional city</span></div>
      </div>
      <div class="story-strip"><span class="story-kicker" id="story-kicker">01 / RUSH HOUR</span><div><h3 id="story-title">Traffic lights can respond to the queue.</h3><p id="story-body">The city on the left follows a fixed signal schedule. On the right, participating lights adjust their timing using reports from sensors and vehicles. Change adoption to see what happens.</p></div><div class="outcome"><strong id="outcome-number">—</strong><span id="outcome-label">change in delay for finished trips</span></div></div>
      <p class="model-caveat">These numbers come from a simplified traffic model. Delay is averaged over finished trips, so check the queues and trip totals too. <a href="${github}/blob/main/docs/simulation.md" target="_blank" rel="noreferrer">See assumptions and limits</a>.</p>
    </section>

    <section id="protocol" class="protocol-section wrap" aria-labelledby="protocol-heading">
      <div class="section-intro"><p class="eyebrow">02 / THE PROTOCOL</p><h2 id="protocol-heading">What would they<br><em>tell each other?</em></h2><p>They don’t need to share their driving software. They need agreed message formats for things like position, observations, signal timing, and intentions.</p></div>
      <div class="protocol-explorer"><div class="participant-list" role="group" aria-label="Explore protocol participants"><button data-participant="vehicle" class="active" aria-pressed="true"><span class="participant-icon">01</span><span><strong>The vehicle</strong><small>Position, speed, and uncertainty</small></span><span class="participant-symbol">+</span></button><button data-participant="signal" aria-pressed="false"><span class="participant-icon">02</span><span><strong>The traffic signal</strong><small>Current state and timing</small></span><span class="participant-symbol">+</span></button><button data-participant="crossing" aria-pressed="false"><span class="participant-icon">03</span><span><strong>The crossing</strong><small>A pedestrian observation</small></span><span class="participant-symbol">+</span></button><button data-participant="parking" aria-pressed="false"><span class="participant-icon">04</span><span><strong>The parking sensor</strong><small>A recent availability reading</small></span><span class="participant-symbol">+</span></button></div><div class="message-panel"><div class="message-heading"><span id="message-type">PRESENCE</span><span>UTP 0.1 / EXAMPLE MESSAGE</span></div><h3 id="participant-title">A vehicle shares its current state.</h3><p id="participant-description">This example reports location and speed, including how uncertain those readings are. The identifier is temporary, and the message expires after one second.</p><pre tabindex="0" aria-label="Protocol message example"><code id="message-code"></code></pre><p class="message-note">Example from the draft specification</p></div></div>
      <div class="principles"><article><span>01</span><h3>Keep proprietary systems.</h3><p>A manufacturer can implement UTP without publishing its driving software. A city sensor can use the same message format.</p></article><article><span>02</span><h3>Reject stale information.</h3><p>Messages expire. Receivers must check the age of a reading, reject duplicates, and verify the map version before using it.</p></article><article><span>03</span><h3>Keep safety decisions local.</h3><p>A message can inform a decision. It cannot grant right of way. Vehicles and city controllers still follow the rules when messages stop.</p></article></div>
      <div class="spec-links"><a class="primary-link" href="${github}/blob/main/docs/protocol.md" target="_blank" rel="noreferrer">Read the v0.1 draft ${icon("code")}</a><a href="${github}/blob/main/protocol/schema.json" target="_blank" rel="noreferrer">View the JSON schema</a><span>7 message types · MIT license</span></div>
    </section>

    <section class="limits-section wrap" aria-labelledby="limits-heading"><div class="limits-title"><p class="eyebrow">03 / WHERE THIS STARTED</p><h2 id="limits-heading">The idea I had<br>when I was <em>seven.</em></h2><p class="large-answer">If everything could communicate,<br>could we eventually get rid of traffic?</p></div><div class="limits-copy"><p>I imagined cars talking to each other, and then the rest of the city joining in: stop signs, traffic lights, crossings, parking sensors.</p><p>More participants would give the network more information. The next question is whether that information leads to better decisions, and how much difference it makes as traffic increases.</p><p>This first version gives us something to try. The protocol is open, and so is the model. We can test where it helps, where it falls short, and what to build next.</p><button id="capacity-test" class="capacity-button">Try twice the traffic ${icon("network")}</button><a class="standards-link" href="${github}/blob/main/docs/standards.md" target="_blank" rel="noreferrer">How this relates to existing V2X standards</a></div></section>
  </main>
  <footer class="wrap"><a class="footer-brand" href="#">UTP / Universal Traffic Protocol</a><p>Started by Ben · Open source under MIT</p><a href="${github}" target="_blank" rel="noreferrer">GitHub ${icon("github")}</a></footer>
  <dialog id="model-dialog"><div class="dialog-top"><span class="eyebrow">ABOUT THE MODEL</span><button id="model-close" class="icon-button" aria-label="Close model explanation">${icon("close")}</button></div><h2>How this comparison works</h2><p>Both cities receive the same trip requests: the same arrival times, starting points, and destinations. The left uses fixed traffic lights. Connected lights on the right can change their timing, and connected vehicles can choose routes using fresh reports.</p><dl><div><dt>Delay per finished trip</dt><dd>The extra travel time for vehicles that have finished, compared with a trip through an empty network. Vehicles still waiting are excluded.</dd></div><div><dt>Trips completed</dt><dd>Vehicles that reached their destination since the run began. Both cities receive the same number of trip requests.</dd></div><div><dt>In the queue</dt><dd>Stopped vehicles, plus vehicles waiting to enter because the road is full. The count includes queues outside the picture.</dd></div><div><dt>Adoption and message loss</dt><dd>Adoption sets how many vehicles and signals participate. Connected signals use reports from sensors and vehicles. If those reports stop arriving, the signals return to fixed timing.</dd></div><div><dt>What is simplified</dt><dd>This is a made-up 3 × 3 street grid. Lanes have limited space, vehicles keep a minimum gap, and signals allow time between conflicting directions. It isn’t calibrated to a real city. The communication links are illustrative, and parking isn’t simulated yet.</dd></div></dl><a href="${github}/blob/main/docs/simulation.md" target="_blank" rel="noreferrer">Read the model and reproducibility notes</a></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
let scenario: Scenario = "rush";
let paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let showNetwork = true;
let speed = 1;
let view: "micro" | "macro" = "micro";
let accumulator = 0;
let a: TrafficSimulation, b: TrafficSimulation;
let aState: SimulationSnapshot, bState: SimulationSnapshot;
const aView = new CityView($("#isolated-city"), false),
  bView = new CityView($("#connected-city"), true);
const adoption = $<HTMLInputElement>("#adoption"),
  demand = $<HTMLInputElement>("#demand"),
  loss = $<HTMLInputElement>("#loss");
function applyView() {
  const definition = SCENARIOS[scenario];
  $("button[data-view='micro']").innerHTML =
    `<span>Micro</span>${scenario === "incident" ? "One block" : "One junction"}`;
  aView.setView(view, definition.microFocus, scenario);
  bView.setView(view, definition.microFocus, scenario);
  document
    .querySelectorAll<HTMLButtonElement>("button[data-view]")
    .forEach((button) => {
      const selected = button.dataset.view === view;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  $(".experiment").dataset.view = view;
  $("#view-note").textContent =
    view === "micro"
      ? "The same run, up close"
      : "All nine junctions · the same run";
  $("#story-kicker").textContent =
    `${view.toUpperCase()} / ${definition.location}`;
  $("#story-title").textContent =
    view === "micro"
      ? scenario === "incident"
        ? "What to watch on this block"
        : "What to watch at this junction"
      : "What to watch across town";
  $("#story-body").textContent = definition[view].watchFor;
  $<HTMLCanvasElement>("#isolated-city").setAttribute(
    "aria-label",
    `${view === "micro" ? "Close-up" : "Network view"} of ${definition.location} with fixed traffic lights`,
  );
  $<HTMLCanvasElement>("#connected-city").setAttribute(
    "aria-label",
    `${view === "micro" ? "Close-up" : "Network view"} of ${definition.location} with participating adaptive traffic lights`,
  );
}

function updateScene() {
  const definition = SCENARIOS[scenario];
  $("#scenario-location").textContent = definition.location;
  $("#scenario-title").textContent = definition.title;
  $("#scenario-setup").textContent = definition.setup;
  $("#scene-replay").innerHTML =
    `${scenario === "school" ? "Replay the crossing" : scenario === "incident" ? "Replay the slowdown" : "Replay this junction"} ${icon("reset")}`;
  applyView();
}

function updateLabels() {
  $("#adoption-value").textContent = `${adoption.value}%`;
  $("#demand-value").textContent =
    `${(Number(demand.value) / 100).toFixed(1)}×`;
  $("#loss-value").textContent = `${loss.value}%`;
  for (const slider of [adoption, demand, loss])
    slider.style.setProperty(
      "--range-fill",
      `${((Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min))) * 100}%`,
    );
}

function reset() {
  updateLabels();
  const config = {
    adoption: Number(adoption.value) / 100,
    demand: Number(demand.value) / 100,
    packetLoss: Number(loss.value) / 100,
    scenario,
    seed: 7,
  };
  a = new TrafficSimulation({ ...config, mode: "isolated" });
  b = new TrafficSimulation({ ...config, mode: "connected" });
  // Both engines replay the same travelers up to the scenario’s starting point.
  accumulator = 0;
  for (let i = 0; i < SCENARIOS[scenario].startSeconds * 10; i++) {
    a.step(0.1);
    b.step(0.1);
  }
  aState = a.getSnapshot();
  bState = b.getSnapshot();
  render();
  updateMetrics();
}

function setScenario(value: Scenario) {
  scenario = value;
  document
    .querySelectorAll<HTMLButtonElement>("[data-scenario]")
    .forEach((btn) => {
      const selected = btn.dataset.scenario === value;
      btn.classList.toggle("selected", selected);
      btn.setAttribute("aria-pressed", String(selected));
    });
  updateScene();
  reset();
}

function updateDetails() {
  const inspections = [inspectScenario(aState), inspectScenario(bState)];
  for (const [index, prefix] of ["a", "b"].entries()) {
    const detail = inspections[index];
    const state = index === 0 ? aState : bState;
    const node = detail.intersection;
    const streets = detail.definition.streets;
    const green = node.pedestrian
      ? "All stopped"
      : node.state === "clearance"
        ? "All red"
        : node.state === "EW"
          ? streets.horizontal.replace(" Street", "")
          : streets.vertical.replace(" Avenue", "");
    const report =
      index === 0
        ? "Off"
        : !node.connected
          ? "Unequipped"
          : node.fresh
            ? "Fresh"
            : "None";
    const labels =
      view === "micro"
        ? [
            scenario === "incident" ? "Waiting at Oak" : "Approach queue",
            node.pedestrian || node.state === "clearance"
              ? "Signal state"
              : "Green for",
            "Shared reports",
          ]
        : ["Outside queue", "Full lanes", "Queued junctions"];
    const values =
      view === "micro"
        ? [detail.focusQueue, green, report]
        : [
            state.metrics.waitingOutside,
            detail.network.fullRoads,
            `${detail.network.queuedIntersections} / 9`,
          ];
    labels.forEach((label, i) => {
      $(`#${prefix}-local-label-${i + 1}`).textContent = label;
      $(`#${prefix}-local-${i + 1}`).textContent = String(values[i]);
      $(`#${prefix}-local-${i + 1}`).classList.toggle(
        "word-stat",
        typeof values[i] === "string",
      );
    });
    $(`#${prefix}-live`).textContent =
      view === "macro"
        ? `${state.metrics.queue} cars waiting across the network, including its entrances.`
        : localState(detail);
    $(`#${prefix}-explanation`).textContent =
      detail.definition[view][index === 0 ? "isolated" : "connected"];
  }
  const detail = inspections[1];
  $("#b-mode-label").textContent =
    view === "macro"
      ? `${bState.intersections.filter((n) => n.connected && n.fresh).length} / 9 ADAPTIVE`
      : !detail.intersection.connected
        ? "UNEQUIPPED"
        : detail.intersection.fresh
          ? "ADAPTIVE SIGNAL"
          : "FIXED FALLBACK";
  const crossing = detail.protectedCrossing;
  const restriction = detail.restriction;
  const event = $("#scenario-event");
  event.dataset.state =
    crossing?.active || restriction?.active ? "active" : "waiting";
  event.textContent = crossing
    ? crossing.active
      ? `Crossing active · ${crossing.remainingSeconds.toFixed(1)} s left`
      : `Next crossing in ${crossing.nextInSeconds.toFixed(1)} s`
    : restriction
      ? restriction.active
        ? "Eastbound lane limited to 10 km/h"
        : `Lane slows in ${restriction.startsInSeconds.toFixed(1)} s`
      : "More traffic arrives from the east and west";
}

function localState(detail: ScenarioInspection) {
  if (detail.protectedCrossing?.active)
    return "People are crossing. All vehicle approaches are stopped.";
  if (detail.intersection.state === "clearance")
    return "All red while the light changes direction.";
  const street =
    detail.intersection.state === "EW"
      ? detail.definition.streets.horizontal
      : detail.definition.streets.vertical;
  return `${street} has green. ${detail.focusQueue} cars are waiting on the approaches.`;
}

function advanceRun() {
  // An explicit jump runs the same physical model, retaining both modes and controls.
  a.step(180);
  b.step(180);
  aState = a.getSnapshot();
  bState = b.getSnapshot();
  accumulator = 0;
  render();
  updateMetrics();
}

document
  .querySelectorAll<HTMLButtonElement>("button[data-view]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      view = button.dataset.view as "micro" | "macro";
      applyView();
      render();
      updateMetrics();
    });
  });
$("#scene-replay").addEventListener("click", () => {
  view = "micro";
  applyView();
  reset();
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    paused = false;
  updatePause();
});
$("#advance").addEventListener("click", advanceRun);

function updateMetrics() {
  for (const [prefix, state] of [
    ["a", aState],
    ["b", bState],
  ] as const) {
    $(`#${prefix}-delay`).innerHTML =
      `${state.metrics.completed ? Math.round(state.metrics.meanDelay) : "—"}<small>s</small>`;
    $(`#${prefix}-trips`).textContent =
      state.metrics.completed.toLocaleString();
    $(`#${prefix}-queue`).textContent = state.metrics.queue.toLocaleString();
  }
  const diff = aState.metrics.meanDelay - bState.metrics.meanDelay;
  const percent =
    aState.metrics.meanDelay > 1
      ? Math.round((Math.abs(diff) / aState.metrics.meanDelay) * 100)
      : 0;
  const enough = aState.metrics.completed > 10 && bState.metrics.completed > 10;
  $("#outcome-number").textContent = enough ? `${percent}%` : "…";
  $("#outcome-label").textContent = enough
    ? percent === 0
      ? "similar delay per finished trip"
      : diff >= 0
        ? "less delay per finished trip"
        : "more delay per finished trip"
    : "collecting completed trips";
  $("#outcome-number").classList.toggle("worse", diff < 0);
  updateDetails();
  const secs = Math.floor(aState.time);
  $("#sim-time").textContent =
    `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
}

function render() {
  aView.render(aState, showNetwork, aState.time);
  bView.render(bState, showNetwork, bState.time);
}
function updatePause() {
  $("#pause").innerHTML = icon(paused ? "play" : "pause");
  $("#pause").setAttribute(
    "aria-label",
    paused ? "Play simulation" : "Pause simulation",
  );
}
$("#pause").addEventListener("click", () => {
  paused = !paused;
  updatePause();
  updateMetrics();
});
updatePause();
$("#reset").addEventListener("click", reset);
$("#network-toggle").addEventListener("click", () => {
  showNetwork = !showNetwork;
  $("#network-toggle").setAttribute("aria-pressed", String(showNetwork));
  $("#network-toggle span").textContent = showNetwork
    ? "Show connections"
    : "Connections hidden";
  render();
});
$("#speed").addEventListener("click", () => {
  speed = speed === 1 ? 3 : speed === 3 ? 6 : 1;
  $("#speed").textContent = `Time: ${speed}×`;
});
for (const input of [adoption, demand, loss]) {
  input.addEventListener("input", updateLabels);
  input.addEventListener("change", reset);
}
document
  .querySelectorAll<HTMLButtonElement>("[data-scenario]")
  .forEach((btn) =>
    btn.addEventListener("click", () =>
      setScenario(btn.dataset.scenario as Scenario),
    ),
  );
$("#capacity-test").addEventListener("click", () => {
  adoption.value = "100";
  demand.value = "200";
  loss.value = "0";
  view = "macro";
  setScenario("rush");
  advanceRun();
  $("#lab").scrollIntoView({ behavior: "smooth", block: "start" });
});
const dialog = $<HTMLDialogElement>("#model-dialog");
$("#model-open").addEventListener("click", () => dialog.showModal());
$("#model-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      dialog.close();
  }
});

const exampleFiles = import.meta.glob("../protocol/examples/*.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const participants: Record<
  string,
  { type: string; title: string; description: string; match: string }
> = {
  vehicle: {
    type: "presence",
    title: "A vehicle shares its current state.",
    description:
      "This example reports location and speed, including how uncertain those readings are. The identifier is temporary, and the message expires after one second.",
    match: "presence",
  },
  signal: {
    type: "infrastructure_state",
    title: "A signal shares its current state.",
    description:
      "The message identifies the intersection, its map version, and the current signal state. Receivers still have to follow the actual signal and local road rules.",
    match: "infrastructure",
  },
  crossing: {
    type: "observation",
    title: "A sensor reports a person nearby.",
    description:
      "A roadside sensor reports a pedestrian observation. It includes the time and uncertainty of the reading, without identifying the person.",
    match: "observation",
  },
  parking: {
    type: "infrastructure_state",
    title: "A parking system reports availability.",
    description:
      "The message reports how many spaces are occupied and when they were counted. It doesn’t reserve a space. Parking is a proposed use case; it isn’t part of the simulation yet.",
    match: "parking",
  },
};
function setParticipant(key: string) {
  const p = participants[key];
  if (!p) return;
  document
    .querySelectorAll<HTMLButtonElement>("[data-participant]")
    .forEach((btn) => {
      const active = btn.dataset.participant === key;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  $("#message-type").textContent = p.type.toUpperCase().replaceAll("_", " / ");
  $("#participant-title").textContent = p.title;
  $("#participant-description").textContent = p.description;
  const raw = Object.entries(exampleFiles).find(([path]) =>
    path.includes(p.match),
  )?.[1];
  $("#message-code").textContent = raw
    ? JSON.stringify(JSON.parse(raw), null, 2)
    : JSON.stringify(
        {
          utp: "0.1",
          type: p.type,
          sender: {
            session_id: "demo:city-07",
            kind: key === "vehicle" ? "vehicle" : "infrastructure",
          },
          ttl_ms: 1000,
          body: { note: "Profile example is available in the protocol draft." },
        },
        null,
        2,
      );
}
document
  .querySelectorAll<HTMLButtonElement>("[data-participant]")
  .forEach((btn) =>
    btn.addEventListener("click", () =>
      setParticipant(btn.dataset.participant!),
    ),
  );
setParticipant("vehicle");

updateScene();
reset();
let last = performance.now(),
  metricClock = 0;
function frame(now: number) {
  const elapsed = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!paused && !document.hidden) {
    accumulator += elapsed * speed;
    while (accumulator >= 0.1) {
      a.step(0.1);
      b.step(0.1);
      accumulator -= 0.1;
    }
    aState = a.getSnapshot();
    bState = b.getSnapshot();
    render();
    metricClock += elapsed;
    if (metricClock > 0.4) {
      updateMetrics();
      metricClock = 0;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener("resize", () => requestAnimationFrame(render));

// An optional browser agent interface shares the same actions as the visible controls.
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean };
  execute: (input: unknown) => unknown;
};
const modelContext = (
  document as Document & {
    modelContext?: {
      registerTool: (
        tool: Tool,
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
  }
).modelContext;
if (modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const read = () => ({
    scenario,
    view,
    adoption: Number(adoption.value) / 100,
    demand: Number(demand.value) / 100,
    packetLoss: Number(loss.value) / 100,
    paused,
    time: aState.time,
    isolated: aState.metrics,
    connected: bState.metrics,
  });
  const register = (tool: Tool) => {
    try {
      Promise.resolve(
        modelContext.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {
      /* Optional browser API. */
    }
  };
  register({
    name: "read_traffic_experiment",
    description:
      "Read the current controls and measured traffic-model results.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: read,
  });
  register({
    name: "configure_traffic_experiment",
    description:
      "Set the visible experiment controls and restart both cities with matched demand. All values are required.",
    inputSchema: {
      type: "object",
      properties: {
        scenario: { enum: ["rush", "school", "incident"] },
        adoption: { type: "number", minimum: 0, maximum: 1 },
        demand: { type: "number", minimum: 0.4, maximum: 2 },
        packetLoss: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["scenario", "adoption", "demand", "packetLoss"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute(input) {
      if (!input || typeof input !== "object")
        throw new Error("Expected experiment controls");
      const p = input as Record<string, unknown>;
      if (
        !["rush", "school", "incident"].includes(String(p.scenario)) ||
        Object.keys(p).some(
          (k) => !["scenario", "adoption", "demand", "packetLoss"].includes(k),
        )
      )
        throw new Error("Unknown scenario or control");
      for (const [k, min, max] of [
        ["adoption", 0, 1],
        ["demand", 0.4, 2],
        ["packetLoss", 0, 1],
      ] as const)
        if (
          typeof p[k] !== "number" ||
          !Number.isFinite(p[k]) ||
          (p[k] as number) < min ||
          (p[k] as number) > max
        )
          throw new Error(`Invalid ${k}`);
      adoption.value = String(Math.round((p.adoption as number) * 20) * 5);
      demand.value = String(Math.round((p.demand as number) * 10) * 10);
      loss.value = String(Math.round((p.packetLoss as number) * 20) * 5);
      setScenario(p.scenario as Scenario);
      return read();
    },
  });
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
}
