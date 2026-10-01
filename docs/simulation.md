# A small city, measured honestly

The live laboratory compares two deterministic traffic engines receiving the **same travelers**, at the same requested arrival times, with the same origins and destinations. The numbers on the page are calculated from cars moving through finite road lanes. There is no adoption-to-savings formula.

This is a teaching model and an executable hypothesis. It is not a calibrated traffic forecast, an autonomous-driving stack, or evidence that a particular protocol eliminates congestion. The connected experiment changes information availability, signal control, and some routing together. A real evaluation would separate those interventions, compare with existing adaptive signal controllers, and validate against measured traffic.

## The physical city

- Nine intersections form a 3 × 3 grid. Neighboring intersection centers are 100 m apart. Twelve boundary portals supply and receive travelers. Roads have one lane in each direction, with right-hand traffic.
- A car is represented by its center on a directed lane. Vehicle length is 4.5 m, the standstill gap is 2.5 m, the moving time headway is 1.1 s, and the normal maximum speed is 11.1 m/s (about 40 km/h). Vehicles accelerate at up to 2.4 m/s². Approaching a constraint reduces the target speed using a simplified braking rule.
- Lanes have finite storage. A car can enter the next lane only if its upstream end has at least 7 m of space. A full downstream lane blocks the junction release and can send a queue back into the previous intersection. Demand that cannot enter the map waits at the boundary and remains in the traveler accounting.
- Traffic lights authorize the approach direction. Each junction additionally admits one vehicle at a time, reserving 0.95 s to traverse the intersection. This conservative abstraction avoids modeling detailed conflicting-turn movements. Two seconds of actual all-red clearance separate phase changes, including a return from adaptive control to the fixed program. The guard uses the previous actual green rather than assuming that an adaptive signal followed the clock program. These physical gates apply equally to equipped and unequipped vehicles.
- The engine uses a fixed 100 ms integration interval. Rendering speed does not change the experiment. The diagram uses a 1000 × 1000 coordinate system; coordinates are converted into physical distances inside the engine.

The simplified following rule is:

```text
available gap = leader position − follower position − 7 m
target speed = min(speed limit, available gap / 1.1 s, sqrt(2 × 4 m/s² × stopping distance))
advance = min(available gap, speed × 0.1 s)
```

The front car uses distance to the stop line instead of distance to a leader. A permitted junction release extends its stopping target beyond that line. Junction travel is drawn as a short interpolation between the two lane ends, while the downstream lane is already reserved.

## Matched demand

Each portal has its own seeded pseudorandom arrival stream, using exponentially distributed interarrival times. Random draws used for traveler demand never depend on communication successes, adoption, or routing decisions. Connection assignment and packet delivery use separate deterministic hashes. This keeps the paired demand identical even when the two cities diverge.

The demand slider scales arrival rates; it does not scale vehicle speed or invent congestion. At a demand factor of 1, the rush scenario requests approximately 1.8 vehicles per second across the whole network. Its horizontal demand is heavier than its vertical demand. Some routes cross the city directly, and others turn toward a different boundary destination.

## Isolated and connected control

The isolated baseline always follows a 36 s fixed signal program: 16 s north–south green, 2 s all-red, 16 s east–west green, and 2 s all-red. Intersections have spatial timing offsets. This baseline is deliberately transparent; it is not the best existing traffic-control system.

The adoption control assigns both vehicles and intersections deterministically to the network. At 80% adoption, a particular small seed may equip seven of nine intersections rather than a fractional 7.2. Unequipped intersections retain the fixed program. Unequipped vehicles obey the same lights and can benefit from better local control without sending messages themselves.

Equipped intersections receive one representative detector observation per second and attempts from nearby equipped vehicles. Packet delivery is sampled independently at the configured loss rate. A delivered detector observation refreshes the full aggregate queue-pressure estimate. If that detector packet is lost but vehicle beacons arrive, the controller estimates the approaching population by dividing delivered beacon weights by the configured equipment penetration. This sample can underestimate demand under packet loss and omits the downstream subtraction when the detector report is absent. It is an explicit simplification of sensor fusion, rather than giving each vehicle magical access to the whole queue. Reports expire after 3 s. With no fresh observations, the controller uses the fixed program, retaining phase-change clearance. With 100% packet loss, the model reproduces baseline motion exactly.

With fresh observations, each equipped controller compares the pressure of the two approaches:

```text
pressure(axis) = max(0, approaching load(axis) − 0.35 × downstream occupancy(axis))
approaching load = 1 per vehicle in the last 50 m, otherwise 0.3 per vehicle
```

After a minimum 6 s green, a phase may switch when opposing pressure exceeds current pressure by more than one vehicle. A waiting opposing approach is served after at most 26 s green. All-red clearance still applies. This encourages serving an actual queue and avoids feeding a crowded downstream road. It is a simple controller inspired by queue-pressure reasoning, not a validated implementation of a specific published controller.

