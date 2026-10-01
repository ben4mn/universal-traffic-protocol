# From an idea to evidence

The central hypothesis is that interoperable, timely information reduces avoidable delay and improves coordination under some traffic conditions. Increasing adoption may improve observability and available actions. It does not imply monotonically better outcomes, and can expose weaknesses in the coordination policy.

## Questions this prototype can investigate

| Question                                     | Controlled comparison                                                    | What to report                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Does queue-informed control reduce delay?    | Same demand and seed; fixed timing versus adaptive participating signals | Completed travel times, queue backlog, throughput, cumulative delay   |
| What does partial adoption change?           | Sweep adoption with the same demand and seed                             | Participating signals, received data, completed trips, outside queues |
| Does communication fail gracefully?          | Hold the scenario fixed; increase message loss up to total outage        | Freshness state, fallback, queues, conservation                       |
| Can a shared protocol overcome a bottleneck? | Increase demand or introduce a physical restriction                      | Backlog growth and capacity, including unfavorable runs               |
| Are pedestrians treated as part of the city? | Identical protected crossing closure in both modes                       | Vehicle impacts without shortening pedestrian protection              |

These are questions about this model. Its results do not estimate a specific city, compare commercial autonomous driving systems, establish radio performance, or prove safety.

## Experiments needed before a field claim

1. **Separate information from the controller.** Compare well-tuned actuated signals with equal access to local sensors, then add shared observations. This identifies the incremental value of interoperability rather than crediting every improvement to a protocol. The current baseline is fixed timing.
2. **Sweep conditions and random seeds.** Publish distributions across demand, direction balance, adoption, latency, correlated outages, pedestrian load, and incidents. Report unsuccessful runs and unfinished-trip backlog. A single seed is a demonstration, not robust evidence.
3. **Use a calibrated simulator and real maps.** Build a [SUMO](https://eclipse.dev/sumo/docs/) adapter with route demand, realistic intersection geometry, turning movements, calibrated car-following, and actuated baseline control. Match model parameters to observed traffic, then test on held-out periods.
4. **Exercise the actual contract.** Serialize UTP fixtures from simulated actors, validate them at receivers, and model jitter, duplication, reordering, sensor uncertainty, and map mismatches. Preserve sender age through gateways. The current visual model uses abstract communication events.
5. **Implement and test one standards adapter.** Start with signal state plus map references or roadside queue observations. Publish the exact source edition, translation losses, authenticity handling, and conformance boundaries.
6. **Evaluate trust and fairness.** Test spoofing, stale data, misbehaving participants, priority abuse, and privacy linkage. Track side-street wait, crossing service, accessibility, and manually driven vehicles alongside total throughput.
7. **Build a laboratory safety case.** Hardware-in-the-loop testing requires independently enforced interlocks, authenticated authority, explicit failure modes, and jurisdiction-specific review. A simulator pass does not authorize deployment on a road.

## A practical first pilot

A research pilot can use one simulated corridor with a gateway that accepts queue observations and publishes signal state. The protocol observer records whether information is fresh and accepted; an independent controller owns signal decisions. Baseline and cooperative runs receive the same travel demand. Raw traces, configuration, failed experiments, and analysis should be published together.

Start with a measurable improvement in a constrained experiment. Expand the scope when evidence supports it.
