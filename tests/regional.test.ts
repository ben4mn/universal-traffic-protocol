import assert from "node:assert/strict";
import test from "node:test";
import { REGIONAL_TOPOLOGY, RegionalSimulation, runExperiment, type RegionalSnapshot, type RegionalScenario } from "../src/regional.ts";

const base = { scenario: "pulse" as RegionalScenario, adoption: 1, packetLoss: 0, seed: 7 };
const close = (actual: number, expected: number, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
function physical(snapshot: RegionalSnapshot) {
  const { sentReports: _sent, receivedReports: _received, droppedReports: _dropped, ...metrics } = snapshot.metrics;
  return { time: snapshot.time, links: snapshot.links, sources: snapshot.sources, history: snapshot.history, metrics,
    phases: snapshot.nodes.map(({ id, phase }) => ({ id, phase })) };
}

test("regional topology contains 35 junctions, 3 on/off ramp pairs, and six terminal exits", () => {
  assert.equal(REGIONAL_TOPOLOGY.nodes.filter(node => node.kind === "junction").length, 35);
  assert.equal(REGIONAL_TOPOLOGY.links.filter(link => link.kind === "ramp").length, 6);
  assert.equal(REGIONAL_TOPOLOGY.links.filter(link => link.terminal).length, 6);
  assert.equal(REGIONAL_TOPOLOGY.sources.length, 12);
});

test("vehicle mass, finite storage, and sending/receiving capacities hold under heavy demand", () => {
  for (const scenario of ["pulse", "steady", "overload"] as RegionalScenario[]) {
    const sim = new RegionalSimulation({ ...base, scenario, strategy: "shared", demandScale: 1.5 });
    for (let sample = 0; sample < 45; sample++) {
      sim.step(20); const snapshot = sim.snapshot(), metrics = snapshot.metrics;
      close(metrics.generated, metrics.completed + metrics.onNetwork + metrics.waitingOutside);
      assert.equal(metrics.generated, snapshot.sources.reduce((sum, source) => sum + source.generated, 0));
      close(metrics.waitingOutside, snapshot.sources.reduce((sum, source) => sum + source.waiting, 0));
      for (const link of snapshot.links) {
        assert.ok(link.occupancy >= -1e-9 && link.occupancy <= link.storage + 1e-8, link.id);
        assert.ok(link.flow >= 0 && link.flow <= link.capacity + 1e-8, `receiving ${link.id}`);
        assert.ok(link.outflow >= 0 && link.outflow <= link.capacity + 1e-8, `sending ${link.id}`);
      }
    }
  }
});

test("paired controllers receive identical generated origins and destinations", () => {
  for (const scenario of ["pulse", "steady", "overload"] as RegionalScenario[]) {
    const a = new RegionalSimulation({ ...base, scenario, strategy: "local" });
    const b = new RegionalSimulation({ ...base, scenario, strategy: "shared", packetLoss: 0.2 });
    a.step(900); b.step(900);
    assert.deepEqual(a.snapshot().sources.map(source => source.generated), b.snapshot().sources.map(source => source.generated));
    assert.deepEqual(a.snapshot().sources.map(source => source.destinations), b.snapshot().sources.map(source => source.destinations));
    assert.equal(a.snapshot().metrics.generated, b.snapshot().metrics.generated);
  }
});

test("no adoption or complete packet loss reproduces the local physical policy exactly", () => {
  const a = new RegionalSimulation({ ...base, strategy: "local" });
  const b = new RegionalSimulation({ ...base, strategy: "shared", adoption: 0 });
  const c = new RegionalSimulation({ ...base, strategy: "shared", packetLoss: 1 });
  for (const simulation of [a, b, c]) simulation.step(900);
  assert.deepEqual(physical(a.snapshot()), physical(b.snapshot()));
  assert.deepEqual(physical(a.snapshot()), physical(c.snapshot()));
  assert.equal(b.snapshot().metrics.sentReports, 0);
  assert.ok(c.snapshot().metrics.droppedReports > 0);
  assert.equal(c.snapshot().metrics.receivedReports, 0);
});

test("regional fixed time integration is deterministic across frame sizes", () => {
  const a = new RegionalSimulation({ ...base, strategy: "shared" });
  const b = new RegionalSimulation({ ...base, strategy: "shared" });
  a.step(360); for (let i = 0; i < 3600; i++) b.step(0.1);
  assert.deepEqual(a.snapshot(), b.snapshot());
});

test("fresh reports arrive after two seconds, and all expire after delivery stops", () => {
  const sim = new RegionalSimulation({ ...base, strategy: "shared" });
  sim.step(2); assert.equal(sim.snapshot().metrics.receivedReports, 0);
  sim.step(2); assert.equal(sim.snapshot().metrics.freshControllers, 42);
  sim.step(26); sim.config.packetLoss = 1; sim.step(20);
  assert.equal(sim.snapshot().metrics.freshControllers, 0);
  assert.ok(sim.snapshot().metrics.droppedReports > 0);
});

test("the temporary restriction changes only one exit and causally fills upstream freeway cells", () => {
  const pulse = new RegionalSimulation({ ...base, strategy: "local" });
  const steady = new RegionalSimulation({ ...base, scenario: "steady", strategy: "local" });
  pulse.step(300); let snapshot = pulse.snapshot();
  assert.equal(snapshot.event.active, true);
  assert.equal(snapshot.links.find(link => link.to === "freeway-east")!.effectiveCapacity, 0.25);
  assert.ok(snapshot.links.filter(link => link.terminal && link.kind === "street").every(link => link.effectiveCapacity === link.capacity));
  pulse.step(240); steady.step(540); snapshot = pulse.snapshot();
  assert.equal(snapshot.event.active, false);
  assert.equal(snapshot.links.find(link => link.to === "freeway-east")!.effectiveCapacity, 1.7);
  for (const id of ["f3>f4", "f4>f5", "f5>f6"]) {
    const ordinary = steady.snapshot().links.find(link => link.id === id)!;
    assert.ok(snapshot.links.find(link => link.id === id)!.occupancy > ordinary.occupancy + 10, id);
  }
});

test("above-cut demand cannot be eliminated by either controller or perfect communication", () => {
  for (const strategy of ["local", "shared"] as const) {
    const sim = new RegionalSimulation({ ...base, scenario: "overload", strategy }); sim.step(1800);
    const snapshot = sim.snapshot();
    close(snapshot.bound.exitCapacity, 4.45);
    close(snapshot.bound.demandRate, 5.675);
    close(snapshot.bound.minimumGrowthPerMinute, 73.5);
    assert.ok(snapshot.bound.unfinishedLowerBound > 1000);
    assert.ok(snapshot.metrics.onNetwork + snapshot.metrics.waitingOutside >= snapshot.bound.unfinishedLowerBound - 1e-8);
    assert.ok(snapshot.metrics.completed <= snapshot.bound.exitCapacity * snapshot.time + 1e-8);
  }
});

test("queue definitions include every outside wait and use nominal critical occupancy", () => {
  const sim = new RegionalSimulation({ ...base, scenario: "overload", strategy: "shared" }); sim.step(900);
  const snapshot = sim.snapshot();
  const excess = snapshot.links.reduce((sum, link) => sum + Math.max(0, link.occupancy - link.criticalOccupancy), 0);
  close(snapshot.metrics.queue, excess + snapshot.metrics.waitingOutside);
  close(snapshot.metrics.queue, snapshot.metrics.cityQueue + snapshot.metrics.freewayQueue + snapshot.metrics.rampQueue + snapshot.metrics.waitingOutside);
  assert.ok(snapshot.metrics.totalVehicleSeconds > 0);
});

test("paired experiments retain per-seed adverse results and use all unfinished time", () => {
  const experiment = runExperiment({ ...base, scenario: "overload" }, 1800, [7, 19, 41]);
  assert.equal(experiment.results.length, 3);
  assert.ok(experiment.results.some(result => result.vehicleSecondsChangePercent > 0));
  for (const result of experiment.results) {
    assert.equal(result.local.generated, result.shared.generated);
    close(result.vehicleSecondsChangePercent, (result.shared.totalVehicleSeconds / result.local.totalVehicleSeconds - 1) * 100);
  }
  const concentrated = runExperiment({ ...base, scenario: "steady", routePattern: "lastRamp" }, 900, [7]);
  assert.equal(concentrated.config.routePattern, "lastRamp");
});

test("invalid regional controls and step durations fail explicitly", () => {
  assert.throws(() => new RegionalSimulation({ ...base, strategy: "local", adoption: 2 }));
  assert.throws(() => new RegionalSimulation({ ...base, strategy: "local", packetLoss: -1 }));
  const sim = new RegionalSimulation({ ...base, strategy: "local" });
  assert.throws(() => sim.step(-1)); assert.throws(() => sim.step(Infinity));
});
