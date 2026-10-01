import assert from "node:assert/strict";
import test from "node:test";
import { SCENARIOS, inspectScenario } from "../src/scenarios.ts";
import { TrafficSimulation, type Scenario } from "../src/simulation.ts";

const scenarios: Scenario[] = ["rush", "school", "incident"];

function sample(scenario: Scenario, seconds: number) {
  const simulation = new TrafficSimulation({
    scenario,
    mode: "connected",
    adoption: 0.75,
    demand: 1,
    packetLoss: 0,
    seed: 7,
  });
  simulation.step(seconds);
  return simulation.getSnapshot();
}

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);
}

test("scenario locations refer to actual engine junctions and fit their micro view", () => {
  const expected = {
    rush: ["i11", 500, 500],
    school: ["i01", 500, 220],
    incident: ["i11", 500, 500],
  } as const;
  for (const scenario of scenarios) {
    const definition = SCENARIOS[scenario];
    const inspection = inspectScenario(
      sample(scenario, definition.startSeconds),
    );
    const [id, x, y] = expected[scenario];
    assert.equal(inspection.intersection.id, id);
    assert.equal(inspection.intersection.x, x);
    assert.equal(inspection.intersection.y, y);
    assert.ok(
      Math.abs(x - definition.microFocus.x) < definition.microFocus.span / 2,
    );
    assert.ok(
      Math.abs(y - definition.microFocus.y) < definition.microFocus.span / 2,
    );
    if (definition.eventSeconds !== undefined)
      assert.ok(definition.startSeconds < definition.eventSeconds);
  }
});

test("incident focus is the actual eastbound block from the center junction", () => {
  const inspection = inspectScenario(sample("incident", 50));
  assert.equal(inspection.focusRoad?.id, "i11>i12");
  assert.equal(inspection.focusRoad?.from, "i11");
  assert.equal(inspection.focusRoad?.to, "i12");
  assert.equal(inspection.focusRoad?.heading, 0);
  assert.equal(inspection.focusRoad?.y1, 508);
  assert.equal(inspection.focusRoad?.y2, 508);
  assert.equal(inspection.focusRoad?.disrupted, true);
});

test("approach queues name where cars came from, including the school's boundary road", () => {
  for (const scenario of scenarios) {
    const snapshot = sample(scenario, 0);
    const focusId = SCENARIOS[scenario].focusIntersectionId;
    const northId = scenario === "school" ? "n1" : "i01";
    const eastId = scenario === "school" ? "i02" : "i12";
    const southId = scenario === "school" ? "i11" : "i21";
    const westId = scenario === "school" ? "i00" : "i10";
    const queues = new Map([
      [`${northId}>${focusId}`, 1],
      [`${eastId}>${focusId}`, 2],
      [`${southId}>${focusId}`, 3],
      [`${westId}>${focusId}`, 4],
    ]);
    for (const road of snapshot.roads) road.queue = queues.get(road.id) ?? 0;
    const inspection = inspectScenario(snapshot);
    assert.deepEqual(inspection.approachQueues, {
      north: 1,
      east: 2,
      south: 3,
      west: 4,
    });
    assert.equal(inspection.focusQueue, 10);
  }
});

test("local and network details count the live roads and junctions", () => {
  for (const scenario of scenarios) {
    const snapshot = sample(scenario, 180);
    const inspection = inspectScenario(snapshot);
    const incoming = snapshot.roads.filter(
      (road) => road.to === inspection.intersection.id,
    );
    const outgoing = snapshot.roads.filter(
      (road) => road.from === inspection.intersection.id,
    );
    assert.equal(inspection.focusQueue, inspection.intersection.queue);
    assert.equal(
      Object.values(inspection.approachQueues).reduce(
        (sum, value) => sum + value,
        0,
      ),
      inspection.focusQueue,
    );
    assert.equal(
      inspection.inboundOccupancy,
      incoming.reduce((sum, road) => sum + road.occupancy, 0),
    );
    assert.equal(
      inspection.outboundOccupancy,
      outgoing.reduce((sum, road) => sum + road.occupancy, 0),
    );
    assert.equal(
      inspection.network.queuedIntersections,
      snapshot.intersections.filter((node) => node.queue > 0).length,
    );
    assert.equal(
      inspection.network.fullRoads,
      snapshot.roads.filter((road) => road.occupancy >= road.capacity).length,
    );
    assert.equal(
      inspection.network.busiestIntersection.queue,
      Math.max(...snapshot.intersections.map((node) => node.queue)),
    );
  }
});

test("crossing countdown follows the engine's nine-second windows every 42 seconds", () => {
  const samples = [
    { time: 0, active: false, remaining: 0, next: 42 },
    { time: 38, active: false, remaining: 0, next: 4 },
    { time: 41.9, active: false, remaining: 0, next: 0.1 },
    { time: 42, active: true, remaining: 9, next: 0 },
    { time: 42.1, active: true, remaining: 8.9, next: 0 },
    { time: 50.9, active: true, remaining: 0.1, next: 0 },
    { time: 51, active: false, remaining: 0, next: 33 },
    { time: 83.9, active: false, remaining: 0, next: 0.1 },
    { time: 84, active: true, remaining: 9, next: 0 },
    { time: 93, active: false, remaining: 0, next: 33 },
  ];
  for (const { time, active, remaining, next } of samples) {
    const inspection = inspectScenario(sample("school", time));
    assert.equal(inspection.protectedCrossing?.active, active);
    assert.equal(
      inspection.protectedCrossing?.active,
      inspection.intersection.pedestrian,
    );
    near(inspection.protectedCrossing!.remainingSeconds, remaining);
    near(inspection.protectedCrossing!.nextInSeconds, next);
  }
});

test("restriction countdown and status change at the actual 45-second event", () => {
  for (const time of [0, 40, 44.9, 45, 45.1, 180]) {
    const inspection = inspectScenario(sample("incident", time));
    assert.equal(inspection.restriction?.active, time >= 45);
    assert.equal(
      inspection.restriction?.active,
      inspection.focusRoad?.disrupted,
    );
    near(inspection.restriction!.startsInSeconds, Math.max(0, 45 - time));
  }
});

test("only the matching scenario exposes a crossing or a road restriction", () => {
  for (const scenario of scenarios) {
    const inspection = inspectScenario(sample(scenario, 45));
    assert.equal(inspection.protectedCrossing !== null, scenario === "school");
    assert.equal(inspection.restriction !== null, scenario === "incident");
    assert.equal(inspection.focusRoad !== undefined, scenario === "incident");
  }
});
