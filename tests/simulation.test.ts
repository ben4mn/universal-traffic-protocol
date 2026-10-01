import assert from "node:assert/strict";
import test from "node:test";
import {
  MODEL_CONSTANTS,
  TrafficSimulation,
  type Scenario,
  type SimulationSnapshot,
} from "../src/simulation.ts";

const config = {
  adoption: 0.8,
  demand: 1,
  packetLoss: 0.05,
  scenario: "rush" as Scenario,
  seed: 73,
};

function outcome(snapshot: SimulationSnapshot) {
  return {
    metrics: snapshot.metrics,
    vehicles: snapshot.vehicles.map(
      ({ connected: _connected, ...vehicle }) => vehicle,
    ),
    roads: snapshot.roads,
    signals: snapshot.intersections.map(
      ({
        connected: _connected,
        receivedMessages: _messages,
        fresh: _fresh,
        ...node
      }) => node,
    ),
  };
}

test("matched experiments receive exactly the same travelers", () => {
  for (const scenario of ["rush", "school", "incident"] as Scenario[]) {
    const baseline = new TrafficSimulation({
      ...config,
      scenario,
      mode: "isolated",
    });
    const connected = new TrafficSimulation({
      ...config,
      scenario,
      mode: "connected",
    });
    baseline.step(360);
    connected.step(360);
    const a = baseline.getSnapshot(),
      b = connected.getSnapshot();
    assert.equal(a.metrics.generated, b.metrics.generated);
    for (const snapshot of [a, b]) {
      assert.equal(
        snapshot.metrics.generated,
        snapshot.metrics.active +
          snapshot.metrics.completed +
          snapshot.metrics.waitingOutside,
      );
    }
  }
});

test("zero adoption reproduces the baseline exactly", () => {
  const baseline = new TrafficSimulation({ ...config, mode: "isolated" });
  const connected = new TrafficSimulation({
    ...config,
    mode: "connected",
    adoption: 0,
  });
  baseline.step(360);
  connected.step(360);
  assert.deepEqual(
    outcome(connected.getSnapshot()),
    outcome(baseline.getSnapshot()),
  );
  assert.equal(connected.getSnapshot().telemetry.sent, 0);
});

test("all packets lost falls back to the same fixed signals and physical outcomes", () => {
  const baseline = new TrafficSimulation({ ...config, mode: "isolated" });
  const connected = new TrafficSimulation({
    ...config,
    mode: "connected",
    adoption: 1,
    packetLoss: 1,
  });
  baseline.step(360);
  connected.step(360);
  assert.deepEqual(
    outcome(connected.getSnapshot()),
    outcome(baseline.getSnapshot()),
  );
  assert.ok(connected.getSnapshot().telemetry.dropped > 0);
  assert.equal(connected.getSnapshot().telemetry.received, 0);
});

test("baseline outcomes do not depend on connectivity controls", () => {
  const a = new TrafficSimulation({
    ...config,
    mode: "isolated",
    adoption: 0,
    packetLoss: 1,
  });
  const b = new TrafficSimulation({
    ...config,
    mode: "isolated",
    adoption: 1,
    packetLoss: 0,
  });
  a.step(180);
  b.step(180);
  assert.deepEqual(outcome(a.getSnapshot()), outcome(b.getSnapshot()));
});

test("fixed time integration is deterministic across rendering frame sizes and reset", () => {
  const a = new TrafficSimulation({ ...config, mode: "connected" });
  const b = new TrafficSimulation({ ...config, mode: "connected" });
  a.step(90);
  for (let i = 0; i < 900; i++) b.step(0.1);
  assert.deepEqual(a.getSnapshot(), b.getSnapshot());
  a.reset();
  a.step(90);
  assert.deepEqual(a.getSnapshot(), b.getSnapshot());
});

test("finite storage, lane headway, bounded motion and conservation survive heavy demand", () => {
  for (const scenario of ["rush", "school", "incident"] as Scenario[]) {
    const sim = new TrafficSimulation({
      ...config,
      mode: "connected",
      adoption: 1,
      demand: 1.6,
      scenario,
    });
    for (let sample = 0; sample < 150; sample++) {
      sim.step(2);
      const snapshot = sim.getSnapshot();
      assert.equal(
        snapshot.metrics.generated,
        snapshot.metrics.active +
          snapshot.metrics.completed +
          snapshot.metrics.waitingOutside,
      );
      const lanes = new Map<string, number[]>();
      for (const vehicle of snapshot.vehicles) {
        assert.ok(
          Number.isFinite(
            vehicle.x +
              vehicle.y +
              vehicle.heading +
              vehicle.speed +
              vehicle.progress,
          ),
        );
        assert.ok(vehicle.x >= 0 && vehicle.x <= 1000);
        assert.ok(vehicle.y >= 0 && vehicle.y <= 1000);
        assert.ok(
          vehicle.speed >= 0 && vehicle.speed <= MODEL_CONSTANTS.speedLimit,
        );
        const positions = lanes.get(vehicle.laneId) ?? [];
        positions.push(vehicle.progress);
        lanes.set(vehicle.laneId, positions);
      }
      for (const road of snapshot.roads) {
        assert.ok(
          road.occupancy <= road.capacity,
          `${road.id} exceeds storage`,
        );
        const positions = (lanes.get(road.id) ?? []).sort((a, b) => a - b);
        assert.ok(positions.every((p) => p >= 0 && p <= road.length));
        for (let i = 1; i < positions.length; i++) {
          assert.ok(
            positions[i] - positions[i - 1] >=
              MODEL_CONSTANTS.vehicleLength + MODEL_CONSTANTS.minimumGap - 1e-7,
            `${road.id} loses headway`,
          );
        }
      }
    }
  }
});

