/** Research-only receiver guard. Authentication is supplied by the transport, never by JSON. */
export const PROFILES = [
  "presence",
  "observation",
  "intent",
  "infrastructure_state",
  "coordination_offer",
  "coordination_ack",
  "capabilities",
] as const;

export type Profile = (typeof PROFILES)[number];
export type Mode = "simulation" | "laboratory";
export interface Position {
  lat: number;
  lon: number;
  horizontal_uncertainty_m: number;
}
export interface MapRef {
  namespace: string;
  map_id: string;
  revision: string;
  lane_id?: string;
}
export interface UtpMessage {
  utp: "0.1";
  type: Profile;
  message_id: string;
  sender: {
    session_id: string;
    kind: "vehicle" | "infrastructure" | "sensor" | "service";
  };
  sequence: number;
  sent_at_ms: number;
  ttl_ms: number;
  clock_uncertainty_ms: number;
  scope: { center: Position; radius_m: number };
  security: {
    binding: "simulation" | "external";
    credential_ref?: string;
    standard?: string;
  };
  body: Record<string, unknown>;
}
export interface Verification {
  /** A transport verifier authenticated the complete envelope, including body and session. */
  verified: boolean;
  /** Verified pseudonym credential identity; this need not identify a person or vehicle. */
  credentialIdentity: string;
  allowedProfiles: readonly Profile[];
  /** Exact resourceKey values, bound to jurisdiction, map, revision, and resource. */
  controlledResources: readonly string[];
}
export interface Receipt {
  receivedAtMs: number;
  clockUncertaintyMs: number;
  localPosition: Position;
  /** Assigned by the trusted transport; not copied from a message's sender field. */
  ingressId: string;
  verification?: Verification;
}
export type Rejection =
  | "parse"
  | "budget"
  | "schema"
  | "binding"
  | "authentication"
  | "permission"
  | "clock"
  | "expired"
  | "future"
  | "out_of_scope"
  | "map"
  | "semantic"
  | "replay"
  | "duplicate"
  | "capacity"
  | "coordination"
  | "unsupported"
  | "rate";
export type ReceiveResult =
  | { accepted: true; message: UtpMessage }
  | { accepted: false; reason: Rejection };
export interface ReceiverOptions {
  mode: Mode;
  /** Inject a validator compiled from protocol/schema.json, e.g. AJV Draft 2020-12. */
  validateSchema: (message: unknown) => boolean;
  resolveMap: (map: MapRef) => boolean;
  supportedProfiles?: readonly Profile[];
  maxSessions?: number;
  maxMessagesPerSession?: number;
  maxMessagesPerSecond?: number;
}

const MAX_BYTES = 32768;
const REPLAY_RETENTION_MS = 60000;
const MAX_CLOCK_ERROR_MS = 100;
const TTL: Record<Profile, number> = {
  presence: 1000,
  observation: 1000,
  intent: 2000,
  infrastructure_state: 60000,
  coordination_offer: 2000,
  coordination_ack: 2000,
  capabilities: 60000,
};
const fail = (reason: Rejection): ReceiveResult => ({
  accepted: false,
  reason,
});
const record = (value: unknown): Record<string, unknown> =>
  value as Record<string, unknown>;

export function resourceKey(map: MapRef, resourceId: string): string {
  return JSON.stringify([map.namespace, map.map_id, map.revision, resourceId]);
}

export function ttlCeiling(message: UtpMessage): number {
  if (message.type !== "infrastructure_state") return TTL[message.type];
  const kind = record(message.body.state).kind;
  return kind === "signal" || kind === "crosswalk"
    ? 1000
    : kind === "parking" || kind === "closure"
      ? 10000
      : 60000;
}

/** Upper-bound freshness uses both clocks' error bounds, rather than apparent age alone. */
export function freshness(
  message: UtpMessage,
  receipt: Receipt,
  timestamp = message.sent_at_ms,
): Rejection | null {
  const error = message.clock_uncertainty_ms + receipt.clockUncertaintyMs;
  if (
    !Number.isFinite(error) ||
    message.clock_uncertainty_ms < 0 ||
    receipt.clockUncertaintyMs < 0 ||
    error > MAX_CLOCK_ERROR_MS ||
    !Number.isSafeInteger(receipt.receivedAtMs) ||
    !Number.isSafeInteger(timestamp) ||
    !Number.isSafeInteger(message.ttl_ms) ||
    message.ttl_ms < 1
  )
    return "clock";
  if (receipt.receivedAtMs - timestamp + error >= message.ttl_ms)
    return "expired";
  if (timestamp - receipt.receivedAtMs + error > MAX_CLOCK_ERROR_MS)
    return "future";
  return null;
}

