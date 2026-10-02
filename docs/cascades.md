# Can a small slowdown become a citywide jam?

Yes. A short interruption can trigger much more delay than the interruption itself. There is experimental evidence that some of that amplification can be prevented. The stronger claim—that enough communication will eliminate congestion in every city—is false when sustained demand exceeds the network's physical capacity.

The useful version of the idea is this: **sharing timely information can help controllers keep a temporary problem from becoming a lasting one.** Whether that happens depends on the control policy, the road network, the demand, and the information received. An open protocol could make those policies easier to use across cars and city equipment. The protocol alone does not provide the policy or prove its performance.

## Two different chains

On an interstate, a driver brakes, the following driver reacts a little later and brakes harder, and the next driver does the same. The disturbance travels backward while the vehicles travel forward. Researchers call a following policy *string stable* when disturbances do not amplify along the vehicle string. A jam can form even without a crash or a lane closure: Sugiyama and colleagues demonstrated this with 22 cars on a 230 m circular track. Small fluctuations grew into a backward-moving stop-and-go wave. That experiment established the mechanism under controlled conditions, not the share of a city's congestion caused by it. [Sugiyama et al., 2008](https://ir.library.osaka-u.ac.jp/repo/ouka/all/93262/NewJPhys_10_033001.pdf).

In a city, the chain can be about space rather than reaction time. A queue fills a block. Cars cannot leave the upstream junction, even when its light is green. Another approach backs up, then another. An exit ramp can carry that queue back onto the freeway. Giving one junction more green may make the downstream blockage worse. Daganzo's network cell-transmission model represents moving queues through vehicle conservation and downstream receiving limits; it was developed to capture spillback and its dissipation. [Daganzo, 1994](https://escholarship.org/content/qt9pz309w7/qt9pz309w7.pdf).

A model of queues and finite blocks can test the second chain. It does not, by itself, test the first. An interstate brake-wave experiment also needs a following model with acceleration, reaction or actuator delays, and disturbances whose amplification can be measured. Drawing a freeway on a queue model does not turn it into a string-stability test.

## What has already been shown

