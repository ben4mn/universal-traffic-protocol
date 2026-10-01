import type {
  IntersectionSnapshot,
  RoadSnapshot,
  Scenario,
  SimulationSnapshot,
} from "./simulation";

export type Approach = "north" | "east" | "south" | "west";

export interface ScenarioDefinition {
  id: Scenario;
  title: string;
  location: string;
  streets: { horizontal: string; vertical: string };
  setup: string;
  microFocus: { x: number; y: number; span: number };
  focusIntersectionId: string;
  focusRoadId?: string;
  startSeconds: number;
  eventSeconds?: number;
  micro: { isolated: string; connected: string; watchFor: string };
  macro: { isolated: string; connected: string; watchFor: string };
}

/** Names belong to this fictional street grid; the positions match the engine. */
export const SCENARIOS: Record<Scenario, ScenarioDefinition> = {
  rush: {
    id: "rush",
    title: "Rush hour on Market Street",
    location: "Market Street × Oak Avenue",
    streets: { horizontal: "Market Street", vertical: "Oak Avenue" },
    setup:
      "More cars are crossing town east–west than north–south. Start at Market and Oak: does the light give its green time to the street that needs it?",
    microFocus: { x: 500, y: 500, span: 440 },
    focusIntersectionId: "i11",
    startSeconds: 60,
    micro: {
      isolated:
        "This light alternates between Market and Oak on a fixed schedule, whatever the queues look like.",
      connected:
        "If this light is equipped and reports arrive, it can adjust green time to the traffic approaching it.",
      watchFor:
        "Compare the cars waiting on each approach with the street that has a green light.",
    },
    macro: {
      isolated:
        "Every light follows its own fixed schedule. A queue can build at the next block even after cars leave this one.",
      connected:
        "Equipped lights consider approaching cars and crowded roads ahead. New equipped cars can also choose a route using recent road reports.",
      watchFor:
        "Watch where queues build across all nine junctions. Then compare finished trips and the total number waiting.",
    },
  },
  school: {
    id: "school",
    title: "Crossing Oak Avenue after school",
    location: "School Street × Oak Avenue",
    streets: { horizontal: "School Street", vertical: "Oak Avenue" },
    setup:
      "Cars are heading toward the school end of Oak Avenue. At 42 seconds into the run, people get nine seconds to cross. Cars at this junction must wait in both cities.",
    microFocus: { x: 500, y: 220, span: 440 },
    focusIntersectionId: "i01",
    startSeconds: 38,
    eventSeconds: 42,
    micro: {
      isolated:
        "The crossing stops every approach. After it ends, this light continues its fixed schedule.",
      connected:
        "The crossing stops every approach here too. An equipped light can respond to the queues before and after people cross.",
      watchFor:
        "Watch the countdown, then the full nine-second crossing. Compare which queue gets moving afterward.",
    },
    macro: {
      isolated:
        "More trips finish at the north end of Oak Avenue. Queues near the crossing can reach the next junction.",
      connected:
        "Shared reports can change signal timing and routes, but there is still only one lane leading to the school exit.",
      watchFor:
        "Follow the queue south along Oak Avenue. Increase demand and see when either city runs out of room.",
    },
  },
  incident: {
    id: "incident",
    title: "Roadworks on Market Street",
    location: "Market Street, east of Oak Avenue",
    streets: { horizontal: "Market Street", vertical: "Oak Avenue" },
    setup:
      "At 45 seconds into the run, roadworks slow the eastbound block of Market Street. Cars can still pass, but only at about 10 km/h. The same restriction applies in both cities.",
    microFocus: { x: 630, y: 500, span: 600 },
    focusIntersectionId: "i11",
    focusRoadId: "i11>i12",
    startSeconds: 40,
    eventSeconds: 45,
    micro: {
      isolated:
        "Cars entering this block slow down. With no shared road report, new arrivals still plan an ordinary shortest route.",
      connected:
        "The block is just as slow. Once a fresh report arrives, new equipped cars can choose another route before entering the city.",
      watchFor:
        "Watch the eastbound lane fill, then check the cars waiting to enter the block.",
    },
    macro: {
      isolated:
        "A slow block can hold up cars at the junction behind it. The queue may spread farther than the obstruction itself.",
      connected:
        "Some new arrivals may use School Street or River Street instead. Those streets have limited room too.",
      watchFor:
        "Compare the slowed block with its parallel streets. Does moving traffic around it relieve the queue or move the problem?",
    },
  },
};

