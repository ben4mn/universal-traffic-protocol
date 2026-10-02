/**
 * An offline, closed-laboratory trajectory reservation experiment. All cars
 * make a full one-second stop when they reach the front of their lane queue.
 * Their acceleration-limited paths are known in advance: straight movements
 * are capped at 6 m/s, curved movements at 3 m/s to keep cornering moderate.
 * A completed request
 * and acknowledgement permits overlapping buffered-compatible trajectories;
 * an unequipped car or failed transaction receives exclusive service.
 *
 * Collision checks use oriented 4.5 × 1.9 m bodies, the selected buffer on
 * every edge, plus a 0.25 m numerical margin, sampled every 0.025 seconds.
 * That reservation buffer applies to MOVING planned trajectories. Stationary
 * queue fronts hold beyond the central conflict area; adjacent opposing
 * lanes have 3.6 m centre spacing, so a large selected trajectory buffer is
 * not a promised clearance envelope around parked queue vehicles.
 * This discretized scheduling experiment is not a certified safety system,
 * legal right-of-way, or authority granted by the current UTP draft. Approach
 * queuing is modeled by lane-front service times, not car-following physics.
 */
export type JunctionPattern = "compatible" | "crossing" | "mixed";
export type JunctionMode = "sequential" | "reserved";
export type JunctionApproach = "N" | "E" | "S" | "W";
export type JunctionTurn = "right" | "straight" | "left";
export interface JunctionConfig {
  pattern: JunctionPattern; mode: JunctionMode;
  adoption: number; packetLoss: number; bufferMetres: number; pedestrians: boolean;
}
export interface JunctionPathPoint { x: number; y: number; heading: number; distance: number; }
export interface JunctionVehicle {
  id: number; approach: JunctionApproach; turn: JunctionTurn;
  arrival: number; stoppedAt: number; entry: number; exit: number;
  path: JunctionPathPoint[]; canReserve: boolean; travelSeconds: number; clearsStopLine: number; maximumSpeed: number;
}
export interface JunctionPlan {
  config: JunctionConfig; vehicles: JunctionVehicle[]; duration: number;
  metrics: { meanWait: number; totalWait: number; completed: number; maxConcurrent: number };
  sampleSeconds: number; numericalMarginMetres: number;
}
export const JUNCTION_CONSTANTS = Object.freeze({
  vehicleLength: 4.5, vehicleWidth: 1.9, maximumSpeed: 6, turnMaximumSpeed: 3, acceleration: 2,
  fullStopSeconds: 1, sampleSeconds: 0.025, schedulingSeconds: 0.05,
  numericalMarginMetres: 0.25, pedestrianStart: 12, pedestrianEnd: 19,
  pedestrianPeriod: 30, stopLineMetres: 14,
});
const APPROACHES: JunctionApproach[] = ["N", "E", "S", "W"];
type Point = { x: number; y: number };

