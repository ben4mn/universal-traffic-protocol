# Contributing

UTP welcomes critique of the idea as much as code. A useful contribution makes a claim clearer, a test more honest, or an integration more concrete.

Before opening a change:

1. Explain the problem and the behavior you expect. Include a scenario, seed, or message fixture when relevant.
2. Keep protocol changes versioned and explicit about units, freshness, uncertainty, authority, and fallback. A structurally valid message is not automatically true or safe.
3. Keep model results reproducible. Match arrival demand and seed across comparison modes; count external queues and unfinished trips. Do not tune only for a flattering screenshot.
4. Run `npm run check`. Visually check UI changes at a desktop width and a narrow phone width.
5. Update the relevant documentation and keep commits focused. Omit generated builds, transcripts, screenshots, credentials, and dependency directories.

Standards claims need primary sources. Do not describe a profile as SAE/ETSI compatible until an adapter, unit semantics, trust handling, and conformance evidence exist. Do not integrate this prototype into public-road control.

The current simulation's communication is an abstract freshness/loss model. It does not serialize the reference protocol on every animation frame. Connecting the protocol receiver to recorded or simulated traffic events is a useful next milestone.