export interface ScenarioInspection {
  definition: ScenarioDefinition;
  intersection: IntersectionSnapshot;
  approachQueues: Record<Approach, number>;
  focusQueue: number;
  inboundOccupancy: number;
  outboundOccupancy: number;
  focusRoad?: RoadSnapshot;
  protectedCrossing: {
    active: boolean;
    remainingSeconds: number;
    nextInSeconds: number;
  } | null;
  restriction: { active: boolean; startsInSeconds: number } | null;
  network: {
    queuedIntersections: number;
    fullRoads: number;
    busiestIntersection: IntersectionSnapshot;
  };
}

function approachForRoad(road: RoadSnapshot): Approach {
  // Screen coordinates increase southward. An approach names where cars came from.
  const dx = Math.cos(road.heading);
  const dy = Math.sin(road.heading);
  if (Math.abs(dx) > 0.5) return dx > 0 ? "west" : "east";
  return dy > 0 ? "north" : "south";
}

/** Local details and network counts are read from the same live simulation state. */
export function inspectScenario(
  snapshot: SimulationSnapshot,
): ScenarioInspection {
  const definition = SCENARIOS[snapshot.config.scenario];
  const intersection = snapshot.intersections.find(
    (node) => node.id === definition.focusIntersectionId,
  );
  if (!intersection)
    throw new Error(
      `Missing scenario junction: ${definition.focusIntersectionId}`,
    );
  const incoming = snapshot.roads.filter((road) => road.to === intersection.id);
  const outgoing = snapshot.roads.filter(
    (road) => road.from === intersection.id,
  );
  const approachQueues: Record<Approach, number> = {
    north: 0,
    east: 0,
    south: 0,
    west: 0,
  };
  for (const road of incoming)
    approachQueues[approachForRoad(road)] += road.queue;
  const focusRoad = definition.focusRoadId
    ? snapshot.roads.find((road) => road.id === definition.focusRoadId)
    : undefined;

  // The engine protects [42, 51), [84, 93), ... after its startup guard.
  const crossingCycle = snapshot.time % 42;
  const protectedCrossing =
    definition.id === "school"
      ? {
          active: intersection.pedestrian,
          remainingSeconds: intersection.pedestrian ? 9 - crossingCycle : 0,
          nextInSeconds: intersection.pedestrian ? 0 : 42 - crossingCycle,
        }
      : null;
  const restriction =
    definition.id === "incident"
      ? {
          active: focusRoad?.disrupted ?? false,
          startsInSeconds: Math.max(0, 45 - snapshot.time),
        }
      : null;

  return {
    definition,
    intersection,
    approachQueues,
    focusQueue: incoming.reduce((sum, road) => sum + road.queue, 0),
    inboundOccupancy: incoming.reduce((sum, road) => sum + road.occupancy, 0),
    outboundOccupancy: outgoing.reduce((sum, road) => sum + road.occupancy, 0),
    focusRoad,
    protectedCrossing,
    restriction,
    network: {
      queuedIntersections: snapshot.intersections.filter(
        (node) => node.queue > 0,
      ).length,
      fullRoads: snapshot.roads.filter(
        (road) => road.occupancy >= road.capacity,
      ).length,
      busiestIntersection: snapshot.intersections.reduce((busiest, node) =>
        node.queue > busiest.queue ? node : busiest,
      ),
    },
  };
}
