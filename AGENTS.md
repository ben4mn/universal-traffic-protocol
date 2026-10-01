# Working on Universal Traffic Protocol

This is an open research prototype and public teaching simulation. Keep those roles explicit.

- The canonical public view is GitHub Pages, deployed automatically from `main` after checks.
- Keep changes in focused commits with clear imperative messages. Never commit credentials, generated builds, screenshots, dependency directories, or agent transcripts.
- Maintain `README.md` as the entry point; protocol details belong in `docs/protocol.md`, standards in `docs/standards.md`, and model assumptions in `docs/simulation.md`. Update those when behavior changes.
- Measure simulation results from model state. Match demand and random seed between modes. Never hardcode savings or imply that this proves real-world effects.
- Communication informs local decisions; messages do not grant safety authority. Preserve expiry, uncertainty, mixed-adoption behavior, and fail-safe rules in protocol changes.
- Use primary sources for standards claims. Do not imply SAE/ETSI compliance or manufacturer participation without evidence.
- Run `npm run check` before pushing. Inspect meaningful UI changes at desktop and mobile sizes. Keep UI tests proportionate to the change.
- Changes to `main` publish publicly. The user has authorized routine development and publication of this project. Reassess scope for unrelated external actions.
- Keep agent documentation short and durable; do not record a running diary here.
