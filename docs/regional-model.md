# A city and freeway, with every waiting trip counted

This experiment extends the nine-junction demonstration with 35 junctions, one eastbound freeway, and three pairs of ramps. It tests a queue filling a road and constraining roads upstream. It does not simulate drivers amplifying a brake tap, lane changing, or autonomous vehicles negotiating individual trajectories. See the separate [evidence review](cascades.md) for those mechanisms.

## Roads and trips

The fictional network has a 5 × 7 grid of bidirectional streets, seven freeway nodes, eleven city arrival sources and one freeway source. Trips follow fixed routes to five eastern city outlets or the eastern freeway outlet. Those outlets form a cut that every trip must cross.

Each directed road is a fluid cell: vehicle mass can be fractional as groups move between cells. Street cells are 250 m long, hold at most 50 vehicles, pass at most 0.55 vehicles/s, and have a 20 s free-flow time. Freeway cells are 400 m, 95 vehicles, 1.7 vehicles/s, and 16 s. Ramps are 200 m, 36 vehicles, 0.38 vehicles/s, and 20 s. These are chosen model parameters, not measurements of a city or its lanes. One cell per road produces a coarse, diffusive flow approximation; it does not guarantee an individual vehicle's minimum traversal time.

At each two-second step:

```text
sending rate = min(effective capacity, current occupancy / free-flow time)
receiving rate = min(effective capacity,
                     (storage − current occupancy) / backward-travel time)
backward-travel time = (storage − nominal critical occupancy) / nominal capacity
nominal critical occupancy = nominal capacity × free-flow time
```

Receivers split their available flow proportionally among requests. Each route retains its destination, and the transfer is subtracted from one cell and added to its next cell, or counted as a completed trip at its designated outlet. Sending, receiving and storage limits apply identically to both strategies. Trips unable to enter wait at their source, with no dropped demand.

Route commodities mix within a link. A blocked turn does not block every other commodity in that link. This partial FIFO approximation can understate blockage in a single shared turning lane. The model also omits intersection-box occupancy, detailed turn conflicts, pedestrians and individual vehicle trajectories. The original small-city model has a protected crossing scenario; this regional model has no pedestrian protection claim.

Arrival counts are Poisson draws from the same seeded demand stream. Origin and destination draws are independent of control and communication. The default routes assign freeway-to-city trips to three off-ramps; equal-time city routes turn toward the destination row there. An alternative `lastRamp` pattern uses shortest free-flow routes that concentrate those trips at the last ramp. Both patterns are held fixed between controllers. The concentrated case is included in the [published sweep](regional-results.md), including adverse results.

## What the two controllers know

Local control already responds to actual approach occupancy. Signals have a ten-second minimum green, forty-second maximum green while the opposing pressure is positive, and two seconds of all-red. The maximum applies to a phase's pressure, not an independently tracked oldest traveler; this is not an individual fairness guarantee. Physical receiving limits prevent either controller from overfilling a road.

Shared control discounts approach pressure when a reported downstream link is crowded and meters an on-ramp when its receiving freeway segment exceeds critical occupancy. It combines two changes: downstream-aware signal selection and ramp release control. An improved combined result cannot isolate the value of each change, the message format, or an open protocol.

Reports describe outgoing road occupancy. Equipped controllers attempt reports every six seconds; successful reports arrive two seconds after observation and expire twelve seconds after observation. Packet loss uses a separate seeded stream. Missing or expired reports use the local policy exactly. Zero adoption and full outage reproduce local physical results. The regional adoption slider equips both junction controllers and freeway ramp controllers, rather than individual vehicles.

These reports are abstract information exchanges. UTP v0.1 does not yet encode their quantitative occupancy, storage, and receiving-flow fields. A versioned profile and actual receiver integration are required before wire interoperability can be tested.

## Three cases, and a necessary counterfactual

- **A short slowdown:** from minute 5 through minute 9, the terminal freeway exit falls from 1.7 to 0.25 vehicles/s. Its receiving road and upstream freeway segments can fill. The physical restriction is identical in both strategies.
- **Rush hour:** the same default requests continue without that restriction. This is also the no-interruption counterfactual for the first case.
- **Excess demand:** requests are 2.5 times the default rate, before applying the demand slider. Nominal demand is 5.675 vehicles/s versus an aggregate maximum outlet rate of 4.45 vehicles/s. That implies at least 73.5 additional unfinished vehicles per minute in expectation, even under ideal control. Random finite runs use the exact bound `max(0, generated − 4.45 × elapsed seconds)`.

Demand below the aggregate outlet bound can still exceed an individual route, ramp, or signal bottleneck. Demand above it is impossible to serve indefinitely without changing a premise. The bound is a maximum within this model, including ideal use of its configured capacities. It is not a claim that today's observed road throughput is the best possible autonomous throughput.

To test containment of the interruption, use four matched runs: local with and without the restriction, and shared with and without it. Calculate the interruption's added total trip time within each policy. Compare those increments. The current default policy improves overall total time but has a larger interruption-specific penalty. It therefore does not establish that this policy dampens that cascade. The [reproducible results](regional-results.md) retain that finding.

The model has no endogenous freeway capacity-drop state, human reaction delay or string-instability mechanism. It cannot establish that automated cruise control eliminates phantom jams. Metering may simply relocate some waits, which is why the maps and accounting include ramps and outside holding.

## Reading the live page

The page computes a complete thirty-minute paired run, then lets the viewer scrub or play its saved snapshots. Controls reconstruct both runs from empty state with seed 7. Changing the viewed time changes the camera's point in that run, not the trajectories or results. The final conclusion is explicitly labeled at thirty minutes. The separate three-seed check uses seeds 7, 19 and 41 and reports the observed range; that range is not a confidence interval.

- **Estimated congestion queue:** outside holding plus each cell's occupancy above its *nominal* critical occupancy. It is not a count of stopped individual cars and is not recalibrated when the exit restriction changes capacity.
- **Vehicle-minutes:** the time integral of all unfinished vehicle mass, including moving vehicles and outside waiting. The trapezoidal two-second integration includes the initial travel transient. It is total trip time in the observed window, not pure delay or finished-trip average travel time.
- **Trips finished:** mass that passed its intended terminal outlet. Conservation is `generated = finished + on network + waiting outside`.
- **Crowded links:** occupancy at least 80% of storage. This is a warning threshold, not a measured count of blocked junction movements.
- **Map color:** occupancy divided by storage. Outside queue bubbles are source-specific. The freeway restriction is marked at the actual eastern freeway exit.

Download the current timeline or the three-seed measurements as CSV. Run `npm run benchmark:regional` for demand, adoption, loss and route-concentration sweeps. Tests check conservation, finite storage, sending/receiving limits, matched demand, exact fallback, delayed/expiring information, outlet bounds and an upstream queue response to the restriction. No regression test requires the shared controller to win.
