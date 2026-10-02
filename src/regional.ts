/**
 * A finite-storage, multi-commodity cell-transmission teaching model.
 * Each directed link is one triangular-fundamental-diagram cell. Vehicle mass
 * follows a fixed route from a boundary source to one of six eastern exits.
 * Routes minimize free-flow time; freeway-to-city trips have an assigned
 * off-ramp distributed over the three ramps, then use city streets.
 * Turning flows share sending capacity proportionally; blocked turns do not
 * block unrelated turns on the same link (partial FIFO). Contested receivers
 * share available space proportionally. This is a fluid
 * model, not individual car following, lane changing, or calibrated forecasting.
 *
 * Both controllers use local approach occupancy, minimum/maximum green and
 * an all-red interval. Shared control additionally discounts movements into
 * reported crowded links and meters on-ramps using the downstream freeway
 * report. Physical receiving limits apply to both. Messages are two seconds
 * late, sent every six seconds, and expire twelve seconds after observation.
 * Missing or expired reports use exactly the local policy.
 *
 * “queue” = outside holding + occupancy above NOMINAL critical free-flow
 * occupancy, including during the exit restriction. “spillbackLinks” is the
 * number of links at least 80% full, an incipient-spillback indicator, not a
 * count of individually verified blocked upstream movements. No endogenous
 * capacity drop or car-following string instability is modeled.
 * Total vehicle-seconds integrates ALL unfinished mass, including outside
 * holding and moving traffic, avoiding completed-trip survivor bias.
 */
export type RegionalScenario = "pulse" | "steady" | "overload";
export type RegionalStrategy = "local" | "shared";
export type RegionalPhase = "EW" | "NS" | "clearance";
export interface RegionalConfig {
  scenario: RegionalScenario;
  strategy: RegionalStrategy;
  adoption: number;
  packetLoss: number;
  seed?: number;
  demandScale?: number;
  routePattern?: "distributed" | "lastRamp";
}
export interface RegionalNode {
  id: string; x: number; y: number; kind: "junction" | "freeway" | "boundary";
}
export interface RegionalLink {
  id: string; from: string; to: string;
  x1: number; y1: number; x2: number; y2: number;
  kind: "street" | "freeway" | "ramp";
  capacity: number; storage: number; length: number;
  freeFlowSeconds: number; criticalOccupancy: number;
  terminal: boolean; source: boolean;
}
export interface RegionalSource {
  id: string; x: number; y: number; linkId: string; rate: number;
}
export const REGIONAL_CONSTANTS = Object.freeze({
  stepSeconds: 2, rows: 5, columns: 7, reportEverySeconds: 6,
  reportLatencySeconds: 2, reportTtlSeconds: 12,
  minimumGreenSeconds: 10, maximumGreenSeconds: 40, allRedSeconds: 2,
  disturbanceStart: 300, disturbanceEnd: 540,
  disturbanceExitCapacity: 0.25,
});