Equipped drivers choose routes using shortest-path search over the directed graph. Where a fresh road observation exists, the advisory cost includes reported lane occupancy and the known incident penalty. A successfully delivered detector report supplies adjacent-lane observations; delivered vehicle beacons can supply a sampled observation of their own lane when the detector report fails. Route costs read those delivered, expiring observations rather than the engine's otherwise omniscient lane state. Unequipped drivers choose a shortest uncongested route. Routing takes place when a vehicle enters the map; vehicles do not continuously reroute. Guidance cannot waive a red signal, a pedestrian closure, lane headway, or downstream storage.

Lime network links illustrate connectivity on the page. The engine also exposes telemetry for communication attempts and controller decisions. The rendered links are illustrative, and the engine telemetry is a record of this model's observations and decisions rather than proof of conformance to the protocol JSON schema. The simulation explores why interoperable observations might help; it does not implement a network transport or a production negotiation mechanism.

## Scenarios

| Scenario | Physical experiment                                                                                                         | What coordination can change                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rush     | Uneven horizontal demand and variable arrivals                                                                              | Green time can follow queues, and equipped drivers can consider reported occupancy.                                                                                   |
| School   | More trips toward the north-center exit; pedestrians close its intersection for 9 s in recurring 42 s windows after startup | The same signal controller and route advice respond to resulting queues. Pedestrian right of way is identical in both cities. The exit bottleneck can still saturate. |
| Incident | After 45 s, the center-to-east middle lane slows to 2.8 m/s and admits cars with a 3.4 s junction interval                  | Fresh advisory observations can cause equipped drivers to choose an alternative route. The obstructed lane remains physically slow.                                   |

These scenario names represent synthetic cases. School crossings are deterministic, not a person-detection model; the incident is a sustained restriction, not a detailed accident model. The school junction stops admitting cars 0.95 s before each protected pedestrian window so that any prior traversal finishes first. The scheduled pedestrian windows remain nine seconds in both cities.

## Reading the measurements

- **Completed trips** are vehicles that actually leave through their intended destination. `generated = completed + on-map + waiting outside` at every instant.
- **Mean travel time** is measured from the originally requested arrival time until exit. It includes waiting outside the map.
- **Mean delay** is completed travel time minus that traveler's shortest uncongested reference trip, including nominal intersection traversal. The reference is computed without connected routing penalties, so detours count toward delay. This value is reported for completed trips only.
- **95th-percentile travel time** is the nearest-rank percentile of completed trips. It is not a guarantee for travelers still in a queue.
- **Queue** counts on-map cars slower than 0.5 m/s, excluding cars traversing an intersection, plus all travelers waiting outside.
- **Throughput** is destination exits per simulated minute over the trailing 60 s. Before the first minute, the count is normalized by elapsed time.
- **Total accumulated delay** combines completed-trip delay with delay so far for active and boundary-waiting travelers. Active delay subtracts free-speed traversal of distance already covered and nominal junction-traversal time from elapsed time. It also captures slow motion rather than only stopped time.
- **Packet counters** record deterministic delivery attempts, delivered attempts, and dropped attempts. **Dispatches** count adaptive phase-change decisions. Neither counter confers physical safety authority.

Completed-trip averages have a selection effect: a controller can finish its easy trips while leaving difficult trips waiting. Inspect completed trips, queue, and accumulated delay together. The initial warmup exists to allow vehicles to traverse the network, not to guarantee favorable results.

## Limits and falsifiable next steps

Communication cannot increase finite road storage, remove an exit bottleneck, or create pedestrian-free crossing time. More adoption does not guarantee monotonically better results for every seed, scenario, time window, or metric. Severe school demand can gridlock either city, and a simple adaptive controller can perform worse than the baseline. That is a result to investigate, not a number to hide.

The model omits detailed turning lanes, continuous intersection trajectories, human driver variability, multimodal demand, emissions, bus priority, parking search, emergency vehicles, adversarial messages, real radio propagation, authentication costs, and uncertain or incorrect observations. It represents loss and expiry, but not cyber-physical security. Vehicle motion is schematic and the controller parameters are chosen for an explorable small grid.

Useful next experiments are multi-seed confidence intervals, demand sweeps, comparisons against adaptive controllers without intercity communication, separate signal-only and routing-only interventions, queue-estimate error, stale or malicious data, unequal access to connectivity, and calibration using an established traffic simulator. An experimental protocol should disclose adverse results as well as improvements.

## Executable checks

`tests/simulation.test.ts` verifies deterministic integration and reset; identical traveler generation; exact equivalence at zero adoption and complete packet loss; baseline independence from network controls; traveler conservation; finite values and map bounds; finite lane capacity and minimum headway under heavy demand in all scenarios; demand-dependent saturation; actual two-second all-red clearance during partial-loss fallback; no overlap between an existing vehicle traversal and a protected pedestrian window; and a measured improvement in the reference rush experiment. The final check is a regression result for that synthetic case, not a general claim about connected traffic.
