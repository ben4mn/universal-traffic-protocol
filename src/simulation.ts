/** A deterministic teaching model. All displayed outcomes come from vehicle motion. */
export type Scenario = "rush" | "school" | "incident";
export type SimulationMode = "isolated" | "connected";
export type SignalPhase = "NS" | "EW";

export interface SimulationConfig {
  mode: SimulationMode;
  adoption: number;
  demand: number;
  packetLoss: number;
  scenario: Scenario;
  seed: number;
}

export interface VehicleSnapshot {
  id: number;
  laneId: string;
  progress: number;
  x: number;
  y: number;
  heading: number;
  connected: boolean;
  speed: number;
  stopped: boolean;
  crossing: boolean;
}

export interface IntersectionSnapshot {
  id: string;
  x: number;
  y: number;
  connected: boolean;
  phase: SignalPhase;
  state: SignalPhase | "clearance";
  queue: number;
  receivedMessages: number;
  fresh: boolean;
  pedestrian: boolean;
}

export interface RoadSnapshot {
  id: string;
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  heading: number;
  length: number;
  occupancy: number;
  capacity: number;
  queue: number;
  disrupted: boolean;
}

export interface SimulationSnapshot {
  time: number;
  mode: SimulationMode;
  config: SimulationConfig;
  vehicles: VehicleSnapshot[];
  intersections: IntersectionSnapshot[];
  roads: RoadSnapshot[];
  metrics: {
    completed: number;
    generated: number;
    active: number;
    waitingOutside: number;
    meanTravelTime: number;
    meanDelay: number;
    p95TravelTime: number;
    queue: number;
    throughput: number;
    meanSpeed: number;
    totalDelay: number;
  };
  telemetry: {
    sent: number;
    received: number;
    dropped: number;
    offers: number;
    messages: number;
    connectedVehicles: number;
    connectedIntersections: number;
  };
}

export const WORLD_SIZE = 1000;
export const GRID_COORDS = [220, 500, 780] as const;
export const LANE_OFFSET = 8;
export const METERS_PER_UNIT = 100 / 280;
export const MODEL_CONSTANTS = Object.freeze({
  stepSeconds: 0.1,
  speedLimit: 11.1,
  vehicleLength: 4.5,
  minimumGap: 2.5,
  timeHeadway: 1.1,
  intersectionClearance: 0.95,
  allRedSeconds: 2,
  fixedGreenSeconds: 16,
  adaptiveMinimumGreen: 6,
  adaptiveMaximumGreen: 26,
  messageLifetime: 3,
});

type Node = {
  id: string;
  x: number;
  y: number;
  portal: boolean;
  incoming: Edge[];
  outgoing: Edge[];
};
type Edge = {
  id: string;
  from: Node;
  to: Node;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
  heading: number;
  axis: SignalPhase;
  vehicles: Vehicle[];
};
type Intersection = {
  node: Node;
  connected: boolean;
  phase: SignalPhase;
  greenSince: number;
  clearUntil: number;
  pendingPhase: SignalPhase;
  nextRelease: number;
  observedAt: number;
  pressureNS: number;
  pressureEW: number;
  receivedMessages: number;
  wasAdaptive: boolean;
  lastGreenPhase?: SignalPhase;
  lastGreenEndedAt?: number;
  wasGreen: boolean;
};
type Crossing = {
  start: number;
  end: number;
  x1: number;
  y1: number;
  h1: number;
};
type Vehicle = {
  id: number;
  connected: boolean;
  origin: string;
  destination: string;
  arrivedAt: number;
  enteredAt: number;
  freeflowTime: number;
  route: Edge[];
  routeIndex: number;
  edge: Edge;
  position: number;
  speed: number;
  stoppedSeconds: number;
  updatedTick: number;
  crossing?: Crossing;
};
type Arrival = { id: number; origin: Node; destination: Node; time: number };
type Source = {
  node: Node;
  rng: () => number;
  next: number;
  pending: Arrival[];
  rate: number;
};
type Completion = { time: number; travelTime: number; delay: number };
type RoadObservation = { time: number; occupancy: number; disrupted: boolean };

const DEFAULT_CONFIG: SimulationConfig = {
  mode: "isolated",
  adoption: 0.75,
  demand: 1,
  packetLoss: 0.05,
  scenario: "rush",
  seed: 73,
};
const C = MODEL_CONSTANTS;
const SEPARATION = C.vehicleLength + C.minimumGap;
const INSET = 14;