function distanceMeters(a: Position, b: Position): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return (
    6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
  );
}

/** Cross-field constraints that a JSON Schema cannot compare. Call only after schema validation. */
export function checkSemantics(message: UtpMessage): Rejection | null {
  const b = message.body;
  if (message.ttl_ms > ttlCeiling(message)) return "semantic";
  if (
    message.type === "observation" ||
    message.type === "infrastructure_state"
  ) {
    if (
      (b.observed_at_ms as number) >
      message.sent_at_ms + message.clock_uncertainty_ms
    )
      return "semantic";
  }
  if (message.type === "intent") {
    const points = b.trajectory as Array<{ offset_ms: number }>;
    if (
      points[0].offset_ms !== 0 ||
      points.at(-1)!.offset_ms !== b.horizon_ms ||
      points.some(
        (point, i) => i > 0 && point.offset_ms <= points[i - 1].offset_ms,
      )
    )
      return "semantic";
  } else if (message.type === "infrastructure_state") {
    const state = record(b.state);
    if (
      state.kind === "parking" &&
      (state.occupied as number) > (state.capacity as number)
    )
      return "semantic";
    if (
      state.kind === "signal" &&
      state.min_end_ms !== undefined &&
      ((state.min_end_ms as number) > (state.max_end_ms as number) ||
        (state.min_end_ms as number) <
          message.sent_at_ms - message.clock_uncertainty_ms)
    )
      return "semantic";
  } else if (message.type === "coordination_offer") {
    const participants = b.participants as string[];
    const from = b.valid_from_ms as number;
    const until = b.valid_until_ms as number;
    const slots = b.slots as Array<{
      participant: string;
      enter_after_ms: number;
      exit_before_ms: number;
    }>;
    if (
      !participants.includes(message.sender.session_id) ||
      from >= until ||
      from < message.sent_at_ms - message.clock_uncertainty_ms ||
      until > message.sent_at_ms + message.ttl_ms ||
      slots.length !== participants.length ||
      new Set(slots.map((slot) => slot.participant)).size !==
        participants.length
    )
      return "semantic";
    const ordered = [...slots].sort(
      (a, c) => a.enter_after_ms - c.enter_after_ms,
    );
    if (
      ordered.some(
        (slot, i) =>
          !participants.includes(slot.participant) ||
          slot.enter_after_ms < from ||
          slot.exit_before_ms > until ||
          slot.enter_after_ms >= slot.exit_before_ms ||
          (i > 0 && ordered[i - 1].exit_before_ms > slot.enter_after_ms),
      )
    )
      return "semantic";
  }
  return null;
}

/** Small recursive parser: rejects duplicate keys before JSON.parse could erase them. */
function strictJson(text: string): unknown {
  let at = 0;
  const skip = () => {
    while (/[ \t\r\n]/.test(text[at] ?? "") && at < text.length) at++;
  };
  const readString = (): string => {
    const start = at++;
    while (at < text.length) {
      const char = text[at++];
      if (char === "\\") at++;
      else if (char === '"') return JSON.parse(text.slice(start, at)) as string;
    }
    throw new Error("Unterminated string");
  };
  const read = (depth: number): unknown => {
    if (depth > 16) throw new Error("Nesting budget");
    skip();
    const char = text[at];
    if (char === '"') return readString();
    if (char === "{") {
      at++;
      skip();
      const value: Record<string, unknown> = Object.create(null);
      const keys = new Set<string>();
      if (text[at] === "}") {
        at++;
        return value;
      }
      for (;;) {
        skip();
        if (text[at] !== '"') throw new Error("Object key");
        const key = readString();
        if (keys.has(key)) throw new Error("Duplicate key");
        keys.add(key);
        skip();
        if (text[at++] !== ":") throw new Error("Colon");
        value[key] = read(depth + 1);
        skip();
        const end = text[at++];
        if (end === "}") return value;
        if (end !== ",") throw new Error("Object separator");
      }
    }
    if (char === "[") {
      at++;
      skip();
      const value: unknown[] = [];
      if (text[at] === "]") {
        at++;
        return value;
      }
      for (;;) {
        value.push(read(depth + 1));
        skip();
        const end = text[at++];
        if (end === "]") return value;
        if (end !== ",") throw new Error("Array separator");
      }
    }
    const token =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
        text.slice(at),
      )?.[0];
    if (token === undefined) throw new Error("Invalid value");
    at += token.length;
    const value: unknown = JSON.parse(token);
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error("Non-finite number");
    return value;
  };
  const parsed = read(0);
  skip();
  if (at !== text.length) throw new Error("Trailing data");
  return parsed;
}