function makePath(approach: JunctionApproach, turn: JunctionTurn): JunctionPathPoint[] {
  const points: Point[] = [{ x: -1.8, y: -14 }];
  const line = (a: Point, b: Point) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.05);
    for (let i = 1; i <= steps; i++) points.push({ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps });
  };
  if (turn === "straight") line(points[0]!, { x: -1.8, y: 14 });
  else {
    const start = { x: -1.8, y: -8 };
    const control = { x: -1.8, y: turn === "right" ? -1.8 : 1.8 };
    const end = { x: turn === "right" ? -8 : 8, y: control.y };
    line(points[0]!, start);
    for (let i = 1; i <= 250; i++) {
      const t = i / 250, q = 1 - t;
      points.push({ x: q * q * start.x + 2 * q * t * control.x + t * t * end.x,
        y: q * q * start.y + 2 * q * t * control.y + t * t * end.y });
    }
    line(end, { x: turn === "right" ? -14 : 14, y: control.y });
  }
  const angle = APPROACHES.indexOf(approach) * Math.PI / 2;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rotated = points.map(point => ({ x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos }));
  let distance = 0;
  return rotated.map((point, index) => {
    if (index) distance += Math.hypot(point.x - rotated[index - 1]!.x, point.y - rotated[index - 1]!.y);
    const next = rotated[Math.min(index + 1, rotated.length - 1)]!, previous = rotated[Math.max(0, index - 1)]!;
    return { ...point, distance, heading: Math.atan2(next.y - previous.y, next.x - previous.x) };
  });
}
function travelTime(distance: number, maximumSpeed: number) {
  const accelTime = maximumSpeed / JUNCTION_CONSTANTS.acceleration;
  const accelDistance = JUNCTION_CONSTANTS.acceleration * accelTime * accelTime / 2;
  return distance <= accelDistance ? Math.sqrt(2 * distance / JUNCTION_CONSTANTS.acceleration)
    : accelTime + (distance - accelDistance) / maximumSpeed;
}
function distanceAt(seconds: number, maximumSpeed: number) {
  const t = Math.max(0, seconds), accelTime = maximumSpeed / JUNCTION_CONSTANTS.acceleration;
  return t <= accelTime ? JUNCTION_CONSTANTS.acceleration * t * t / 2
    : JUNCTION_CONSTANTS.acceleration * accelTime * accelTime / 2 + (t - accelTime) * maximumSpeed;
}
/** Pose headings are radians in the page's x-right, y-down coordinate system. */
export function junctionPoseAt(vehicle: JunctionVehicle, time: number): JunctionPathPoint {
  const distance = Math.min(vehicle.path.at(-1)!.distance, distanceAt(time - vehicle.entry, vehicle.maximumSpeed));
  let low = 0, high = vehicle.path.length - 1;
  while (low + 1 < high) { const middle = (low + high) >> 1; if (vehicle.path[middle]!.distance < distance) low = middle; else high = middle; }
  const a = vehicle.path[low]!, b = vehicle.path[high]!;
  const ratio = b.distance > a.distance ? (distance - a.distance) / (b.distance - a.distance) : 0;
  let headingDelta = b.heading - a.heading;
  while (headingDelta > Math.PI) headingDelta -= 2 * Math.PI;
  while (headingDelta < -Math.PI) headingDelta += 2 * Math.PI;
  return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio, heading: a.heading + headingDelta * ratio, distance };
}
function rectanglesOverlap(a: JunctionPathPoint, b: JunctionPathPoint, buffer: number) {
  const padding = buffer + JUNCTION_CONSTANTS.numericalMarginMetres;
  const halfLength = JUNCTION_CONSTANTS.vehicleLength / 2 + padding;
  const halfWidth = JUNCTION_CONSTANTS.vehicleWidth / 2 + padding;
  const ax = { x: Math.cos(a.heading), y: Math.sin(a.heading) }, ay = { x: -ax.y, y: ax.x };
  const bx = { x: Math.cos(b.heading), y: Math.sin(b.heading) }, by = { x: -bx.y, y: bx.x };
  const delta = { x: b.x - a.x, y: b.y - a.y };
  const dot = (u: Point, v: Point) => u.x * v.x + u.y * v.y;
  for (const axis of [ax, ay, bx, by]) {
    const aRadius = halfLength * Math.abs(dot(ax, axis)) + halfWidth * Math.abs(dot(ay, axis));
    const bRadius = halfLength * Math.abs(dot(bx, axis)) + halfWidth * Math.abs(dot(by, axis));
    if (Math.abs(dot(delta, axis)) > aRadius + bRadius + 1e-9) return false;
  }
  return true;
}
function trajectoriesConflict(a: JunctionVehicle, b: JunctionVehicle, buffer: number) {
  const start = Math.max(a.entry, b.entry), end = Math.min(a.exit, b.exit);
  if (start >= end - 1e-9) return false;
  if (!a.canReserve || !b.canReserve) return true;
  for (let time = start; time < end; time += JUNCTION_CONSTANTS.sampleSeconds) {
    if (rectanglesOverlap(junctionPoseAt(a, time), junctionPoseAt(b, time), buffer)) return true;
  }
  return rectanglesOverlap(junctionPoseAt(a, end), junctionPoseAt(b, end), buffer);
}
function pedestrianWindow(time: number) {
  const cycle = Math.floor(time / JUNCTION_CONSTANTS.pedestrianPeriod);
  return { start: cycle * 30 + 12, end: cycle * 30 + 19 };
}
function overlapsPedestrian(entry: number, exit: number) {
  for (let cycle = Math.max(0, Math.floor(entry / 30)); cycle <= Math.floor(exit / 30); cycle++) {
    const start = cycle * 30 + 12, end = cycle * 30 + 19;
    if (entry < end - 1e-9 && exit > start + 1e-9) return end;
  }
  return null;
}
const roundUp = (seconds: number) => Math.ceil((seconds - 1e-9) / JUNCTION_CONSTANTS.schedulingSeconds) * JUNCTION_CONSTANTS.schedulingSeconds;
function hashSample(id: number, salt: number) {
  let value = Math.imul(id + 1, 0x45d9f3b) ^ salt;
  value = Math.imul(value ^ value >>> 16, 0x45d9f3b);
  return ((value ^ value >>> 16) >>> 0) / 4294967296;
}
export function planJunction(config: JunctionConfig): JunctionPlan {
  if (!["compatible", "crossing", "mixed"].includes(config.pattern) || !["sequential", "reserved"].includes(config.mode)) throw new RangeError("Unknown junction experiment");
  if (!Number.isFinite(config.adoption) || config.adoption < 0 || config.adoption > 1 || !Number.isFinite(config.packetLoss) || config.packetLoss < 0 || config.packetLoss > 1) throw new RangeError("Adoption and packet loss must be between zero and one");
  if (!Number.isFinite(config.bufferMetres) || config.bufferMetres < 0.25 || config.bufferMetres > 1.2) throw new RangeError("Buffer must be between 0.25 and 1.2 metres");
  const vehicles: JunctionVehicle[] = [], frontClear = new Map<JunctionApproach, number>();
  for (let id = 0; id < 24; id++) {
    const approach = APPROACHES[id % 4]!;
    const turn: JunctionTurn = config.pattern === "compatible" ? "right" : config.pattern === "crossing" ? "straight" : (["right", "straight", "left", "straight"] as const)[Math.floor(id / 4) % 4]!;
    const arrival = id < 3 ? 0 : 4 + (id - 3) * 0.9;
    const stoppedAt = Math.max(arrival, frontClear.get(approach) ?? 0);
    const path = makePath(approach, turn);
    const maximumSpeed = turn === "straight" ? JUNCTION_CONSTANTS.maximumSpeed : JUNCTION_CONSTANTS.turnMaximumSpeed;
    const travelSeconds = travelTime(path.at(-1)!.distance, maximumSpeed);
    const request = hashSample(id, 0x93bc1286) >= config.packetLoss;
    const acknowledgement = hashSample(id, 0x27ab5973) >= config.packetLoss;
    const canReserve = config.mode === "reserved" && hashSample(id, 0xb82a1c75) < config.adoption && request && acknowledgement;
    const vehicle: JunctionVehicle = { id, approach, turn, arrival, stoppedAt, entry: roundUp(stoppedAt + 1), exit: 0, path, canReserve, travelSeconds, clearsStopLine: 0, maximumSpeed };
    let scheduled = false;
    for (let attempt = 0; attempt < 20000; attempt++) {
      vehicle.exit = vehicle.entry + travelSeconds;
      const pedestrianEnd = config.pedestrians ? overlapsPedestrian(vehicle.entry, vehicle.exit) : null;
      if (pedestrianEnd !== null) { vehicle.entry = roundUp(pedestrianEnd); continue; }
      const conflict = vehicles.find(other => trajectoriesConflict(vehicle, other, config.bufferMetres));
      if (!conflict) { scheduled = true; break; }
      vehicle.entry = !canReserve || !conflict.canReserve ? roundUp(conflict.exit) : roundUp(vehicle.entry + 0.05);
    }
    if (!scheduled) throw new Error("No laboratory reservation found within the scheduling horizon");
    vehicle.clearsStopLine = vehicle.entry + travelTime(JUNCTION_CONSTANTS.vehicleLength + 2 * config.bufferMetres + 1, maximumSpeed);
    frontClear.set(approach, vehicle.clearsStopLine); vehicles.push(vehicle);
  }
  const events = vehicles.flatMap(vehicle => [{ time: vehicle.entry, delta: 1 }, { time: vehicle.exit, delta: -1 }]).sort((a, b) => a.time - b.time || a.delta - b.delta);
  let active = 0, maxConcurrent = 0;
  for (const event of events) { active += event.delta; maxConcurrent = Math.max(maxConcurrent, active); }
  const totalWait = vehicles.reduce((sum, vehicle) => sum + vehicle.entry - vehicle.arrival, 0);
  return { config: { ...config }, vehicles, duration: Math.max(...vehicles.map(vehicle => vehicle.exit)),
    metrics: { totalWait, meanWait: totalWait / vehicles.length, completed: vehicles.length, maxConcurrent },
    sampleSeconds: JUNCTION_CONSTANTS.sampleSeconds, numericalMarginMetres: JUNCTION_CONSTANTS.numericalMarginMetres };
}

