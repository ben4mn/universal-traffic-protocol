# Universal Traffic Protocol

**What if the whole city could talk?**

UTP is an open research project exploring a common language for vehicles, signals, crossings, roadside sensors, and mobility services. Its ambition is to reduce wasted movement and waiting through useful shared information, while keeping road rules, local safety, and physical capacity explicit.

**[Explore the live city lab](https://ben4mn.github.io/universal-traffic-protocol/)** · **[Read the protocol draft](docs/protocol.md)** · **[Explore the schema](protocol/schema.json)**

The idea began with Ben at age seven. This first public version turns that question into an implementable experimental contract and a transparent, interactive model.

## What is here

- A public, responsive simulation with two views of the same run: a close-up of one junction and a wider view of the nine-junction network. Specific examples follow a morning commute, a nine-second school crossing, and an eastbound lane slowed by roadworks.
- Replay each scene just before its event, watch local queues and signals, then switch to the network view or advance three minutes to inspect the wider effect. Adoption, traffic demand, and packet loss remain adjustable.
- An autonomous-junction experiment schedules the same 24 stopped vehicles using either exclusive or compatible overlapping movements. Try three right turns, crossing paths, mixed turns, larger buffers, incomplete communication and a protected pedestrian window.
- A larger city and freeway experiment tests whether queues spread after a temporary restriction, under steady demand, and when demand exceeds exit capacity. It compares local responsive control with shared downstream information, counting waits on ramps and outside the map.
- A v0.1 protocol draft with seven typed message profiles, explicit units and uncertainty, freshness and replay rules, trust boundaries, privacy principles, capability negotiation, and fallback behavior.
- JSON Schema and simulation fixtures, plus a reference receiver guard that tests structure and message acceptance in simulation or laboratory contexts.
- A [standards map](docs/standards.md) relating the proposal to existing SAE and ETSI work, with primary sources and translation caveats.
- Reproducible [small-city](docs/simulation.md), [regional](docs/regional-model.md) and [junction](docs/autonomous-junction.md) assumptions, [published regional sweeps](docs/regional-results.md), a [research agenda](docs/research-agenda.md), and an [evidence review of congestion cascades](docs/cascades.md).

The site is a running experiment. Displayed savings come from simulated vehicle movement and signal decisions, not a preset percentage. Both modes receive the same requested travelers and random seed. Queues include travelers waiting to enter a full network. Average delay covers completed trips, so it must be read alongside queues and completions.

## Positioning

The field of vehicle-to-everything communication already has substantial standards and deployed work. UTP proposes an approachable, free application contract and reference laboratory, rather than replacing those standards or claiming existing compatibility. No SAE/ETSI gateway is implemented yet.

Communication can remove avoidable waste. It cannot guarantee that traffic disappears, increase physical capacity indefinitely, or establish safe right of way. A message never overrides local perception, road rules, or an infrastructure controller's authority. This v0.1 release is a research prototype with no certified public-road control mode.

**Universal Traffic Protocol** is the working name. Use the full name: the unrelated BitTorrent uTP transport protocol already exists. Here, UTP describes an application contract, independent of its transport.

## Run locally

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, including `/universal-traffic-protocol/`.

```sh
npm run check  # protocol/model tests, TypeScript, production build
npm run preview
npm run benchmark:regional # matched demand, adoption, outage and route sweeps
```

The frontend uses TypeScript and Canvas with Vite. There is no backend, account, tracking, or API key. Google Fonts is optional; local font fallbacks keep the site usable if it is unavailable. When a browser supports the optional WebMCP interface, the page exposes the same read and configuration operations as its visible experiment controls.

## Project map

| Location               | Purpose                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `src/main.ts`          | Page, experiment controls, message explorer                     |
| `src/city.ts`          | Close-up and isometric network views of live model state        |
| `src/scenarios.ts`     | Named scenarios, camera framing, and live local/network details |
| `src/simulation.ts`    | Deterministic traffic model                                     |
| `src/regional.ts`      | Larger finite-storage city/freeway flow model                   |
| `src/regional-view.ts` | Paired regional maps, replay, measurements, and seed comparisons |
| `src/junction.ts`      | Buffered space/time scheduling after a required full stop       |
| `src/junction-view.ts` | Close-up autonomous junction comparison and controls            |
| `src/cascade-evidence.ts` | Field evidence and the demand/capacity counterexample         |
| `scripts/regional-benchmark.ts` | Reproducible paired sweeps and interruption counterfactuals |
| `src/protocol.ts`      | Experimental message receiver and acceptance checks             |
| `protocol/schema.json` | Draft 2020-12 reference message schema                          |
| `protocol/examples/`   | Synthetic fixtures for all message profiles                     |
| `docs/`                | Specification, sources, model, research questions               |
| `tests/`               | Message validation and model invariants                         |

## Contributing

Start with an issue describing a falsifiable claim, interoperability gap, or reproducible failure. For model changes, preserve matched demand and conservation, report queues as well as completed-trip delay, and document new assumptions. For protocol changes, show a valid example, a rejected example, and how a receiver falls back when data is stale or missing. See [CONTRIBUTING.md](CONTRIBUTING.md).

GitHub Actions checks each pull request. Passing commits to `main` deploy to GitHub Pages automatically. Source, protocol text, and fixtures are released under the [MIT license](LICENSE); referenced external standards retain their own licenses.