**A small number of controlled vehicles can dampen a wave.** Stern and colleagues tested a fleet of 22 vehicles on a circular track. Controlling one vehicle reduced the stop-and-go motion that otherwise emerged. The track isolated car-following behavior: it had no freeway merges, lane changes, or competing routes. It is strong evidence for a local mechanism, with much narrower conditions than a metropolitan rush hour. [Stern et al., 2018](https://arxiv.org/abs/1705.01693).

**Automation can also amplify a wave.** Gunter and colleagues examined seven commercially available 2018-model adaptive cruise control systems. All seven fitted models were string unstable. In a platoon experiment, a 6 mph speed disturbance grew to roughly 25 mph by the last vehicle, where ACC disengaged. Those findings concern the systems tested at that time; they are not a claim about every current vehicle. They show why controller design matters as much as equipment adoption. [Gunter et al., 2020](https://arxiv.org/abs/1905.02108).

**The idea has reached an actual interstate.** The CIRCLES team deployed 100 vehicles on I-24 near Nashville in November 2022. A shared speed planner sent targets over LTE to vehicle-specific local controllers, using a mixed fleet. The authors reported examples of wave damping, while explicitly observing that traffic waves remained. This demonstrates a route from small experiments to cross-manufacturer freeway control; it does not establish a universal percentage reduction in citywide congestion. [Lee et al., open manuscript, 2024](https://arxiv.org/html/2402.17043v1#S24).

**Controlling entry can help the whole corridor.** In the Twin Cities, 430 ramp meters were switched off for a 2000 evaluation. FHWA reports 22% longer freeway travel times and 9% lower freeway volume without the meters. The later operating changes included queue and wait limits, so keeping the freeway moving would not simply leave ramp users waiting indefinitely. This is evidence for the value of coordinating arrivals at a real bottleneck. It was an observational before/after evaluation, not a UTP trial or a guarantee that metering improves every trip. [FHWA account of the MnDOT evaluation](https://ops.fhwa.dot.gov/bn/resources/case_studies/minnstp_mn.htm).

**Citywide flow depends on how crowded the network is.** Geroliminis and Daganzo combined detector and taxi data in Yokohama and found a comparatively stable relationship between aggregate vehicle density, speed, and flow over the study area. This supports measuring a neighborhood's accumulated traffic, rather than treating every junction separately. It does not mean every city has the same curve or the same congestion threshold. [Geroliminis and Daganzo, 2008](https://its.berkeley.edu/node/4651).

Finite storage matters in the mathematics too. Gregoire and colleagues showed how ordinary back-pressure control can fail when queues have finite capacity, and proposed a capacity-aware version. Their performance comparisons were simulations. A stability guarantee that assumes infinite storage should not be presented as proof that real blocks cannot fill up. [Gregoire et al., revised 2014](https://arxiv.org/abs/1309.6484).

## What changes when every car is autonomous?

The ambition can go beyond adapting today's lights. A controller can schedule individual vehicle trajectories, permitting compatible movements together instead of reserving the whole junction for one movement. That can increase the junction's usable capacity without adding pavement.

Dresner and Stone's Autonomous Intersection Management research established a reservation approach: a vehicle requests a crossing time and supplies motion and size information; a manager checks whether its occupied space-time conflicts with existing reservations. Their evaluations were simulations. They also described spatial and timing buffers for sensor and actuator error, and extra protection where vehicles leave into the same lane. [Dresner and Stone, 2008](https://www.cs.utexas.edu/~aim/papers/JAIR08-dresner.pdf).

Consider three vehicles that have already come to a full stop at three different approaches. In right-hand traffic, three right turns can occupy three different corners and leave through three different lanes. If each vehicle's entire swept footprint, including its safety margin, stays in its own corner, their movements need not be serialized. The useful proof is geometric: the occupied regions remain disjoint throughout the motion. Three centerlines that look separate are insufficient; cars have width and length, and rotate as they turn. A crossing-straight case needs a different schedule because the occupied paths overlap.

This illustrates the opportunity in the user's three-car example. A full stop does not mathematically require a junction to have only one moving car. Comparing it with a conservative one-at-a-time policy shows a possible scheduling gain; that policy is not a statement that every real four-way stop legally requires exclusive occupancy.

Reservation policies also need fair service. Au and colleagues showed that a simple first-come-first-served reservation policy can strand side-road traffic under unbalanced arrivals, and studied batch policies that enforce eventual service under stated assumptions. Fast main-road flow is insufficient if another approach cannot get through. [Au, Shahidi, and Stone, 2011](https://www.cs.utexas.edu/~aim/papers/AAAI11-au.pdf).

For the capacity argument below, the relevant limit is the **best sustained discharge achievable with the proposed coordination**, vehicle dynamics, safety margins, and downstream space. Today's human-controlled junction throughput is not an upper bound on a future autonomous junction. Improving that limit makes more demand feasible; it does not make the limit infinite. A deterministic laboratory schedule is a proof of compatibility for its specified geometry and motion, not certification of real vehicle control or permission to disregard a stop sign.

## The part we can disprove with arithmetic

Consider a district with a bridge that can discharge at most 3,000 vehicles an hour. Suppose 3,600 vehicles an hour continually arrive, and every one must cross that bridge. Even a perfect controller leaves at least 600 additional vehicles unfinished each hour. These numbers are a hypothetical example, not measurements of a real bridge.

For a network boundary that includes every waiting traveler:

```text
unfinished(t) = unfinished(0) + requested arrivals(0..t) − completed exits(0..t)
```

If every trip must cross a bottleneck with maximum sustained discharge C, and sustained arrival demand is D > C, then unfinished trips grow by at least `(D − C) × t`, apart from the initial travel transient. A controller can decide where the queue waits, distribute it more fairly, or preserve discharge that poor coordination would otherwise lose. It cannot make those extra trips disappear.

That is a counterexample to complete eradication through communication alone. A new route, a different travel time, fewer vehicle trips, or greater usable transport capacity changes the premise. Communication may help people make those choices, but then the benefit includes a change in demand or capacity.

It is also why the experiment must count people waiting outside the displayed city. A clean freeway paired with an ever-growing ramp queue is not a congestion-free network.

## What a larger experiment needs to test

The following are falsifiable claims, not assumptions to build into a savings formula.

| Case | Claim to test | What would count against it? |
| --- | --- | --- |
| Temporary interruption, spare capacity afterward | Fresh downstream reports and coordinated releases reduce the interruption's accumulated delay and help queues clear sooner. | Equal or greater total delay, slower recovery, or extra waiting shifted to another boundary. |
| Near-capacity network | Avoiding releases into nearly full blocks prevents some secondary blockages and preserves completed trips. | Blockage simply moves elsewhere, completed trips fall, or neglected approaches wait longer. |
| Sustained demand above a binding bottleneck | Coordination can preserve useful flow, but cannot keep all queues bounded while serving unchanged demand. | A result that reports no queue by dropping travelers or excluding outside waiting is an accounting failure. |
| Partial adoption, loss, and stale reports | A controller's benefit survives realistic information gaps and degrades safely when reports expire. | Worse flow under ordinary loss, persistent starvation, or unsafe reliance on stale information. |
| Brake-wave following experiment | A selected vehicle-control policy reduces disturbance amplification across a mixed vehicle string. | Speed or braking disturbances grow downstream in the string, even if one vehicle's own ride is smoother. |

Compare equal road geometry, storage, speed limits, disturbances, requested trips, and random seeds. Include a capable local controller without shared downstream information as well as a simple baseline. Separate signal changes, ramp metering, speed control, and route guidance before combining them. Otherwise a successful combined result cannot tell us which part worked—or how much an open communication layer added.

To test whether a policy contains a particular disturbance, run four matched cases: local control with and without the event, and shared control with and without the event. Subtract each policy's no-event cost from its event cost. Shared control can have lower total cost in the event run while suffering a larger added cost from that event. Comparing the two event runs alone cannot distinguish general efficiency from suppression of the disturbance's chain.

Count accumulated delay for **all** travelers, completed trips, unfinished trips, boundary and ramp waiting, blocked movements, and recovery time. Keep local and network measurements together. Report paired results across demand levels and seeds, including cases where coordination loses. A smoother animation or a lower average for only the easiest completed trips is insufficient.

## What UTP would need to carry

Useful shared information includes downstream occupancy and receiving capacity, queue length and uncertainty, recent discharge, phase plans, expected restrictions, and the age and origin of every observation. A ramp can then respond to the freeway's receiving condition; an upstream signal can avoid sending another platoon into a full block; a vehicle controller can anticipate a slowdown rather than react late.

Quantitative regional reports would require a versioned profile and schema extension, with explicit units, uncertainty, and validation tests. The current queue-observation profile carries a categorical status (`detected`, `blocked`, or `unknown`), position, and confidence; it does not define numeric queue length, road storage, or receiving flow. The model's abstract reports therefore do not establish compatibility with today's wire schema.

Vehicle controllers still need independent sensing and validated safe control. Signal and ramp operators retain their legal authority. Message receipt never grants right of way. The current browser demonstrations use synthetic observations and simplified control, rather than authenticated UTP transport between real devices.

The conclusion justified today is that **some congestion is preventable amplification, and shared information can help suitable controllers prevent it.** How much benefit UTP would add in a particular city remains a question for calibrated simulation, controlled trials, and measured deployments. Complete eradication under unchanged excess demand is ruled out by conservation.