function buildTopology() {
  const nodes: RegionalNode[] = [];
  const links: RegionalLink[] = [];
  const sources: RegionalSource[] = [];
  const addNode = (id: string, x: number, y: number, kind: RegionalNode["kind"]) => {
    const node = { id, x, y, kind }; nodes.push(node); return node;
  };
  for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) addNode(`j${x}_${y}`, x, y, "junction");
  for (let x = 0; x < 7; x++) addNode(`f${x}`, x, -0.8, "freeway");
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const link = (from: string, to: string, kind: RegionalLink["kind"], source = false, terminal = false) => {
    const a = nodeMap.get(from)!, b = nodeMap.get(to)!;
    const length = kind === "freeway" ? 400 : kind === "ramp" ? 200 : 250;
    const capacity = kind === "freeway" ? 1.7 : kind === "ramp" ? 0.38 : 0.55;
    const freeFlowSeconds = length / (kind === "freeway" ? 25 : kind === "ramp" ? 10 : 12.5);
    const item: RegionalLink = { id: `${from}>${to}`, from, to, x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      kind, capacity, storage: kind === "freeway" ? 95 : kind === "ramp" ? 36 : 50,
      length, freeFlowSeconds, criticalOccupancy: capacity * freeFlowSeconds, terminal, source };
    links.push(item); return item;
  };
  for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) {
    if (x < 6) { link(`j${x}_${y}`, `j${x + 1}_${y}`, "street"); link(`j${x + 1}_${y}`, `j${x}_${y}`, "street"); }
    if (y < 4) { link(`j${x}_${y}`, `j${x}_${y + 1}`, "street"); link(`j${x}_${y + 1}`, `j${x}_${y}`, "street"); }
  }
  for (let x = 0; x < 6; x++) link(`f${x}`, `f${x + 1}`, "freeway");
  for (const x of [1, 3, 5]) { link(`j${x}_0`, `f${x}`, "ramp"); link(`f${x}`, `j${x}_0`, "ramp"); }
  const boundary = (id: string, x: number, y: number) => { const n = addNode(id, x, y, "boundary"); nodeMap.set(id, n); };
  const source = (id: string, x: number, y: number, to: string, kind: RegionalLink["kind"], rate: number) => {
    boundary(id, x, y); const entry = link(id, to, kind, true);
    sources.push({ id, x, y, linkId: entry.id, rate });
  };
  for (let y = 0; y < 5; y++) {
    source(`west${y}`, -0.8, y, `j0_${y}`, "street", 0.12);
    boundary(`east${y}`, 6.8, y); link(`j6_${y}`, `east${y}`, "street", false, true);
  }
  for (const x of [1, 3, 5]) {
    source(`north${x}`, x, -0.45, `j${x}_0`, "street", 0.07);
    source(`south${x}`, x, 4.8, `j${x}_4`, "street", 0.07);
  }
  source("freeway-west", -0.8, -0.8, "f0", "freeway", 1.25);
  boundary("freeway-east", 6.8, -0.8); link("f6", "freeway-east", "freeway", false, true);
  return { nodes, links, sources };
}
export const REGIONAL_TOPOLOGY = buildTopology();
const nodeById = new Map(REGIONAL_TOPOLOGY.nodes.map(node => [node.id, node]));
const linkById = new Map(REGIONAL_TOPOLOGY.links.map(link => [link.id, link]));
const incoming = new Map<string, RegionalLink[]>(), outgoing = new Map<string, RegionalLink[]>();
for (const node of REGIONAL_TOPOLOGY.nodes) {
  incoming.set(node.id, REGIONAL_TOPOLOGY.links.filter(link => link.to === node.id));
  outgoing.set(node.id, REGIONAL_TOPOLOGY.links.filter(link => link.from === node.id && !link.source));
}
interface Route { id: number; links: string[]; positions: Map<string, number>; }
function shortestRoute(entry: RegionalLink, terminal: RegionalLink, allowRamps = true): string[] {
  const costs = new Map<string, number>([[entry.to, 0]]);
  const previous = new Map<string, RegionalLink>();
  const open = new Set([entry.to]);
  while (open.size) {
    let current = [...open].sort((a, b) => costs.get(a)! - costs.get(b)!)[0]!;
    open.delete(current);
    if (current === terminal.from) break;
    for (const next of outgoing.get(current) ?? []) {
      if (next.terminal || !allowRamps && next.kind === "ramp") continue;
      const cost = costs.get(current)! + next.freeFlowSeconds;
      if (cost < (costs.get(next.to) ?? Infinity) - 1e-9) {
        costs.set(next.to, cost); previous.set(next.to, next); open.add(next.to);
      }
    }
  }
  const path = [terminal.id]; let current = terminal.from;
  while (current !== entry.to) {
    const edge = previous.get(current);
    if (!edge) throw new Error(`No route from ${entry.id} to ${terminal.id}`);
    path.unshift(edge.id); current = edge.from;
  }
  path.unshift(entry.id); return path;
}
const terminals = REGIONAL_TOPOLOGY.links.filter(link => link.terminal);
const routes: Route[] = [];
const sourceRoutes = new Map<string, number[][]>();
const concentratedRoutes = new Map<string, number[][]>();
const registerRoute = (path: string[]) => {
  const id = routes.length;
  routes.push({ id, links: path, positions: new Map(path.map((link, index) => [link, index])) }); return id;
};
for (const source of REGIONAL_TOPOLOGY.sources) {
  const options: number[][] = [];
  const concentrated: number[][] = [];
  for (const terminal of terminals) {
    concentrated.push([registerRoute(shortestRoute(linkById.get(source.linkId)!, terminal))]);
    const choices: string[][] = [];
    if (source.id === "freeway-west" && terminal.kind === "street") {
      for (const x of [1, 3, 5]) {
        const prefix = [source.linkId];
        for (let i = 0; i < x; i++) prefix.push(`f${i}>f${i + 1}`);
        prefix.push(`f${x}>j${x}_0`);
        const targetRow = nodeById.get(terminal.from)!.y;
        // Among equal-time city paths, turn south at the assigned off-ramp;
        // this spreads routes over destination streets rather than forcing
        // every city-bound trip down the same top-row corridor.
        for (let y = 0; y < targetRow; y++) prefix.push(`j${x}_${y}>j${x}_${y + 1}`);
        for (let i = x; i < 6; i++) prefix.push(`j${i}_${targetRow}>j${i + 1}_${targetRow}`);
        prefix.push(terminal.id); choices.push(prefix);
      }
    } else choices.push(shortestRoute(linkById.get(source.linkId)!, terminal));
    const ids: number[] = [];
    for (const path of choices) {
      ids.push(registerRoute(path));
    }
    options.push(ids);
  }
  sourceRoutes.set(source.id, options);
  concentratedRoutes.set(source.id, concentrated);
}
function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function poisson(lambda: number, random: () => number) {
  const limit = Math.exp(-lambda); let product = 1, count = 0;
  do { count++; product *= random(); } while (product > limit);
  return count - 1;
}
const total = (mass: Map<number, number>) => { let n = 0; for (const amount of mass.values()) n += amount; return n; };
const add = (mass: Map<number, number>, route: number, amount: number) => {
  const value = (mass.get(route) ?? 0) + amount;
  if (value < 1e-12) mass.delete(route); else mass.set(route, value);
};
interface Signal { phase: "EW" | "NS"; age: number; clearance: number; connected: boolean; }
interface Report { observed: number; values: Map<string, number>; }
interface Transfer { from: string | null; source?: string; to: string | null; route: number; amount: number; }
export interface RegionalSnapshot {
  time: number; scenario: RegionalScenario; strategy: RegionalStrategy;
  links: (RegionalLink & { occupancy: number; queue: number; flow: number; outflow: number; congested: boolean; effectiveCapacity: number })[];
  nodes: (RegionalNode & { phase: RegionalPhase; connected: boolean; fresh: boolean })[];
  sources: (RegionalSource & { waiting: number; generated: number; effectiveRate: number; destinations: { exit: string; generated: number }[] })[];
  metrics: { generated: number; completed: number; onNetwork: number; waitingOutside: number; totalVehicleSeconds: number;
    queue: number; cityQueue: number; freewayQueue: number; rampQueue: number; spillbackLinks: number; maxQueue: number;
    exitThroughput: number; freshControllers: number; sentReports: number; receivedReports: number; droppedReports: number };
  history: { time: number; queue: number; completed: number; spillbackLinks: number; waitingOutside: number }[];
  event: { active: boolean; start: number; end: number; label: string; normalExitCapacity: number; activeExitCapacity: number };
  bound: { demandRate: number; exitCapacity: number; minimumGrowthPerMinute: number; unfinishedLowerBound: number };
}

