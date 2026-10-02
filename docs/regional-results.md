# Regional experiment results

These are synthetic model results, not estimates for a real city. Reproduce with `npm run benchmark:regional`; use `-- --write` to update this file or `-- --csv` for per-seed measurements. Both strategies receive the same requested trips, fixed routes, physical capacities, and seed. The runs begin with an empty network, have no discarded warm-up, and last 1,800 simulated seconds.

All-trip time integrates every unfinished trip, including moving traffic and waiting outside. It is not a completed-trip delay average. A negative change means shared control used less total vehicle-time; a positive change means more. Values are arithmetic means over seeds 7, 19, and 41; the range is the observed paired range, not a confidence interval.

| Case | All-trip time change | Seed range | Finished trips change | Local estimated queue | Shared estimated queue |
| --- | ---: | ---: | ---: | ---: | ---: |
| pulse, 0.6× | 0.0% | 0.0% to 0.1% | -0.6 | 0.5 | 0.8 |
| pulse, 1× | -1.9% | -2.7% to -0.7% | 107.5 | 322.0 | 201.3 |
| pulse, 1.4× | -3.5% | -4.3% to -2.1% | 176.8 | 1542.0 | 1318.4 |
| steady, 0.6× | 0.0% | 0.0% to 0.1% | -0.6 | 0.5 | 0.8 |
| steady, 1× | -2.5% | -3.7% to -1.1% | 117.8 | 332.1 | 201.8 |
| steady, 1.4× | -4.9% | -6.0% to -3.7% | 224.2 | 1552.4 | 1286.3 |
| overload, 0.6× | -1.9% | -3.8% to -0.4% | 111.2 | 1832.7 | 1707.5 |
| overload, 1× | -0.2% | -0.5% to 0.3% | -63.0 | 5647.1 | 5739.1 |
| overload, 1.4× | 0.0% | -0.2% to 0.2% | -71.4 | 9688.8 | 9781.7 |
| pulse, concentrated last ramp | 0.5% | 0.4% to 0.6% | -27.1 | 1432.6 | 1456.0 |
| pulse, half adoption | 0.3% | 0.2% to 0.5% | -1.4 | 322.0 | 313.1 |
| pulse, half messages lost | -2.2% | -3.0% to -1.0% | 106.4 | 322.0 | 197.8 |
| pulse, no adoption | 0.0% | 0.0% to 0.0% | 0.0 | 322.0 | 322.0 |
| pulse, full outage | 0.0% | 0.0% to 0.0% | 0.0 | 322.0 | 322.0 |

## Did sharing contain this particular interruption?

To isolate the interruption, subtract each controller's no-restriction run from its restriction run, keeping its demand and seed identical. Then compare those added costs. A negative difference means shared control reduced the extra cost attributable to the disturbance. Lower overall trip time alone does not establish this.

| Demand | Extra local vehicle-seconds | Extra shared vehicle-seconds | Shared minus local added cost |
| --- | ---: | ---: | ---: |
| 0.6× | 13771.2 | 13779.2 | 8.1 |
| 1× | 28771.8 | 34102.0 | 5330.2 |
| 1.4× | 72811.0 | 100787.0 | 27976.0 |

At default demand, sharing improves the overall run but increases this interruption's incremental cost. This policy therefore does not demonstrate the claimed suppression of this particular congestion cascade. That is a useful failure to investigate, not evidence that no possible coordinated controller could suppress it. The model does show the restriction filling several upstream freeway cells.

The concentrated-ramp case uses global shortest paths, which funnel freeway-to-city trips through the last ramp. The default routes distribute those trips among three predetermined off-ramps. This changes the scenario, not the routes between the two controllers. Keeping both cases exposes how spatial bottlenecks affect the result.

The queue is an excess-occupancy estimate plus outside holding, not a count of stopped individual cars. The two policies share the same road model, but shared control combines downstream-aware signal pressure and on-ramp metering. These results do not isolate the communication layer from its control policy. See [model assumptions](regional-model.md) and [the evidence review](cascades.md).
