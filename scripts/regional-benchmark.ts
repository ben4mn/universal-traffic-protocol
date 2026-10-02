import { writeFileSync } from "node:fs";
import { runExperiment, type RegionalConfig } from "../src/regional.ts";

const seeds = [7, 19, 41];
const cases: { name: string; config: Omit<RegionalConfig, "strategy" | "seed"> }[] = [];
for (const scenario of ["pulse", "steady", "overload"] as const)
  for (const demandScale of [0.6, 1, 1.4])
    cases.push({ name: `${scenario}, ${demandScale}×`, config: { scenario, demandScale, adoption: 1, packetLoss: 0 } });
cases.push(
  { name: "pulse, concentrated last ramp", config: { scenario: "pulse", adoption: 1, packetLoss: 0, routePattern: "lastRamp" } },
  { name: "pulse, half adoption", config: { scenario: "pulse", adoption: 0.5, packetLoss: 0 } },
  { name: "pulse, half messages lost", config: { scenario: "pulse", adoption: 1, packetLoss: 0.5 } },
  { name: "pulse, no adoption", config: { scenario: "pulse", adoption: 0, packetLoss: 0 } },
  { name: "pulse, full outage", config: { scenario: "pulse", adoption: 1, packetLoss: 1 } },
);
const results = cases.map(({ name, config }) => ({ name, ...runExperiment(config, 1800, seeds) }));
const f = (n: number) => n.toFixed(1);
const shockRows = [0.6, 1, 1.4].map(scale => {
  const pulse = results.find(r => r.name === `pulse, ${scale}×`)!;
  const steady = results.find(r => r.name === `steady, ${scale}×`)!;
  const localAdded = pulse.summary.localVehicleSeconds - steady.summary.localVehicleSeconds;
  const sharedAdded = pulse.summary.sharedVehicleSeconds - steady.summary.sharedVehicleSeconds;
  return { scale, localAdded, sharedAdded, difference: sharedAdded - localAdded };
});
const lines = [
  "# Regional experiment results",
  "",
  "These are synthetic model results, not estimates for a real city. Reproduce with `npm run benchmark:regional`; use `-- --write` to update this file or `-- --csv` for per-seed measurements. Both strategies receive the same requested trips, fixed routes, physical capacities, and seed. The runs begin with an empty network, have no discarded warm-up, and last 1,800 simulated seconds.",
  "",
  "All-trip time integrates every unfinished trip, including moving traffic and waiting outside. It is not a completed-trip delay average. A negative change means shared control used less total vehicle-time; a positive change means more. Values are arithmetic means over seeds 7, 19, and 41; the range is the observed paired range, not a confidence interval.",
  "",
  "| Case | All-trip time change | Seed range | Finished trips change | Local estimated queue | Shared estimated queue |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
  ...results.map(r => `| ${r.name} | ${f(r.summary.vehicleSecondsChangePercent)}% | ${f(r.summary.minimumPercent)}% to ${f(r.summary.maximumPercent)}% | ${f(r.summary.completedChange)} | ${f(r.summary.localQueue)} | ${f(r.summary.sharedQueue)} |`),
  "",
  "## Did sharing contain this particular interruption?",
  "",
  "To isolate the interruption, subtract each controller's no-restriction run from its restriction run, keeping its demand and seed identical. Then compare those added costs. A negative difference means shared control reduced the extra cost attributable to the disturbance. Lower overall trip time alone does not establish this.",
  "",
  "| Demand | Extra local vehicle-seconds | Extra shared vehicle-seconds | Shared minus local added cost |",
  "| --- | ---: | ---: | ---: |",
  ...shockRows.map(r => `| ${r.scale}× | ${f(r.localAdded)} | ${f(r.sharedAdded)} | ${f(r.difference)} |`),
  "",
  "At default demand, sharing improves the overall run but increases this interruption's incremental cost. This policy therefore does not demonstrate the claimed suppression of this particular congestion cascade. That is a useful failure to investigate, not evidence that no possible coordinated controller could suppress it. The model does show the restriction filling several upstream freeway cells.",
  "",
  "The concentrated-ramp case uses global shortest paths, which funnel freeway-to-city trips through the last ramp. The default routes distribute those trips among three predetermined off-ramps. This changes the scenario, not the routes between the two controllers. Keeping both cases exposes how spatial bottlenecks affect the result.",
  "",
  "The queue is an excess-occupancy estimate plus outside holding, not a count of stopped individual cars. The two policies share the same road model, but shared control combines downstream-aware signal pressure and on-ramp metering. These results do not isolate the communication layer from its control policy. See [model assumptions](regional-model.md) and [the evidence review](cascades.md).",
];
if (process.argv.includes("--csv")) {
  console.log("case,seed,strategy,duration,generated,completed,unfinished,waiting_outside,estimated_queue,total_vehicle_seconds");
  for (const r of results) for (const row of r.results) for (const strategy of ["local", "shared"] as const) {
    const m = row[strategy];
    console.log([JSON.stringify(r.name), row.seed, strategy, r.duration, m.generated, m.completed, m.generated - m.completed, m.waitingOutside, m.queue, m.totalVehicleSeconds].join(","));
  }
} else console.log(lines.join("\n"));
if (process.argv.includes("--write")) writeFileSync(new URL("../docs/regional-results.md", import.meta.url), lines.join("\n") + "\n");
