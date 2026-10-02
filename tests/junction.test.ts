import assert from "node:assert/strict";
import test from "node:test";
import { JUNCTION_CONSTANTS, junctionPoseAt, junctionSnapshotAt, planJunction, type JunctionPattern, type JunctionVehicle } from "../src/junction.ts";

const base = { pattern: "compatible" as JunctionPattern, mode: "reserved" as const, adoption: 1, packetLoss: 0, bufferMetres: 0.4, pedestrians: false };
type Point = { x: number; y: number };
// Independent corner/projection SAT, using a finer offset sample grid and the
// selected physical buffer, WITHOUT the scheduler's extra numerical margin.
function corners(vehicle: JunctionVehicle, time: number, buffer: number): Point[] {
  const pose = junctionPoseAt(vehicle, time), length = 2.25 + buffer, width = 0.95 + buffer;
  return [[-length, -width], [length, -width], [length, width], [-length, width]].map(([x, y]) => ({
    x: pose.x + x! * Math.cos(pose.heading) - y! * Math.sin(pose.heading),
    y: pose.y + x! * Math.sin(pose.heading) + y! * Math.cos(pose.heading),
  }));
}
function overlap(a: Point[], b: Point[]) {
  for (const polygon of [a, b]) for (let edge = 0; edge < 2; edge++) {
    const from = polygon[edge]!, to = polygon[edge + 1]!;
    const axis = { x: -(to.y - from.y), y: to.x - from.x };
    const projection = (points: Point[]) => points.map(point => point.x * axis.x + point.y * axis.y);
    const pa = projection(a), pb = projection(b);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}

test("three compatible front cars each stop for one second and then overlap", () => {
  const plan = planJunction(base);
  assert.deepEqual(plan.vehicles.slice(0, 3).map(vehicle => vehicle.approach), ["N", "E", "S"]);
  for (const vehicle of plan.vehicles.slice(0, 3)) { assert.equal(vehicle.arrival, 0); assert.equal(vehicle.stoppedAt, 0); assert.equal(vehicle.entry, 1); }
  assert.equal(junctionSnapshotAt(plan, 0.5).metrics.active, 0);
  assert.equal(junctionSnapshotAt(plan, 2.5).metrics.active, 3);
  assert.equal(junctionSnapshotAt(planJunction({ ...base, mode: "sequential" }), 2.5).metrics.active, 1);
});

test("every car makes a full lane-front stop after its predecessor clears the stop line", () => {
  for (const mode of ["reserved", "sequential"] as const) {
    const plan = planJunction({ ...base, pattern: "mixed", mode });
    for (const vehicle of plan.vehicles) {
      assert.ok(vehicle.stoppedAt >= vehicle.arrival - 1e-9);
      assert.ok(vehicle.entry >= vehicle.stoppedAt + 1 - 1e-9);
      const previous = plan.vehicles.filter(other => other.id < vehicle.id && other.approach === vehicle.approach).at(-1);
      if (previous) assert.ok(vehicle.stoppedAt >= previous.clearsStopLine - 1e-9);
    }
  }
});

test("conflicting straight paths receive different entries while compatible corners can share them", () => {
  const crossing = planJunction({ ...base, pattern: "crossing" });
  assert.ok(crossing.vehicles[1]!.entry > crossing.vehicles[0]!.entry);
  assert.ok(crossing.vehicles[2]!.entry > crossing.vehicles[0]!.entry);
  assert.ok(crossing.vehicles.slice(0, 3).reduce((sum, vehicle) => sum + vehicle.entry - vehicle.arrival, 0)
    > planJunction(base).vehicles.slice(0, 3).reduce((sum, vehicle) => sum + vehicle.entry - vehicle.arrival, 0));
});

test("independent finer-time buffered body checks find no overlapping reserved trajectories", () => {
  for (const pattern of ["compatible", "crossing", "mixed"] as JunctionPattern[]) for (const bufferMetres of [0.25, 0.6, 1.2]) {
    const plan = planJunction({ ...base, pattern, bufferMetres });
    for (let first = 0; first < plan.vehicles.length; first++) for (let second = first + 1; second < plan.vehicles.length; second++) {
      const a = plan.vehicles[first]!, b = plan.vehicles[second]!;
      const start = Math.max(a.entry, b.entry), end = Math.min(a.exit, b.exit);
      for (let time = start + 0.007; time < end; time += 0.013) {
        assert.equal(overlap(corners(a, time, bufferMetres), corners(b, time, bufferMetres)), false, `${pattern} ${bufferMetres} cars ${a.id}/${b.id} at ${time}`);
      }
    }
  }
});

test("zero adoption and total packet loss exactly recover one-at-a-time service", () => {
  const sequential = planJunction({ ...base, mode: "sequential" });
  for (const config of [{ ...base, adoption: 0 }, { ...base, packetLoss: 1 }]) {
    const fallback = planJunction(config);
    assert.deepEqual(fallback.vehicles, sequential.vehicles);
    assert.deepEqual(fallback.metrics, sequential.metrics);
    assert.equal(fallback.duration, sequential.duration);
  }
});

test("actual moving bodies also clear visible stationary lane-front bodies", () => {
  for (const pattern of ["compatible", "crossing", "mixed"] as JunctionPattern[]) for (const bufferMetres of [0.25, 1.2]) {
    const plan = planJunction({ ...base, pattern, bufferMetres });
    for (let time = 0.017; time <= plan.duration; time += 0.037) {
      const visible = junctionSnapshotAt(plan, time).vehicles.filter(vehicle => vehicle.visible);
      for (let first = 0; first < visible.length; first++) for (let second = first + 1; second < visible.length; second++) {
        const a = visible[first]!, b = visible[second]!;
        if (a.state !== "moving" && b.state !== "moving") continue;
        assert.equal(overlap(corners(plan.vehicles[a.id]!, time, 0), corners(plan.vehicles[b.id]!, time, 0)), false, `${pattern} cars ${a.id}/${b.id} at ${time}`);
      }
    }
  }
});

test("any unequipped car or incomplete request/ack transaction has exclusive service", () => {
  const plan = planJunction({ ...base, adoption: 0.75, packetLoss: 0.25, pattern: "mixed" });
  assert.ok(plan.vehicles.some(vehicle => vehicle.canReserve));
  assert.ok(plan.vehicles.some(vehicle => !vehicle.canReserve));
  for (const car of plan.vehicles.filter(vehicle => !vehicle.canReserve)) {
    for (const other of plan.vehicles.filter(vehicle => vehicle.id !== car.id)) {
      assert.ok(car.exit <= other.entry + 1e-9 || other.exit <= car.entry + 1e-9, `${car.id}/${other.id}`);
    }
  }
});

test("protected pedestrian intervals stop all vehicle movements in both modes", () => {
  for (const mode of ["reserved", "sequential"] as const) {
    const plan = planJunction({ ...base, pattern: "mixed", mode, pedestrians: true });
    for (let start = 12; start <= plan.duration; start += 30) {
      for (const vehicle of plan.vehicles) assert.ok(vehicle.exit <= start + 1e-9 || vehicle.entry >= start + 7 - 1e-9);
      const snapshot = junctionSnapshotAt(plan, start + 3);
      assert.equal(snapshot.pedestrianActive, true); assert.equal(snapshot.metrics.active, 0);
    }
  }
});

test("paths obey acceleration and speed bounds, preserve matched requests, and account for all waits", () => {
  const a = planJunction({ ...base, mode: "sequential", pattern: "mixed" });
  const b = planJunction({ ...base, pattern: "mixed" });
  assert.deepEqual(a.vehicles.map(({ id, arrival, approach, turn, path }) => ({ id, arrival, approach, turn, path })), b.vehicles.map(({ id, arrival, approach, turn, path }) => ({ id, arrival, approach, turn, path })));
  for (const vehicle of b.vehicles) {
    for (let elapsed = 0; elapsed < vehicle.travelSeconds - 0.01; elapsed += 0.1) {
      const p = junctionPoseAt(vehicle, vehicle.entry + elapsed), q = junctionPoseAt(vehicle, vehicle.entry + elapsed + 0.01);
      assert.ok(Math.hypot(q.x - p.x, q.y - p.y) <= vehicle.maximumSpeed * 0.01 + 1e-6);
      if (vehicle.turn !== "straight") {
        let headingChange = q.heading - p.heading;
        while (headingChange > Math.PI) headingChange -= 2 * Math.PI;
        while (headingChange < -Math.PI) headingChange += 2 * Math.PI;
        const speed = (q.distance - p.distance) / 0.01;
        assert.ok(Math.abs(headingChange / 0.01 * speed) <= 2.2, `cornering acceleration ${vehicle.id}`);
      }
      if (elapsed < vehicle.travelSeconds - 0.02) {
        const r = junctionPoseAt(vehicle, vehicle.entry + elapsed + 0.02);
        const acceleration = Math.abs((r.distance - 2 * q.distance + p.distance) / 0.0001);
        assert.ok(acceleration <= JUNCTION_CONSTANTS.acceleration + 1e-5);
      }
    }
  }
  assert.equal(junctionSnapshotAt(b, b.duration + 1).metrics.completed, 24);
  assert.ok(b.vehicles.filter(vehicle => vehicle.turn !== "straight").every(vehicle => vehicle.maximumSpeed === JUNCTION_CONSTANTS.turnMaximumSpeed));
  assert.equal(b.metrics.completed, 24);
  assert.ok(Math.abs(b.metrics.totalWait - b.vehicles.reduce((sum, vehicle) => sum + vehicle.entry - vehicle.arrival, 0)) < 1e-8);
});

test("larger buffers cannot invent a shorter plan for the same requests", () => {
  const small = planJunction({ ...base, pattern: "crossing", bufferMetres: 0.25 });
  const large = planJunction({ ...base, pattern: "crossing", bufferMetres: 1.2 });
  assert.ok(large.metrics.totalWait >= small.metrics.totalWait);
});

test("junction controls reject invalid values", () => {
  assert.throws(() => planJunction({ ...base, adoption: -1 }));
  assert.throws(() => planJunction({ ...base, packetLoss: 2 }));
  assert.throws(() => planJunction({ ...base, bufferMetres: 0 }));
  assert.throws(() => junctionSnapshotAt(planJunction(base), NaN));
});