test("the reference rush experiment improves from actual adaptive vehicle traversal", () => {
  const baseline = new TrafficSimulation({ ...config, mode: "isolated" });
  const connected = new TrafficSimulation({
    ...config,
    mode: "connected",
    adoption: 1,
    packetLoss: 0,
  });
  baseline.step(600);
  connected.step(600);
  const a = baseline.getSnapshot(),
    b = connected.getSnapshot();
  assert.ok(b.metrics.completed > a.metrics.completed);
  assert.ok(b.metrics.meanTravelTime < a.metrics.meanTravelTime);
  assert.ok(b.metrics.totalDelay < a.metrics.totalDelay);
  assert.ok(b.telemetry.offers > 0);
  assert.equal(b.telemetry.received, b.telemetry.sent);
});

test("more demand creates arrivals and queues; network coordination has finite capacity", () => {
  const low = new TrafficSimulation({
    ...config,
    mode: "connected",
    adoption: 1,
    demand: 0.5,
  });
  const high = new TrafficSimulation({
    ...config,
    mode: "connected",
    adoption: 1,
    demand: 1.6,
  });
  low.step(600);
  high.step(600);
  const a = low.getSnapshot().metrics,
    b = high.getSnapshot().metrics;
  assert.ok(b.generated > a.generated * 2);
  assert.ok(b.queue > a.queue);
  assert.ok(b.meanTravelTime > a.meanTravelTime);
});

test("invalid time increments do not corrupt state", () => {
  const sim = new TrafficSimulation(config);
  const before = sim.getSnapshot();
  for (const dt of [0, -1, NaN, Infinity]) sim.step(dt);
  assert.deepEqual(sim.getSnapshot(), before);
});

test("partial-loss fallback preserves two seconds of actual all-red before a new green", () => {
  for (const mode of ["isolated", "connected"] as const) {
    const sim = new TrafficSimulation({
      ...config,
      mode,
      seed: 7,
      adoption: 1,
      packetLoss: 0.75,
    });
    const history = new Map<
      string,
      { phase?: "NS" | "EW"; redSince?: number }
    >();
    for (let tick = 0; tick < 1800; tick++) {
      sim.step(0.1);
      const snapshot = sim.getSnapshot();
      for (const intersection of snapshot.intersections) {
        const prior = history.get(intersection.id) ?? {};
        if (intersection.state === "clearance") {
          prior.redSince ??= snapshot.time;
        } else {
          if (prior.phase !== undefined && prior.phase !== intersection.phase) {
            assert.ok(
              prior.redSince !== undefined,
              `${intersection.id} switches directly between greens at ${snapshot.time}`,
            );
            assert.ok(
              snapshot.time - prior.redSince >=
                MODEL_CONSTANTS.allRedSeconds - 1e-8,
              `${intersection.id} clears only ${snapshot.time - prior.redSince}s at ${snapshot.time}`,
            );
          }
          prior.phase = intersection.phase;
          prior.redSince = undefined;
        }
        history.set(intersection.id, prior);
      }
    }
  }
});

test("protected school windows never overlap an existing junction traversal", () => {
  for (const mode of ["isolated", "connected"] as const) {
    const sim = new TrafficSimulation({
      ...config,
      mode,
      scenario: "school",
      seed: 7,
      adoption: 1,
      packetLoss: 0.75,
    });
    let protectedSamples = 0;
    for (let tick = 0; tick < 1800; tick++) {
      sim.step(0.1);
      const snapshot = sim.getSnapshot();
      const school = snapshot.intersections.find((i) => i.id === "i01")!;
      if (!school.pedestrian) continue;
      protectedSamples++;
      const departures = new Set(
        snapshot.roads.filter((r) => r.from === school.id).map((r) => r.id),
      );
      assert.equal(
        snapshot.vehicles.filter((v) => v.crossing && departures.has(v.laneId))
          .length,
        0,
        `${mode} admits a vehicle into the protected school window at ${snapshot.time}`,
      );
    }
    assert.equal(
      protectedSamples,
      360,
      "Four full nine-second windows retain their scheduled duration",
    );
  }
});