export class RegionalSimulation {
  readonly config: Required<RegionalConfig>;
  private readonly demandRandom: () => number;
  private readonly messageRandom: () => number;
  private readonly mass = new Map<string, Map<number, number>>();
  private readonly outside = new Map<string, Map<number, number>>();
  private readonly sourceGenerated = new Map<string, number>();
  private readonly destinationGenerated = new Map<string, number[]>();
  private readonly signals = new Map<string, Signal>();
  private readonly freewayConnected = new Map<string, boolean>();
  private readonly reports = new Map<string, Report>();
  private readonly pending: { node: string; report: Report; delivered: number }[] = [];
  private readonly flows = new Map<string, number>();
  private readonly inflows = new Map<string, number>();
  private readonly series: RegionalSnapshot["history"] = [];
  private time = 0; private accumulator = 0;
  private generated = 0; private completed = 0; private vehicleSeconds = 0;
  private maxQueue = 0; private sent = 0; private received = 0; private dropped = 0;

  constructor(config: RegionalConfig) {
    if (!["pulse", "steady", "overload"].includes(config.scenario) || !["local", "shared"].includes(config.strategy)) throw new RangeError("Unknown regional scenario or strategy");
    if (!Number.isFinite(config.adoption) || config.adoption < 0 || config.adoption > 1 || !Number.isFinite(config.packetLoss) || config.packetLoss < 0 || config.packetLoss > 1) throw new RangeError("Adoption and packet loss must be between zero and one");
    const seed = config.seed ?? 7, demandScale = config.demandScale ?? 1, routePattern = config.routePattern ?? "distributed";
    if (!Number.isFinite(seed) || !Number.isFinite(demandScale) || demandScale < 0 || demandScale > 10) throw new RangeError("Invalid seed or demand scale");
    if (routePattern !== "distributed" && routePattern !== "lastRamp") throw new RangeError("Unknown route pattern");
    this.config = { ...config, seed, demandScale, routePattern };
    this.demandRandom = randomGenerator(seed);
    this.messageRandom = randomGenerator(seed ^ 0x36d984b7);
    const adoptionRandom = randomGenerator(seed ^ 0x9a173ea1);
    for (const link of REGIONAL_TOPOLOGY.links) this.mass.set(link.id, new Map());
    for (const source of REGIONAL_TOPOLOGY.sources) {
      this.outside.set(source.id, new Map()); this.sourceGenerated.set(source.id, 0);
      this.destinationGenerated.set(source.id, Array(6).fill(0));
    }
    for (const node of REGIONAL_TOPOLOGY.nodes) {
      const connected = adoptionRandom() < config.adoption;
      if (node.kind === "junction") this.signals.set(node.id, { phase: "EW", age: 0, clearance: 0, connected });
      if (node.kind === "freeway") this.freewayConnected.set(node.id, connected);
    }
    this.record();
  }
  step(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Step duration must be finite and nonnegative");
    this.accumulator += seconds;
    while (this.accumulator >= REGIONAL_CONSTANTS.stepSeconds - 1e-9) {
      this.tick(); this.accumulator = Math.max(0, this.accumulator - REGIONAL_CONSTANTS.stepSeconds);
    }
  }
  private demandFactor() { return this.config.demandScale * (this.config.scenario === "overload" ? 2.5 : 1); }
  private isDisturbed() { return this.config.scenario === "pulse" && this.time >= 300 && this.time < 540; }
  private capacity(link: RegionalLink) { return this.isDisturbed() && link.to === "freeway-east" ? REGIONAL_CONSTANTS.disturbanceExitCapacity : link.capacity; }
  private fresh(node: string) {
    const report = this.reports.get(node);
    return this.config.strategy === "shared" && report && this.time - report.observed <= REGIONAL_CONSTANTS.reportTtlSeconds ? report : undefined;
  }
  private communicate() {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const message = this.pending[i]!;
      if (message.delivered <= this.time) { this.reports.set(message.node, message.report); this.received++; this.pending.splice(i, 1); }
    }
    if (this.config.strategy !== "shared" || this.time % 6 !== 0) return;
    for (const node of REGIONAL_TOPOLOGY.nodes) {
      const connected = this.signals.get(node.id)?.connected ?? this.freewayConnected.get(node.id) ?? false;
      if (!connected) continue;
      this.sent++;
      if (this.messageRandom() < this.config.packetLoss) { this.dropped++; continue; }
      const values = new Map((outgoing.get(node.id) ?? []).map(link => [link.id, total(this.mass.get(link.id)!)]));
      this.pending.push({ node: node.id, report: { observed: this.time, values }, delivered: this.time + 2 });
    }
  }
  private pressure(node: string, axis: "EW" | "NS") {
    let score = 0; const report = this.fresh(node);
    for (const link of incoming.get(node) ?? []) {
      if ((Math.abs(link.x2 - link.x1) > Math.abs(link.y2 - link.y1) ? "EW" : "NS") !== axis) continue;
      for (const [routeId, amount] of this.mass.get(link.id)!) {
        const route = routes[routeId]!, nextId = route.links[(route.positions.get(link.id) ?? -1) + 1];
        const next = nextId ? linkById.get(nextId) : undefined;
        const observed = nextId ? report?.values.get(nextId) : undefined;
        // Downstream space discounts the same locally measured demand. Absence
        // of fresh information leaves the exact local pressure unchanged.
        const room = next && observed !== undefined ? Math.max(0, 1 - observed / next.storage) : 1;
        score += amount * room;
      }
    }
    return score;
  }
  private control() {
    for (const [node, signal] of this.signals) {
      if (signal.clearance > 0) { signal.clearance -= 2; signal.age = 0; continue; }
      signal.age += 2;
      const other = signal.phase === "EW" ? "NS" : "EW";
      const own = this.pressure(node, signal.phase), competing = this.pressure(node, other);
      if (signal.age >= 10 && (competing > own * 1.12 + 0.5 || signal.age >= 40 && competing > 0.01)) {
        signal.phase = other; signal.age = 0; signal.clearance = 2;
      }
    }
  }
  private canSend(link: RegionalLink) {
    const signal = this.signals.get(link.to);
    if (!signal) return true;
    const axis = Math.abs(link.x2 - link.x1) > Math.abs(link.y2 - link.y1) ? "EW" : "NS";
    return signal.clearance === 0 && signal.phase === axis;
  }
  private sendingCapacity(link: RegionalLink) {
    let capacity = this.capacity(link);
    if (link.kind === "ramp" && nodeById.get(link.to)?.kind === "freeway") {
      const report = this.fresh(link.to);
      const next = (outgoing.get(link.to) ?? []).find(candidate => candidate.kind === "freeway");
      const observed = next ? report?.values.get(next.id) : undefined;
      if (next && observed !== undefined && observed > next.criticalOccupancy) {
        const room = (next.storage - observed) / (next.storage - next.criticalOccupancy);
        capacity *= Math.max(0.12, Math.min(1, room));
      }
    }
    return capacity;
  }
  private arrivals() {
    for (const source of REGIONAL_TOPOLOGY.sources) {
      const count = poisson(source.rate * this.demandFactor() * 2, this.demandRandom);
      this.generated += count; this.sourceGenerated.set(source.id, this.sourceGenerated.get(source.id)! + count);
      for (let i = 0; i < count; i++) {
        const sample = this.demandRandom();
        // Origin and destination draws depend only on demand seed, never control.
        const freewayProbability = source.id === "freeway-west" ? 0.6 : 0.15;
        const destination = sample < freewayProbability ? 5 : Math.min(4, Math.floor((sample - freewayProbability) / (1 - freewayProbability) * 5));
        this.destinationGenerated.get(source.id)![destination]!++;
        const variants = (this.config.routePattern === "lastRamp" ? concentratedRoutes : sourceRoutes).get(source.id)![destination]!;
        const route = variants[Math.min(variants.length - 1, Math.floor(this.demandRandom() * variants.length))]!;
        add(this.outside.get(source.id)!, route, 1);
      }
    }
  }
  private tick() {
    const unfinishedBefore = this.generated - this.completed;
    this.communicate(); this.control(); this.arrivals();
    const receiving = new Map<string, number>();
    for (const link of REGIONAL_TOPOLOGY.links) {
      const n = total(this.mass.get(link.id)!);
      const backwardTravel = (link.storage - link.criticalOccupancy) / link.capacity;
      receiving.set(link.id, Math.max(0, Math.min(this.capacity(link), (link.storage - n) / backwardTravel) * 2));
      this.flows.set(link.id, 0); this.inflows.set(link.id, 0);
    }
    const transfers: Transfer[] = [];
    const desired = new Map<string, number>();
    const propose = (transfer: Transfer) => {
      transfers.push(transfer);
      if (transfer.to) desired.set(transfer.to, (desired.get(transfer.to) ?? 0) + transfer.amount);
    };
    for (const link of REGIONAL_TOPOLOGY.links) {
      const contents = this.mass.get(link.id)!, n = total(contents);
      if (n < 1e-10 || !this.canSend(link)) continue;
      const send = Math.min(this.sendingCapacity(link), n / link.freeFlowSeconds) * 2;
      for (const [routeId, amount] of contents) {
        const route = routes[routeId]!, position = route.positions.get(link.id)!;
        propose({ from: link.id, to: route.links[position + 1] ?? null, route: routeId, amount: send * amount / n });
      }
    }
    for (const source of REGIONAL_TOPOLOGY.sources) {
      const held = this.outside.get(source.id)!, n = total(held);
      if (n < 1e-10) continue;
      const send = Math.min(n, linkById.get(source.linkId)!.capacity * 2);
      for (const [routeId, amount] of held) propose({ from: null, source: source.id, to: source.linkId, route: routeId, amount: send * amount / n });
    }
    for (const transfer of transfers) {
      const ratio = transfer.to ? Math.min(1, receiving.get(transfer.to)! / desired.get(transfer.to)!) : 1;
      const amount = transfer.amount * ratio;
      if (transfer.from) {
        add(this.mass.get(transfer.from)!, transfer.route, -amount);
        this.flows.set(transfer.from, this.flows.get(transfer.from)! + amount / 2);
      } else add(this.outside.get(transfer.source!)!, transfer.route, -amount);
      if (transfer.to) {
        add(this.mass.get(transfer.to)!, transfer.route, amount);
        this.inflows.set(transfer.to, this.inflows.get(transfer.to)! + amount / 2);
      } else this.completed += amount;
    }
    this.vehicleSeconds += (unfinishedBefore + this.generated - this.completed) / 2 * 2;
    this.time += 2;
    const values = this.queueValues(); this.maxQueue = Math.max(this.maxQueue, values.queue);
    if (this.time % 10 === 0) this.record();
  }
  private queueValues() {
    let cityQueue = 0, freewayQueue = 0, rampQueue = 0, spillbackLinks = 0, onNetwork = 0;
    for (const link of REGIONAL_TOPOLOGY.links) {
      const n = total(this.mass.get(link.id)!); onNetwork += n;
      const excess = Math.max(0, n - link.criticalOccupancy);
      if (link.kind === "freeway") freewayQueue += excess;
      else if (link.kind === "ramp") rampQueue += excess;
      else cityQueue += excess;
      if (n >= link.storage * 0.8) spillbackLinks++;
    }
    let waitingOutside = 0;
    for (const contents of this.outside.values()) waitingOutside += total(contents);
    return { cityQueue, freewayQueue, rampQueue, spillbackLinks, onNetwork, waitingOutside, queue: cityQueue + freewayQueue + rampQueue + waitingOutside };
  }
  private record() {
    const values = this.queueValues();
    this.series.push({ time: this.time, queue: values.queue, completed: this.completed, spillbackLinks: values.spillbackLinks, waitingOutside: values.waitingOutside });
  }
  snapshot(): RegionalSnapshot {
    const values = this.queueValues();
    const exitCapacity = terminals.reduce((sum, link) => sum + link.capacity, 0);
    const demandRate = REGIONAL_TOPOLOGY.sources.reduce((sum, source) => sum + source.rate, 0) * this.demandFactor();
    const active = this.isDisturbed();
    return {
      time: this.time, scenario: this.config.scenario, strategy: this.config.strategy,
      links: REGIONAL_TOPOLOGY.links.map(link => {
        const occupancy = total(this.mass.get(link.id)!);
        return { ...link, occupancy, queue: Math.max(0, occupancy - link.criticalOccupancy), flow: this.inflows.get(link.id) ?? 0,
          outflow: this.flows.get(link.id) ?? 0, congested: occupancy >= link.storage * 0.8, effectiveCapacity: this.capacity(link) };
      }),
      nodes: REGIONAL_TOPOLOGY.nodes.map(node => {
        const signal = this.signals.get(node.id);
        return { ...node, phase: signal?.clearance ? "clearance" : signal?.phase ?? "EW", connected: signal?.connected ?? this.freewayConnected.get(node.id) ?? false, fresh: !!this.fresh(node.id) };
      }),
      sources: REGIONAL_TOPOLOGY.sources.map(source => ({ ...source, waiting: total(this.outside.get(source.id)!), generated: this.sourceGenerated.get(source.id)!, effectiveRate: source.rate * this.demandFactor(),
        destinations: terminals.map((terminal, index) => ({ exit: terminal.to, generated: this.destinationGenerated.get(source.id)![index]! })) })),
      metrics: { generated: this.generated, completed: this.completed, ...values, totalVehicleSeconds: this.vehicleSeconds, maxQueue: this.maxQueue,
        exitThroughput: terminals.reduce((sum, link) => sum + (this.flows.get(link.id) ?? 0), 0),
        freshControllers: REGIONAL_TOPOLOGY.nodes.filter(node => !!this.fresh(node.id)).length,
        sentReports: this.sent, receivedReports: this.received, droppedReports: this.dropped },
      history: this.series.map(point => ({ ...point })),
      event: { active, start: 300, end: 540, label: this.config.scenario === "pulse" ? "One freeway exit drops from 1.7 to 0.25 vehicles/second for four minutes" : this.config.scenario === "steady" ? "Steady demand, no disruption" : "Sustained demand exceeds the eastern exit cut",
        normalExitCapacity: 1.7, activeExitCapacity: active ? 0.25 : 1.7 },
      bound: { demandRate, exitCapacity, minimumGrowthPerMinute: Math.max(0, demandRate - exitCapacity) * 60,
        unfinishedLowerBound: Math.max(0, this.generated - exitCapacity * this.time) },
    };
  }
}