interface SessionState {
  lastSequence: number;
  ids: Set<string>;
  lastUsedAt: number;
}
interface CachedMessage {
  message: UtpMessage;
  receipt: Receipt;
}

export class UtpReceiver {
  private readonly options: ReceiverOptions;
  private readonly sessions = new Map<string, SessionState>();
  private readonly capabilities = new Map<string, CachedMessage>();
  private readonly offers = new Map<string, CachedMessage>();
  private readonly ingress = new Map<
    string,
    { startedAt: number; count: number }
  >();

  constructor(options: ReceiverOptions) {
    this.options = options;
  }

  /** Prefer bytes at transport boundaries: this checks UTF-8, size, duplicate keys, and nesting. */
  receiveBytes(bytes: Uint8Array, receipt: Receipt): ReceiveResult {
    if (bytes.byteLength > MAX_BYTES) return fail("budget");
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return this.receive(strictJson(text), receipt);
    } catch {
      return fail("parse");
    }
  }

  /** Parsed-object entry point assumes its upstream parser already applied strict JSON checks. */
  receive(input: unknown, receipt: Receipt): ReceiveResult {
    this.prune(receipt.receivedAtMs);
    if (!receipt.ingressId || !Number.isSafeInteger(receipt.receivedAtMs))
      return fail("clock");
    const budget = this.ingress.get(receipt.ingressId);
    if (budget && receipt.receivedAtMs - budget.startedAt < 1000) {
      if (++budget.count > (this.options.maxMessagesPerSecond ?? 100))
        return fail("rate");
    } else {
      if (!budget && this.ingress.size >= (this.options.maxSessions ?? 128))
        return fail("capacity");
      this.ingress.set(receipt.ingressId, {
        startedAt: receipt.receivedAtMs,
        count: 1,
      });
    }
    try {
      if (
        new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_BYTES
      )
        return fail("budget");
      if (!this.options.validateSchema(input)) return fail("schema");
    } catch {
      return fail("schema");
    }
    const message = input as UtpMessage;
    if (!(this.options.supportedProfiles ?? PROFILES).includes(message.type))
      return fail("unsupported");
    let principal: string;
    if (this.options.mode === "simulation") {
      if (message.security.binding !== "simulation") return fail("binding");
      if (message.sender.session_id !== receipt.ingressId)
        return fail("authentication");
      principal = receipt.ingressId;
    } else {
      if (message.security.binding !== "external") return fail("binding");
      const trust = receipt.verification;
      if (!trust?.verified || !trust.credentialIdentity)
        return fail("authentication");
      if (!trust.allowedProfiles.includes(message.type))
        return fail("permission");
      principal = trust.credentialIdentity;
      if (
        message.type === "infrastructure_state" &&
        message.body.authority_claim === "controller" &&
        !trust.controlledResources.includes(
          resourceKey(
            message.body.map_ref as MapRef,
            message.body.resource_id as string,
          ),
        )
      )
        return fail("permission");
    }
    const timeError = freshness(message, receipt);
    if (timeError) return fail(timeError);
    if (
      message.type === "observation" ||
      message.type === "infrastructure_state"
    ) {
      const observationError = freshness(
        message,
        receipt,
        message.body.observed_at_ms as number,
      );
      if (observationError) return fail(observationError);
    }
    const local = receipt.localPosition;
    if (
      !local ||
      !Number.isFinite(local.lat) ||
      !Number.isFinite(local.lon) ||
      local.lat < -90 ||
      local.lat > 90 ||
      local.lon < -180 ||
      local.lon > 180 ||
      !Number.isFinite(local.horizontal_uncertainty_m) ||
      local.horizontal_uncertainty_m < 0
    )
      return fail("out_of_scope");
    if (
      distanceMeters(local, message.scope.center) >
      message.scope.radius_m +
        local.horizontal_uncertainty_m +
        message.scope.center.horizontal_uncertainty_m
    )
      return fail("out_of_scope");
    if (message.body.map_ref) {
      try {
        if (!this.options.resolveMap(message.body.map_ref as MapRef))
          return fail("map");
      } catch {
        return fail("map");
      }
    }
    const semanticError = checkSemantics(message);
    if (semanticError) return fail(semanticError);
    const sessionKey = JSON.stringify([principal, message.sender.session_id]);
    const state = this.sessions.get(sessionKey);
    if (state?.ids.has(message.message_id)) return fail("duplicate");
    if (state && message.sequence <= state.lastSequence) return fail("replay");
    if (
      (!state && this.sessions.size >= (this.options.maxSessions ?? 128)) ||
      (state && state.ids.size >= (this.options.maxMessagesPerSession ?? 2048))
    )
      return fail("capacity");
    if (message.type === "capabilities") {
      if (
        message.body.operating_mode !== this.options.mode ||
        !(message.body.supported_versions as string[]).includes("0.1")
      )
        return fail("unsupported");
    } else if (message.type === "coordination_offer") {
      // Only an isolated simulator can identify peers by their session alone. An external
      // credential-to-session discovery/negotiation binding is deliberately not implemented.
      if (this.options.mode !== "simulation") return fail("unsupported");
      if (
        (message.body.valid_until_ms as number) <=
        receipt.receivedAtMs +
          receipt.clockUncertaintyMs +
          message.clock_uncertainty_ms
      )
        return fail("coordination");
      if (this.offers.size >= (this.options.maxSessions ?? 128))
        return fail("capacity");
      if (
        !(message.body.participants as string[]).every((id) =>
          this.peerSupportsCoordination(id, receipt),
        )
      )
        return fail("coordination");
    } else if (message.type === "coordination_ack") {
      if (this.options.mode !== "simulation") return fail("unsupported");
      const offer = this.offers.get(
        JSON.stringify([
          message.body.offer_sender_session_id,
          message.body.offer_message_id,
        ]),
      );
      if (
        !offer ||
        offer.message.body.offer_id !== message.body.offer_id ||
        freshness(offer.message, receipt) !== null ||
        !(offer.message.body.participants as string[]).includes(
          message.sender.session_id,
        ) ||
        (offer.message.body.valid_until_ms as number) <=
          receipt.receivedAtMs +
            receipt.clockUncertaintyMs +
            offer.message.clock_uncertainty_ms
      )
        return fail("coordination");
    }
    const next = state ?? {
      lastSequence: -1,
      ids: new Set<string>(),
      lastUsedAt: receipt.receivedAtMs,
    };
    next.lastSequence = message.sequence;
    next.ids.add(message.message_id);
    next.lastUsedAt = receipt.receivedAtMs;
    this.sessions.set(sessionKey, next);
    // Snapshot stored coordination data so later caller mutation cannot change a cached offer.
    const snapshot = {
      message: structuredClone(message),
      receipt: structuredClone(receipt),
    };
    if (message.type === "capabilities")
      this.capabilities.set(message.sender.session_id, snapshot);
    if (message.type === "coordination_offer") {
      this.offers.set(
        JSON.stringify([message.sender.session_id, message.message_id]),
        snapshot,
      );
    }
    return { accepted: true, message };
  }

  private peerSupportsCoordination(id: string, receipt: Receipt): boolean {
    const peer = this.capabilities.get(id);
    if (!peer || freshness(peer.message, receipt) !== null) return false;
    const body = peer.message.body;
    return (
      (body.supported_versions as string[]).includes("0.1") &&
      (body.supported_profiles as Profile[]).includes("coordination_offer") &&
      (body.supported_profiles as Profile[]).includes("coordination_ack")
    );
  }

  private prune(now: number): void {
    for (const [key, state] of this.sessions)
      if (now - state.lastUsedAt > REPLAY_RETENTION_MS)
        this.sessions.delete(key);
    for (const [key, budget] of this.ingress)
      if (now - budget.startedAt > REPLAY_RETENTION_MS)
        this.ingress.delete(key);
    for (const [key, entry] of this.capabilities)
      if (now - entry.message.sent_at_ms >= entry.message.ttl_ms)
        this.capabilities.delete(key);
    for (const [key, entry] of this.offers)
      if (now - entry.message.sent_at_ms >= entry.message.ttl_ms)
        this.offers.delete(key);
  }
}