export interface JunctionSnapshot {
  time: number;
  vehicles: { id: number; approach: JunctionApproach; turn: JunctionTurn; x: number; y: number; heading: number;
    state: "approaching" | "stopped" | "moving" | "done"; visible: boolean; canReserve: boolean; entry: number; exit: number }[];
  metrics: { completed: number; active: number; waiting: number };
  pedestrianActive: boolean;
}
export function junctionSnapshotAt(plan: JunctionPlan, time: number): JunctionSnapshot {
  if (!Number.isFinite(time) || time < 0) throw new RangeError("Junction snapshot time must be finite and nonnegative");
  const window = pedestrianWindow(time);
  const vehicles = plan.vehicles.map(vehicle => {
    const state = time >= vehicle.exit ? "done" : time >= vehicle.entry ? "moving" : time >= vehicle.stoppedAt ? "stopped" : "approaching";
    const pose = junctionPoseAt(vehicle, time);
    const blockedByPredecessor = plan.vehicles.some(other => other.id < vehicle.id && other.approach === vehicle.approach && time < other.clearsStopLine);
    return { id: vehicle.id, approach: vehicle.approach, turn: vehicle.turn, x: pose.x, y: pose.y, heading: pose.heading,
      state: state as JunctionSnapshot["vehicles"][number]["state"], visible: state === "moving" || state !== "done" && time >= vehicle.arrival && !blockedByPredecessor,
      canReserve: vehicle.canReserve, entry: vehicle.entry, exit: vehicle.exit };
  });
  return { time, vehicles, metrics: { completed: vehicles.filter(vehicle => vehicle.state === "done").length,
    active: vehicles.filter(vehicle => vehicle.state === "moving").length,
    waiting: plan.vehicles.filter(vehicle => time >= vehicle.arrival && time < vehicle.entry).length },
    pedestrianActive: plan.config.pedestrians && time >= window.start && time < window.end };
}