export interface RegionalSeedResult {
  seed: number; local: RegionalSnapshot["metrics"]; shared: RegionalSnapshot["metrics"];
  vehicleSecondsChangePercent: number; completedChange: number;
}
export interface RegionalExperiment {
  config: Omit<RegionalConfig, "strategy" | "seed">;
  duration: number; seeds: number[]; results: RegionalSeedResult[];
  summary: { vehicleSecondsChangePercent: number; minimumPercent: number; maximumPercent: number;
    completedChange: number; localQueue: number; sharedQueue: number; localVehicleSeconds: number; sharedVehicleSeconds: number };
}
/** Paired independent seeds. Negative change = less total time unfinished. */
export function runExperiment(config: Omit<RegionalConfig, "strategy" | "seed">, duration = 1800, seeds: readonly number[] = [7, 19, 41]): RegionalExperiment {
  if (!seeds.length || !Number.isFinite(duration) || duration <= 0) throw new RangeError("A positive duration and at least one seed are required");
  const results = seeds.map(seed => {
    const local = new RegionalSimulation({ ...config, seed, strategy: "local" });
    const shared = new RegionalSimulation({ ...config, seed, strategy: "shared" });
    local.step(duration); shared.step(duration);
    const a = local.snapshot().metrics, b = shared.snapshot().metrics;
    return { seed, local: a, shared: b, vehicleSecondsChangePercent: a.totalVehicleSeconds ? (b.totalVehicleSeconds / a.totalVehicleSeconds - 1) * 100 : 0, completedChange: b.completed - a.completed };
  });
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return { config, duration, seeds: [...seeds], results,
    summary: { vehicleSecondsChangePercent: mean(results.map(result => result.vehicleSecondsChangePercent)), minimumPercent: Math.min(...results.map(result => result.vehicleSecondsChangePercent)), maximumPercent: Math.max(...results.map(result => result.vehicleSecondsChangePercent)),
      completedChange: mean(results.map(result => result.completedChange)), localQueue: mean(results.map(result => result.local.queue)), sharedQueue: mean(results.map(result => result.shared.queue)),
      localVehicleSeconds: mean(results.map(result => result.local.totalVehicleSeconds)), sharedVehicleSeconds: mean(results.map(result => result.shared.totalVehicleSeconds)) } };
}
