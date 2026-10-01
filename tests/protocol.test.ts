import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  PROFILES,
  UtpReceiver,
  checkSemantics,
  freshness,
  resourceKey,
  type MapRef,
  type Receipt,
  type ReceiverOptions,
  type UtpMessage,
} from "../src/protocol.ts";

const schema = JSON.parse(
  readFileSync(new URL("../protocol/schema.json", import.meta.url), "utf8"),
);
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
const fixture = (name = "presence"): UtpMessage =>
  JSON.parse(
    readFileSync(
      new URL(`../protocol/examples/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
const receiver = (options: Partial<ReceiverOptions> = {}) =>
  new UtpReceiver({
    mode: "simulation",
    validateSchema: validate,
    resolveMap: (map) =>
      map.namespace === "utp.demo" &&
      map.map_id === "intersection-01" &&
      map.revision === "1",
    ...options,
  });
const receipt = (message: UtpMessage, elapsed = 10): Receipt => ({
  receivedAtMs: message.sent_at_ms + elapsed,
  clockUncertaintyMs: 5,
  localPosition: message.scope.center,
  ingressId: message.sender.session_id,
});
const bytes = (text: string) => new TextEncoder().encode(text);
const next = (
  message: UtpMessage,
  sequence: number,
  id = `sim-message-${sequence.toString().padStart(6, "0")}`,
): UtpMessage => ({ ...structuredClone(message), sequence, message_id: id });

test("every shipped example validates against the published Draft 2020-12 schema and semantic checks", () => {
  const files = readdirSync(
    new URL("../protocol/examples/", import.meta.url),
  ).filter((file) => file.endsWith(".json"));
  assert.equal(files.length, 11);
  for (const file of files) {
    const message = fixture(file.replace(".json", ""));
    assert.equal(
      validate(message),
      true,
      `${file}: ${JSON.stringify(validate.errors)}`,
    );
    assert.equal(checkSemantics(message), null, file);
  }
});

test("schema rejects an unknown version, an unknown field, and a mismatched profile body", () => {
  const sample = fixture();
  assert.equal(validate({ ...sample, utp: "0.2" }), false);
  assert.equal(
    validate({ ...sample, license_plate: "not-a-protocol-field" }),
    false,
  );
  assert.equal(validate({ ...sample, type: "intent" }), false);
});

test("profile-specific expiry ceilings include fast signal state and slower static infrastructure", () => {
  for (const [name, ceiling] of [
    ["presence", 1000],
    ["intent", 2000],
    ["infrastructure_state", 1000],
    ["crosswalk", 1000],
    ["parking", 10000],
    ["closure", 10000],
    ["stop_sign", 60000],
  ] as const) {
    const sample = fixture(name);
    assert.equal(validate({ ...sample, ttl_ms: ceiling }), true, name);
    assert.equal(validate({ ...sample, ttl_ms: ceiling + 1 }), false, name);
  }
});

test("uncertainty consumes the lifetime budget and equality at expiry rejects", () => {
  const sample = fixture();
  assert.equal(freshness(sample, receipt(sample, 989)), null);
  assert.equal(freshness(sample, receipt(sample, 990)), "expired");
  assert.equal(
    receiver().receive(sample, receipt(sample, 1000)).accepted,
    false,
  );
});

test("future skew and unknown or excessive clock quality reject", () => {
  const sample = fixture();
  assert.deepEqual(receiver().receive(sample, receipt(sample, -91)), {
    accepted: false,
    reason: "future",
  });
  assert.equal(
    freshness(sample, { ...receipt(sample), clockUncertaintyMs: 96 }),
    "clock",
  );
  assert.equal(
    freshness(sample, { ...receipt(sample), clockUncertaintyMs: NaN }),
    "clock",
  );
  assert.equal(freshness(sample, receipt(sample), NaN), "clock");
});

test("a fresh envelope cannot refresh a stale sensor observation", () => {
  const sample = fixture("observation");
  sample.body.observed_at_ms = sample.sent_at_ms - 1000;
  assert.deepEqual(receiver().receive(sample, receipt(sample)), {
    accepted: false,
    reason: "expired",
  });
  sample.body.observed_at_ms = sample.sent_at_ms + 100;
  assert.deepEqual(receiver().receive(sample, receipt(sample)), {
    accepted: false,
    reason: "semantic",
  });
  const parking = fixture("parking");
  parking.body.observed_at_ms = parking.sent_at_ms - parking.ttl_ms;
  assert.deepEqual(receiver().receive(parking, receipt(parking)), {
    accepted: false,
    reason: "expired",
  });
});

test("duplicate IDs, reordered sequences, and gaps have distinct behavior across profiles", () => {
  const sample = fixture();
  const guard = receiver();
  assert.equal(guard.receive(sample, receipt(sample)).accepted, true);
  assert.deepEqual(
    guard.receive(next(sample, 2, sample.message_id), receipt(sample)),
    { accepted: false, reason: "duplicate" },
  );
  assert.equal(guard.receive(next(sample, 50), receipt(sample)).accepted, true);
  const capability = fixture("capabilities");
  assert.deepEqual(guard.receive(next(capability, 49), receipt(capability)), {
    accepted: false,
    reason: "replay",
  });
  assert.equal(
    guard.receive(next(capability, 51), receipt(capability)).accepted,
    true,
  );
});

test("a rejected high sequence does not advance replay state", () => {
  const sample = fixture();
  const guard = receiver();
  assert.equal(guard.receive(sample, receipt(sample)).accepted, true);
  assert.deepEqual(guard.receive(next(sample, 1000), receipt(sample, -500)), {
    accepted: false,
    reason: "future",
  });
  assert.equal(guard.receive(next(sample, 2), receipt(sample)).accepted, true);
});

test("simulation sender identity is bound to the transport, and simulation messages are isolated", () => {
  const sample = fixture();
  assert.deepEqual(
    receiver().receive(sample, { ...receipt(sample), ingressId: "sim-car-99" }),
    { accepted: false, reason: "authentication" },
  );
  assert.deepEqual(
    receiver({ mode: "laboratory" }).receive(sample, receipt(sample)),
    { accepted: false, reason: "binding" },
  );
});

function external(sample: UtpMessage): {
  message: UtpMessage;
  context: Receipt;
} {
  const message = structuredClone(sample);
  message.security = {
    binding: "external",
    credential_ref: "lab-credential-01",
    standard: "configured-test-verifier",
  };
  return {
    message,
    context: {
      ...receipt(message),
      verification: {
        verified: true,
        credentialIdentity: "verified-pseudonym-01",
        allowedProfiles: [...PROFILES],
        controlledResources: [],
      },
    },
  };
}

test("an external declaration does not authenticate itself", () => {
  const { message, context } = external(fixture());
  const guard = receiver({ mode: "laboratory" });
  assert.deepEqual(
    guard.receive(message, { ...context, verification: undefined }),
    { accepted: false, reason: "authentication" },
  );
  assert.deepEqual(
    guard.receive(message, {
      ...context,
      verification: { ...context.verification!, verified: false },
    }),
    { accepted: false, reason: "authentication" },
  );
  assert.equal(guard.receive(message, context).accepted, true);
});

test("replay identity follows the verified credential across ingress paths", () => {
  const { message, context } = external(fixture());
  const guard = receiver({ mode: "laboratory" });
  assert.equal(guard.receive(message, context).accepted, true);
  assert.deepEqual(
    guard.receive(next(message, 1), {
      ...context,
      ingressId: "other-network-path",
    }),
    { accepted: false, reason: "replay" },
  );
});

test("controller authority requires a permission for the exact resource and map revision", () => {
  const { message, context } = external(fixture("infrastructure_state"));
  const guard = receiver({ mode: "laboratory" });
  assert.deepEqual(guard.receive(message, context), {
    accepted: false,
    reason: "permission",
  });
  context.verification!.controlledResources = [
    resourceKey(
      message.body.map_ref as MapRef,
      message.body.resource_id as string,
    ),
  ];
  assert.equal(guard.receive(message, context).accepted, true);
  const other = next(message, 2);
  other.body.resource_id = "signal-02";
  assert.deepEqual(guard.receive(other, context), {
    accepted: false,
    reason: "permission",
  });
});

test("profile permission and map revision checks reject before application use", () => {
  const { message, context } = external(fixture());
  context.verification!.allowedProfiles = ["capabilities"];
  assert.deepEqual(receiver({ mode: "laboratory" }).receive(message, context), {
    accepted: false,
    reason: "permission",
  });
  const sample = fixture("infrastructure_state");
  (sample.body.map_ref as MapRef).revision = "unresolved";
  assert.deepEqual(receiver().receive(sample, receipt(sample)), {
    accepted: false,
    reason: "map",
  });
  assert.deepEqual(
    receiver({
      resolveMap: () => {
        throw new Error("Map service unavailable");
      },
    }).receive(fixture("parking"), receipt(fixture("parking"))),
    { accepted: false, reason: "map" },
  );
});

test("geographic relevance rejects distant receivers and retains overlapping uncertainty", () => {
  const sample = fixture();
  assert.deepEqual(
    receiver().receive(sample, {
      ...receipt(sample),
      localPosition: { lat: 42, lon: -87, horizontal_uncertainty_m: 1 },
    }),
    { accepted: false, reason: "out_of_scope" },
  );
  sample.scope.radius_m = 0;
  const localPosition = {
    ...sample.scope.center,
    lat: sample.scope.center.lat + 0.0001,
    horizontal_uncertainty_m: 20,
  };
  assert.equal(
    receiver().receive(sample, { ...receipt(sample), localPosition }).accepted,
    true,
  );
  assert.deepEqual(
    receiver().receive(sample, {
      ...receipt(sample),
      localPosition: { ...localPosition, lat: 1000 },
    }),
    { accepted: false, reason: "out_of_scope" },
  );
});

test("semantic validation catches impossible parking counts, unordered intent, and overlapping slots", () => {
  const parking = fixture("parking");
  (parking.body.state as Record<string, unknown>).occupied = 41;
  assert.equal(validate(parking), true);
  assert.deepEqual(receiver().receive(parking, receipt(parking)), {
    accepted: false,
    reason: "semantic",
  });
  const intent = fixture("intent");
  intent.body.horizon_ms = 3000;
  assert.equal(checkSemantics(intent), "semantic");
  const offer = fixture("coordination_offer");
  (offer.body.slots as Array<Record<string, unknown>>)[1].enter_after_ms =
    offer.sent_at_ms + 500;
  assert.equal(checkSemantics(offer), "semantic");
});

function negotiatedGuard(): UtpReceiver {
  const guard = receiver();
  for (const id of ["sim-car-07", "sim-car-08"]) {
    const capability = fixture("capabilities");
    capability.sender.session_id = id;
    assert.equal(guard.receive(capability, receipt(capability)).accepted, true);
  }
  return guard;
}

test("coordination requires advertised common capabilities and a matched, unexpired offer", () => {
  const offer = next(
    fixture("coordination_offer"),
    2,
    "sim-coordination_offer-000001",
  );
  const ack = next(fixture("coordination_ack"), 2);
  assert.deepEqual(receiver().receive(offer, receipt(offer)), {
    accepted: false,
    reason: "coordination",
  });
  assert.deepEqual(receiver().receive(ack, receipt(ack)), {
    accepted: false,
    reason: "coordination",
  });
  const guard = negotiatedGuard();
  assert.equal(guard.receive(offer, receipt(offer)).accepted, true);
  assert.equal(guard.receive(ack, receipt(ack)).accepted, true);
  assert.deepEqual(guard.receive(ack, receipt(ack)), {
    accepted: false,
    reason: "duplicate",
  });
  const late = next(ack, 3);
  assert.deepEqual(
    guard.receive(late, {
      ...receipt(late),
      receivedAtMs: offer.sent_at_ms + 1800,
    }),
    { accepted: false, reason: "coordination" },
  );
  assert.deepEqual(
    guard.receive(late, {
      ...receipt(late),
      receivedAtMs: offer.sent_at_ms + 1796,
      clockUncertaintyMs: 0,
    }),
    { accepted: false, reason: "coordination" },
  );
});

test("caller mutation cannot rewrite an accepted cached offer", () => {
  const guard = negotiatedGuard();
  const offer = next(
    fixture("coordination_offer"),
    2,
    "sim-coordination_offer-000001",
  );
  assert.equal(guard.receive(offer, receipt(offer)).accepted, true);
  offer.body.participants = ["sim-car-07", "sim-car-99"];
  const ack = next(fixture("coordination_ack"), 2);
  assert.equal(guard.receive(ack, receipt(ack)).accepted, true);
});

test("offer absolute deadlines override a longer envelope lifetime and include both clock bounds", () => {
  const offer = next(fixture("coordination_offer"), 2);
  offer.body.valid_until_ms = offer.sent_at_ms + 1000;
  offer.body.slots = [
    {
      participant: "sim-car-07",
      enter_after_ms: offer.sent_at_ms + 100,
      exit_before_ms: offer.sent_at_ms + 400,
    },
    {
      participant: "sim-car-08",
      enter_after_ms: offer.sent_at_ms + 600,
      exit_before_ms: offer.sent_at_ms + 1000,
    },
  ];
  assert.equal(validate(offer), true);
  assert.equal(checkSemantics(offer), null);
  assert.equal(freshness(offer, receipt(offer, 1500)), null);
  assert.deepEqual(negotiatedGuard().receive(offer, receipt(offer, 1500)), {
    accepted: false,
    reason: "coordination",
  });
  assert.deepEqual(negotiatedGuard().receive(offer, receipt(offer, 990)), {
    accepted: false,
    reason: "coordination",
  });
  assert.equal(
    negotiatedGuard().receive(offer, receipt(offer, 989)).accepted,
    true,
  );
});

test("acknowledgement deadline includes offer sender uncertainty as well as receiver uncertainty", () => {
  const guard = negotiatedGuard();
  const offer = next(
    fixture("coordination_offer"),
    2,
    "sim-coordination_offer-000001",
  );
  assert.equal(guard.receive(offer, receipt(offer)).accepted, true);
  const ack = next(fixture("coordination_ack"), 2);
  ack.sent_at_ms = offer.sent_at_ms + 1794;
  assert.deepEqual(guard.receive(ack, receipt(ack, 0)), {
    accepted: false,
    reason: "coordination",
  });
});

test("missing versions and profiles downgrade to independent awareness instead of accepting coordination", () => {
  const guard = receiver();
  const capability = fixture("capabilities");
  capability.body.supported_profiles = ["presence"];
  assert.equal(guard.receive(capability, receipt(capability)).accepted, true);
  const incompatible = next(capability, 2);
  incompatible.body.supported_versions = ["0.2"];
  assert.deepEqual(guard.receive(incompatible, receipt(incompatible)), {
    accepted: false,
    reason: "unsupported",
  });
  const offer = next(fixture("coordination_offer"), 3);
  assert.deepEqual(guard.receive(offer, receipt(offer)), {
    accepted: false,
    reason: "coordination",
  });
  assert.equal(
    guard.receive(next(fixture(), 2), receipt(fixture())).accepted,
    true,
  );
});

test("laboratory coordination remains disabled until an authenticated peer-discovery binding is specified", () => {
  const { message, context } = external(fixture("coordination_offer"));
  assert.deepEqual(receiver({ mode: "laboratory" }).receive(message, context), {
    accepted: false,
    reason: "unsupported",
  });
});

test("bounded rate and replay caches reject excess work without evicting protection", () => {
  const sample = fixture();
  const rate = receiver({ maxMessagesPerSecond: 2 });
  assert.equal(rate.receive(sample, receipt(sample)).accepted, true);
  assert.equal(rate.receive(next(sample, 2), receipt(sample)).accepted, true);
  assert.deepEqual(rate.receive(next(sample, 3), receipt(sample)), {
    accepted: false,
    reason: "rate",
  });
  const cache = receiver({ maxMessagesPerSession: 1 });
  assert.equal(cache.receive(sample, receipt(sample)).accepted, true);
  assert.deepEqual(cache.receive(next(sample, 2), receipt(sample)), {
    accepted: false,
    reason: "capacity",
  });
  assert.deepEqual(cache.receive(sample, receipt(sample)), {
    accepted: false,
    reason: "duplicate",
  });
});

test("transport parser rejects duplicate keys, bad UTF-8, deep nesting, and numeric overflow", () => {
  const sample = fixture();
  const context = receipt(sample);
  const json = JSON.stringify(sample);
  assert.equal(receiver().receiveBytes(bytes(json), context).accepted, true);
  assert.deepEqual(
    receiver().receiveBytes(
      bytes(json.replace('"utp":"0.1"', '"utp":"0.1","utp":"0.1"')),
      context,
    ),
    { accepted: false, reason: "parse" },
  );
  assert.deepEqual(
    receiver().receiveBytes(new Uint8Array([0xc3, 0x28]), context),
    { accepted: false, reason: "parse" },
  );
  assert.deepEqual(
    receiver().receiveBytes(
      bytes("[".repeat(18) + "0" + "]".repeat(18)),
      context,
    ),
    { accepted: false, reason: "parse" },
  );
  assert.deepEqual(receiver().receiveBytes(bytes('{"value":1e400}'), context), {
    accepted: false,
    reason: "parse",
  });
  assert.deepEqual(receiver().receiveBytes(bytes("\u00a0" + json), context), {
    accepted: false,
    reason: "parse",
  });
});

test("transport and parsed-object byte budgets apply before schema work", () => {
  const sample = fixture();
  assert.deepEqual(
    receiver().receiveBytes(new Uint8Array(32769), receipt(sample)),
    { accepted: false, reason: "budget" },
  );
  sample.body.extra = "x".repeat(33000);
  assert.deepEqual(receiver().receive(sample, receipt(sample)), {
    accepted: false,
    reason: "budget",
  });
});
