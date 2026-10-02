# Three cars can move after all three have stopped

Yes, compatible movements can overlap. Three right-turning vehicles can use three different corners and three different exit lanes at the same time. Their full vehicle footprints, margins, timing, and downstream space must remain compatible. Counting cars in the junction is less informative than checking which space each one occupies and when.

This is related to autonomous intersection management: Dresner and Stone proposed reserving space and time for vehicles, with an intersection manager checking trajectories before confirming requests. Their performance results were simulations, not a guarantee for public intersections. [Primary paper, 2008](https://www.cs.utexas.edu/~aim/papers/JAIR08-dresner.pdf).

## What the demonstration compares

Both policies receive the same 24 requests, approach directions and turning intentions. Every vehicle comes to a full stop for at least one second before entering. The conservative baseline admits one vehicle at a time. The coordinated policy can admit overlapping movements when their buffered trajectories are compatible. A real four-way stop is not legally or physically defined by this artificial one-at-a-time baseline; existing road rules may already allow some concurrent movements.

The default scene pauses while three right-turning cars are moving in the coordinated junction and one is moving in the conservative junction. Switch to crossing straight paths or mixed turns, increase the margin, remove participation, drop messages, or add a protected crossing window. The displayed wait and finish-time measurements come from the resulting schedules, not a multiplier based on the number of connected cars.

## Geometry and motion

Coordinates are metres relative to the junction centre. Approaches use right-hand lanes offset 1.8 m from their road centreline. Stop-line vehicle centres sit 14 m from the centre. The scene has a deliberately roomy paved central area; it is not a surveyed public junction.

Vehicles are 4.5 m long and 1.9 m wide. Reservation footprints add the selected spatial margin on every side and an additional 0.25 m numerical margin. After the mandatory stop, motion accelerates at 2 m/s², capped at 6 m/s for straight paths and 3 m/s for curved paths. The lower turn speed keeps the tightest right-turn curve near 2 m/s² of lateral acceleration. Paths are sampled by distance, so path length affects traversal time. Followers must become the front vehicle before satisfying their own stop dwell; they do not all claim to have stopped at the same line while stacked on top of one another.

The planner checks rotated rectangles along each candidate trajectory against previously scheduled moving trajectories. It searches entry times in 0.05 s increments and samples occupancy every 0.025 s. The selected buffer applies to moving trajectory pairs; it is not a localisation-error guarantee for stopped cars in adjacent opposing lanes. Tests also check actual moving bodies against the visible stopped front vehicles. The numerical margin is an extra conservative allowance, not a certified bound on all continuous motion or controller error. Tests use a separate, finer geometric sampling check. The model omits steering-rate limits, tyre dynamics, localisation failures, timing deviations and unpredictable participants. These omissions prevent any public-road safety claim.

## Agreement and fallback

Participation and message success determine which vehicles may use overlapping reservations. An incomplete agreement never permits a vehicle to share the junction: it receives an exclusive traversal and cannot overlap other scheduled vehicles. The model does not execute an authenticated network protocol or test real message delays. It assumes a known, offline schedule and vehicles that follow their assigned trajectories exactly.

The pedestrian option reserves the junction for seven seconds beginning at second 12, repeating every 30 seconds. Vehicle traversals may not overlap those windows in either policy. Exit trajectories and their overlap are checked within the modelled area, but exits lead to empty roads; there is no downstream queue. Feeding this junction into a full road would remove that assumption and can remove its throughput gain.

## What this establishes

The default schedule is a constructive example of three compatible cars moving at once after a stop in this geometry. It supports the user's proposed mechanism. A lower time to finish these 24 trips demonstrates a scheduling benefit for this arrival and turn pattern. It does not establish maximum sustained capacity, a universal multiplier, or whole-city congestion removal. A finite batch from an empty junction is different from a continuously saturated junction.

Fully autonomous control can increase usable capacity by overlapping compatible movements and reducing avoidable idle time. The best achievable capacity still depends on geometry, vehicle dynamics, uncertainty margins, pedestrian service and exit receiving space. The regional model holds its cell capacities fixed; it does not automatically credit the capacity increase from this separate junction experiment. Combining them requires a calibrated junction discharge model and another matched test.

UTP v0.1 `coordination_offer` messages only describe advisory laboratory ordering at a resource. They do not encode swept trajectories, reserve intersection space, or grant right of way. This demonstration motivates a future versioned trajectory-reservation profile, confirmation and cancellation semantics, clock/error budgets, infrastructure authority, and independently enforced safety interlocks. See the [protocol draft](protocol.md) and [cascade evidence review](cascades.md).