function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

function hash(value: string, seed = 0) {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The two modes must use the same seed, demand and scenario for paired comparisons. */
export class TrafficSimulation {
  private config!: SimulationConfig;
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private intersections: Intersection[] = [];
  private intersectionById = new Map<string, Intersection>();
  private sources: Source[] = [];
  private vehicles = new Map<number, Vehicle>();
  private completions: Completion[] = [];
  private observations = new Map<string, RoadObservation>();
  private tick = 0;
  private accumulator = 0;
  private nextId = 1;
  private generated = 0;
  private sent = 0;
  private received = 0;
  private dropped = 0;
  private offers = 0;
  private liveMessages = 0;

  constructor(config: Partial<SimulationConfig> = {}) {
    this.reset(config);
  }

  reset(config: Partial<SimulationConfig> = {}) {
    const merged = { ...DEFAULT_CONFIG, ...this.config, ...config };
    this.config = {
      ...merged,
      adoption: clamp(merged.adoption, 0, 1),
      demand: clamp(merged.demand, 0.1, 2),
      packetLoss: clamp(merged.packetLoss, 0, 1),
      seed: Number.isFinite(merged.seed)
        ? merged.seed >>> 0
        : DEFAULT_CONFIG.seed,
    };
    this.tick = 0;
    this.accumulator = 0;
    this.nextId = 1;
    this.generated = 0;
    this.sent =
      this.received =
      this.dropped =
      this.offers =
      this.liveMessages =
        0;
    this.vehicles.clear();
    this.completions = [];
    this.observations.clear();
    this.buildGraph();
    this.createSources();
    this.updateSignals();
  }

  /** Integrates at 100 ms regardless of rendering frame rate. */
  step(dtSeconds: number) {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
    this.accumulator += dtSeconds;
    while (this.accumulator + 1e-9 >= C.stepSeconds) {
      this.accumulator -= C.stepSeconds;
      this.tick++;
      this.generateArrivals();
      if (this.tick % 10 === 0) this.communicate();
      this.updateSignals();
      this.moveVehicles();
      this.admitVehicles();
    }
  }

  private get time() {
    return this.tick * C.stepSeconds;
  }

  private buildGraph() {
    this.nodes = [];
    this.edges = [];
    this.intersections = [];
    this.intersectionById.clear();
    const addNode = (id: string, x: number, y: number, portal = false) => {
      const node: Node = { id, x, y, portal, incoming: [], outgoing: [] };
      this.nodes.push(node);
      return node;
    };
    const grid = GRID_COORDS.map((y, row) =>
      GRID_COORDS.map((x, col) => addNode(`i${row}${col}`, x, y)),
    );
    const addEdge = (from: Node, to: Node) => {
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const dx = Math.cos(angle),
        dy = Math.sin(angle);
      const insetFrom = from.portal ? 0 : INSET;
      const insetTo = to.portal ? 0 : INSET;
      // Right-hand traffic: the right side of a heading is (-dy, dx) in screen coordinates.
      const x1 = from.x + dx * insetFrom - dy * LANE_OFFSET;
      const y1 = from.y + dy * insetFrom + dx * LANE_OFFSET;
      const x2 = to.x - dx * insetTo - dy * LANE_OFFSET;
      const y2 = to.y - dy * insetTo + dx * LANE_OFFSET;
      const edge: Edge = {
        id: `${from.id}>${to.id}`,
        from,
        to,
        x1,
        y1,
        x2,
        y2,
        length: Math.hypot(x2 - x1, y2 - y1) * METERS_PER_UNIT,
        heading: angle,
        axis: Math.abs(dx) > 0.5 ? "EW" : "NS",
        vehicles: [],
      };
      this.edges.push(edge);
      from.outgoing.push(edge);
      to.incoming.push(edge);
    };
    const join = (a: Node, b: Node) => {
      addEdge(a, b);
      addEdge(b, a);
    };
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (col < 2) join(grid[row][col], grid[row][col + 1]);
        if (row < 2) join(grid[row][col], grid[row + 1][col]);
      }
      join(addNode(`w${row}`, 0, GRID_COORDS[row], true), grid[row][0]);
      join(
        grid[row][2],
        addNode(`e${row}`, WORLD_SIZE, GRID_COORDS[row], true),
      );
      join(addNode(`n${row}`, GRID_COORDS[row], 0, true), grid[0][row]);
      join(
        grid[2][row],
        addNode(`s${row}`, GRID_COORDS[row], WORLD_SIZE, true),
      );
    }
    for (const node of this.nodes.filter((n) => !n.portal)) {
      const intersection: Intersection = {
        node,
        connected:
          this.config.mode === "connected" &&
          hash(`infrastructure:${node.id}`, this.config.seed) <
            this.config.adoption,
        phase: "NS",
        greenSince: 0,
        clearUntil: 0,
        pendingPhase: "NS",
        nextRelease: 0,
        observedAt: -Infinity,
        pressureNS: 0,
        pressureEW: 0,
        receivedMessages: 0,
        wasAdaptive: false,
        wasGreen: false,
      };
      this.intersections.push(intersection);
      this.intersectionById.set(node.id, intersection);
    }
  }

  private createSources() {
    this.sources = this.nodes
      .filter((n) => n.portal)
      .map((node) => {
        const rng = random(
          Math.floor(hash(`source:${node.id}`, this.config.seed) * 4294967296),
        );
        const horizontal = node.id.startsWith("w") || node.id.startsWith("e");
        let rate = horizontal ? 0.21 : 0.09;
        if (this.config.scenario === "school")
          rate = node.id === "n1" || node.id === "s1" ? 0.22 : 0.12;
        rate *= this.config.demand;
        return {
          node,
          rng,
          next: -Math.log(Math.max(1e-9, rng())) / rate,
          pending: [],
          rate,
        };
      });
  }

  private chooseDestination(source: Source) {
    const origin = source.node.id;
    const opposite: Record<string, string> = { w: "e", e: "w", n: "s", s: "n" };
    const draw = source.rng();
    let destination: string;
    if (this.config.scenario === "school" && draw < 0.36 && origin !== "n1") {
      destination = "n1";
    } else if (draw < 0.68) {
      destination = opposite[origin[0]] + origin[1];
    } else if (draw < 0.9) {
      destination = opposite[origin[0]] + Math.floor(source.rng() * 3);
    } else {
      const perpendicular =
        origin[0] === "w" || origin[0] === "e" ? ["n", "s"] : ["w", "e"];
      destination =
        perpendicular[Math.floor(source.rng() * 2)] +
        Math.floor(source.rng() * 3);
    }
    return this.nodes.find((n) => n.id === destination)!;
  }

  private generateArrivals() {
    for (const source of this.sources) {
      while (source.next <= this.time) {
        source.pending.push({
          id: this.nextId++,
          origin: source.node,
          destination: this.chooseDestination(source),
          time: source.next,
        });
        this.generated++;
        source.next += -Math.log(Math.max(1e-9, source.rng())) / source.rate;
      }
    }
  }

  private admitVehicles() {
    for (const source of this.sources) {
      const arrival = source.pending[0];
      if (!arrival) continue;
      const edge = source.node.outgoing[0];
      if (!this.hasRoom(edge)) continue;
      const connected =
        this.config.mode === "connected" &&
        hash(`vehicle:${arrival.id}`, this.config.seed) < this.config.adoption;
      const route = this.route(
        arrival.origin,
        arrival.destination,
        connected,
        arrival.id,
      );
      if (!route.length)
        throw new Error("Every arrival must have a connected route.");
      const vehicle: Vehicle = {
        id: arrival.id,
        connected,
        origin: arrival.origin.id,
        destination: arrival.destination.id,
        arrivedAt: arrival.time,
        enteredAt: this.time,
        // Compare every traveler with their same shortest uncongested trip, including detour cost.
        freeflowTime: this.freeflowTime(
          arrival.origin,
          arrival.destination,
          arrival.id,
        ),
        route,
        routeIndex: 0,
        edge: route[0],
        position: 0,
        speed: C.speedLimit,
        stoppedSeconds: 0,
        updatedTick: this.tick,
      };
      source.pending.shift();
      this.vehicles.set(vehicle.id, vehicle);
      edge.vehicles.push(vehicle);
    }
  }

  private freeflowTime(origin: Node, destination: Node, id: number) {
    const reference = this.route(origin, destination, false, id);
    return (
      reference.reduce((sum, e) => sum + e.length / C.speedLimit, 0) +
      (reference.length - 1) * C.intersectionClearance
    );
  }

  private route(
    origin: Node,
    destination: Node,
    connected: boolean,
    id: number,
  ) {
    const costs = new Map<Node, number>([[origin, 0]]);
    const previous = new Map<Node, Edge>();
    const remaining = new Set(this.nodes);
    while (remaining.size) {
      let current: Node | undefined;
      let smallest = Infinity;
      for (const node of remaining) {
        const cost = costs.get(node) ?? Infinity;
        if (cost < smallest) {
          smallest = cost;
          current = node;
        }
      }
      if (!current || current === destination) break;
      remaining.delete(current);
      for (const edge of current.outgoing) {
        if (edge.to.portal && edge.to !== destination) continue;
        let edgeCost =
          edge.length / C.speedLimit +
          (edge.to.portal ? 0 : C.intersectionClearance);
        const observation = this.observations.get(edge.id);
        if (
          connected &&
          observation &&
          this.time - observation.time <= C.messageLifetime
        ) {
          // Guidance is advisory: it changes only route cost, never the physical admission gate.
          edgeCost += observation.occupancy * 1.3;
          if (observation.disrupted) edgeCost += 55;
        }
        edgeCost += hash(`route:${id}:${edge.id}`, this.config.seed) * 0.001;
        const next = smallest + edgeCost;
        if (next < (costs.get(edge.to) ?? Infinity)) {
          costs.set(edge.to, next);
          previous.set(edge.to, edge);
        }
      }
    }
    const path: Edge[] = [];
    let cursor = destination;
    while (cursor !== origin) {
      const edge = previous.get(cursor);
      if (!edge) return [];
      path.unshift(edge);
      cursor = edge.from;
    }
    return path;
  }

  private pressure(intersection: Intersection, axis: SignalPhase) {
    let incoming = 0,
      downstream = 0;
    for (const edge of intersection.node.incoming.filter(
      (e) => e.axis === axis,
    )) {
      incoming += edge.vehicles.reduce(
        (sum, v) => sum + (v.position > edge.length - 50 ? 1 : 0.3),
        0,
      );
    }
    for (const edge of intersection.node.outgoing.filter(
      (e) => e.axis === axis,
    ))
      downstream += edge.vehicles.length;
    return Math.max(0, incoming - 0.35 * downstream);
  }

  private communicate() {
    this.liveMessages = 0;
    if (this.config.mode !== "connected") return;
    for (const intersection of this.intersections) {
      if (!intersection.connected) continue;
      // One detector observation per second, plus nearby connected vehicle observations.
      const vehicles = intersection.node.incoming.flatMap((edge) =>
        edge.vehicles
          .filter((v) => v.connected)
          .map((vehicle) => ({ edge, vehicle })),
      );
      const attempts = 1 + vehicles.length;
      let delivered = 0;
      let detectorDelivered = false;
      let estimatedNS = 0,
        estimatedEW = 0;
      const laneReports = new Map<Edge, number>();
      for (let i = 0; i < attempts; i++) {
        this.sent++;
        if (
          hash(
            `packet:${this.tick}:${intersection.node.id}:${i}`,
            this.config.seed,
          ) >= this.config.packetLoss
        ) {
          this.received++;
          this.liveMessages++;
          delivered++;
          if (i === 0) detectorDelivered = true;
          else {
            const { edge, vehicle } = vehicles[i - 1];
            const weight =
              (vehicle.position > edge.length - 50 ? 1 : 0.3) /
              this.config.adoption;
            if (edge.axis === "NS") estimatedNS += weight;
            else estimatedEW += weight;
            laneReports.set(
              edge,
              (laneReports.get(edge) ?? 0) + 1 / this.config.adoption,
            );
          }
        } else this.dropped++;
      }
      if (delivered) {
        intersection.observedAt = this.time;
        // A received detector snapshot has full coverage. Beacon-only fallback is a
        // penetration-normalized sample, so dropped messages also introduce estimate error.
        intersection.pressureNS = detectorDelivered
          ? this.pressure(intersection, "NS")
          : estimatedNS;
        intersection.pressureEW = detectorDelivered
          ? this.pressure(intersection, "EW")
          : estimatedEW;
        intersection.receivedMessages += delivered;
        if (detectorDelivered) {
          for (const edge of [
            ...intersection.node.incoming,
            ...intersection.node.outgoing,
          ]) {
            this.observations.set(edge.id, {
              time: this.time,
              occupancy: edge.vehicles.length,
              disrupted: this.isDisrupted(edge),
            });
          }
        } else {
          for (const [edge, occupancy] of laneReports) {
            this.observations.set(edge.id, {
              time: this.time,
              occupancy,
              disrupted: this.isDisrupted(edge),
            });
          }
        }
      }
    }
  }

  private fixedState(intersection: Intersection): {
    phase: SignalPhase;
    clear: boolean;
  } {
    const row = Number(intersection.node.id[1]),
      col = Number(intersection.node.id[2]);
    const offset = (row + col) * 4;
    const cycle = (this.time + offset) % 36;
    return {
      phase: cycle < 18 ? "NS" : "EW",
      clear: (cycle >= 16 && cycle < 18) || cycle >= 34,
    };
  }

  private updateSignals() {
    for (const intersection of this.intersections) {
      this.updateSignal(intersection);
      this.protectSignalClearance(intersection);
    }
  }

  private updateSignal(intersection: Intersection) {
    const fresh =
      intersection.connected &&
      this.time - intersection.observedAt <= C.messageLifetime;
    if (!fresh) {
      const fixed = this.fixedState(intersection);
      if (intersection.wasAdaptive && intersection.phase !== fixed.phase) {
        intersection.clearUntil = this.time + C.allRedSeconds;
        intersection.pendingPhase = fixed.phase;
      }
      intersection.wasAdaptive = false;
      if (intersection.clearUntil > this.time && !fixed.clear) return;
      intersection.phase = fixed.phase;
      intersection.pendingPhase = fixed.phase;
      intersection.clearUntil = fixed.clear ? this.time + C.stepSeconds : 0;
      intersection.greenSince = this.time;
      return;
    }
    if (!intersection.wasAdaptive) {
      intersection.wasAdaptive = true;
      intersection.greenSince = this.time;
    }
    if (intersection.clearUntil > this.time) return;
    if (intersection.phase !== intersection.pendingPhase) {
      intersection.phase = intersection.pendingPhase;
      intersection.greenSince = this.time;
    }
    const greenAge = this.time - intersection.greenSince;
    const current =
      intersection.phase === "NS"
        ? intersection.pressureNS
        : intersection.pressureEW;
    const opposite =
      intersection.phase === "NS"
        ? intersection.pressureEW
        : intersection.pressureNS;
    const mustServe = greenAge >= C.adaptiveMaximumGreen && opposite > 0;
    const pressureSwitch =
      greenAge >= C.adaptiveMinimumGreen && opposite > current + 1;
    if (mustServe || pressureSwitch) {
      intersection.pendingPhase = intersection.phase === "NS" ? "EW" : "NS";
      intersection.clearUntil = this.time + C.allRedSeconds;
      this.offers++;
    }
  }

  /** Safety depends on the actual previous green, not the clock program's assumed history. */
  private protectSignalClearance(intersection: Intersection) {
    if (intersection.clearUntil > this.time) {
      if (intersection.wasGreen) intersection.lastGreenEndedAt = this.time;
      intersection.wasGreen = false;
      return;
    }
    const changingPhase =
      intersection.lastGreenPhase !== undefined &&
      intersection.lastGreenPhase !== intersection.phase;
    if (changingPhase) {
      if (intersection.wasGreen) intersection.lastGreenEndedAt = this.time;
      const safeAt =
        (intersection.lastGreenEndedAt ?? this.time) + C.allRedSeconds;
      if (this.time + 1e-9 < safeAt) {
        intersection.clearUntil = safeAt;
        intersection.wasGreen = false;
        return;
      }
    }
    intersection.lastGreenPhase = intersection.phase;
    intersection.wasGreen = true;
  }

  private isPedestrianCrossing(intersection: Intersection) {
    return this.isPedestrianCrossingAt(intersection, this.time);
  }

  private isPedestrianCrossingAt(intersection: Intersection, time: number) {
    return (
      this.config.scenario === "school" &&
      intersection.node.id === "i01" &&
      time >= 24 &&
      time % 42 < 9
    );
  }

  private isDisrupted(edge: Edge) {
    return (
      this.config.scenario === "incident" &&
      this.time >= 45 &&
      edge.id === "i11>i12"
    );
  }

  private hasRoom(edge: Edge) {
    return !edge.vehicles.some((v) => v.position < SEPARATION);
  }

  private canRelease(vehicle: Vehicle) {
    const edge = vehicle.edge;
    if (edge.to.portal) return true;
    const intersection = this.intersectionById.get(edge.to.id)!;
    if (
      intersection.clearUntil > this.time ||
      intersection.phase !== edge.axis ||
      this.isPedestrianCrossing(intersection) ||
      this.isPedestrianCrossingAt(
        intersection,
        this.time + C.intersectionClearance,
      )
    )
      return false;
    if (intersection.nextRelease > this.time) return false;
    const next = vehicle.route[vehicle.routeIndex + 1];
    return Boolean(next && this.hasRoom(next));
  }

  private moveVehicles() {
    for (const edge of this.edges) {
      edge.vehicles.sort((a, b) => b.position - a.position || a.id - b.id);
      let leader: Vehicle | undefined;
      for (const vehicle of [...edge.vehicles]) {
        if (vehicle.updatedTick === this.tick) {
          leader = vehicle;
          continue;
        }
        vehicle.updatedTick = this.tick;
        if (vehicle.crossing && vehicle.crossing.end > this.time) {
          leader = vehicle;
          continue;
        }
        vehicle.crossing = undefined;
        const gap = leader
          ? Math.max(0, leader.position - SEPARATION - vehicle.position)
          : edge.length - vehicle.position;
        const release = !leader && this.canRelease(vehicle);
        const stoppingGap = gap + (release ? 8 : 0);
        const speedLimit = this.isDisrupted(edge) ? 2.8 : C.speedLimit;
        const headwaySpeed = leader ? gap / C.timeHeadway : speedLimit;
        const desired = Math.min(
          speedLimit,
          headwaySpeed,
          Math.sqrt(2 * 4 * stoppingGap),
        );
        vehicle.speed = Math.max(
          0,
          Math.min(desired, vehicle.speed + 2.4 * C.stepSeconds),
        );
        const movement = Math.min(gap, vehicle.speed * C.stepSeconds);
        vehicle.position = Math.min(edge.length, vehicle.position + movement);
        if (vehicle.speed < 0.5) vehicle.stoppedSeconds += C.stepSeconds;
        if (vehicle.position >= edge.length - 1e-6 && release) {
          edge.vehicles.splice(edge.vehicles.indexOf(vehicle), 1);
          if (edge.to.portal) {
            const travelTime = this.time - vehicle.arrivedAt;
            this.completions.push({
              time: this.time,
              travelTime,
              delay: Math.max(0, travelTime - vehicle.freeflowTime),
            });
            this.vehicles.delete(vehicle.id);
          } else {
            const intersection = this.intersectionById.get(edge.to.id)!;
            intersection.nextRelease =
              this.time +
              (this.isDisrupted(vehicle.route[vehicle.routeIndex + 1])
                ? 3.4
                : C.intersectionClearance);
            vehicle.routeIndex++;
            vehicle.edge = vehicle.route[vehicle.routeIndex];
            vehicle.position = 0;
            vehicle.crossing = {
              start: this.time,
              end: this.time + C.intersectionClearance,
              x1: edge.x2,
              y1: edge.y2,
              h1: edge.heading,
            };
            vehicle.edge.vehicles.push(vehicle);
          }
          // A transferred vehicle no longer constrains followers on its old road.
        } else leader = vehicle;
      }
    }
  }

  getSnapshot(): SimulationSnapshot {
    const vehicleList = [...this.vehicles.values()];
    const waitingOutside = this.sources.reduce(
      (sum, source) => sum + source.pending.length,
      0,
    );
    const queue =
      vehicleList.filter((v) => v.speed < 0.5 && !v.crossing).length +
      waitingOutside;
    const completed = this.completions.length;
    const travelTimes = this.completions
      .map((v) => v.travelTime)
      .sort((a, b) => a - b);
    const totalCompletedDelay = this.completions.reduce(
      (sum, v) => sum + v.delay,
      0,
    );
    const liveDelay =
      vehicleList.reduce((sum, v) => {
        const distance =
          v.route
            .slice(0, v.routeIndex)
            .reduce((partial, e) => partial + e.length, 0) + v.position;
        const crossingTime = v.crossing
          ? Math.max(0, v.routeIndex - 1) * C.intersectionClearance +
            Math.min(C.intersectionClearance, this.time - v.crossing.start)
          : v.routeIndex * C.intersectionClearance;
        return (
          sum +
          Math.max(
            0,
            this.time - v.arrivedAt - distance / C.speedLimit - crossingTime,
          )
        );
      }, 0) +
      this.sources.reduce(
        (sum, s) =>
          sum +
          s.pending.reduce((partial, v) => partial + this.time - v.time, 0),
        0,
      );
    return {
      time: this.time,
      mode: this.config.mode,
      config: { ...this.config },
      vehicles: vehicleList.map((vehicle) => {
        const edge = vehicle.edge;
        const progress = vehicle.position / edge.length;
        let x = edge.x1 + (edge.x2 - edge.x1) * progress;
        let y = edge.y1 + (edge.y2 - edge.y1) * progress;
        let heading = edge.heading;
        if (vehicle.crossing) {
          const fraction = clamp(
            (this.time - vehicle.crossing.start) / C.intersectionClearance,
            0,
            1,
          );
          x = vehicle.crossing.x1 + (edge.x1 - vehicle.crossing.x1) * fraction;
          y = vehicle.crossing.y1 + (edge.y1 - vehicle.crossing.y1) * fraction;
          const turn = Math.atan2(
            Math.sin(edge.heading - vehicle.crossing.h1),
            Math.cos(edge.heading - vehicle.crossing.h1),
          );
          heading = vehicle.crossing.h1 + turn * fraction;
        }
        return {
          id: vehicle.id,
          laneId: edge.id,
          progress: vehicle.position,
          x,
          y,
          heading,
          connected: vehicle.connected,
          speed: vehicle.speed,
          stopped: vehicle.speed < 0.5 && !vehicle.crossing,
          crossing: Boolean(
            vehicle.crossing && vehicle.crossing.end > this.time,
          ),
        };
      }),
      intersections: this.intersections.map((i) => ({
        id: i.node.id,
        x: i.node.x,
        y: i.node.y,
        connected: i.connected,
        phase: i.phase,
        state: i.clearUntil > this.time ? "clearance" : i.phase,
        queue: i.node.incoming.reduce(
          (sum, e) => sum + e.vehicles.filter((v) => v.speed < 0.5).length,
          0,
        ),
        receivedMessages: i.receivedMessages,
        fresh: i.connected && this.time - i.observedAt <= C.messageLifetime,
        pedestrian: this.isPedestrianCrossing(i),
      })),
      roads: this.edges.map((e) => ({
        id: e.id,
        from: e.from.id,
        to: e.to.id,
        x1: e.x1,
        y1: e.y1,
        x2: e.x2,
        y2: e.y2,
        heading: e.heading,
        length: e.length,
        occupancy: e.vehicles.length,
        capacity: Math.floor(e.length / SEPARATION) + 1,
        queue: e.vehicles.filter((v) => v.speed < 0.5).length,
        disrupted: this.isDisrupted(e),
      })),
      metrics: {
        completed,
        generated: this.generated,
        active: vehicleList.length,
        waitingOutside,
        meanTravelTime: completed
          ? this.completions.reduce((sum, v) => sum + v.travelTime, 0) /
            completed
          : 0,
        meanDelay: completed ? totalCompletedDelay / completed : 0,
        p95TravelTime: completed
          ? travelTimes[
              Math.min(completed - 1, Math.ceil(completed * 0.95) - 1)
            ]
          : 0,
        queue,
        throughput:
          this.completions.filter((v) => v.time > this.time - 60).length *
          (60 / Math.min(60, Math.max(1, this.time))),
        meanSpeed: vehicleList.length
          ? vehicleList.reduce((sum, v) => sum + v.speed, 0) /
            vehicleList.length
          : 0,
        totalDelay: totalCompletedDelay + liveDelay,
      },
      telemetry: {
        sent: this.sent,
        received: this.received,
        dropped: this.dropped,
        offers: this.offers,
        messages: this.liveMessages,
        connectedVehicles: vehicleList.filter((v) => v.connected).length,
        connectedIntersections: this.intersections.filter((i) => i.connected)
          .length,
      },
    };
  }

  snapshot() {
    return this.getSnapshot();
  }
}
