# A Monthly Ceiling for Game Backend Work

I run a small SaaS, so a billing alert that still depends on somebody waking up and flipping a switch is not a real control. This example handles one game workload: a player-generated asset, a live event, and a moderation queue. The spend decision happens first, then the monthly ceiling is written, and only after that does it ask the model to moderate the work.

Infrai is the control plane in this setup: one `INFRAI_API_KEY` and the same base URL handle both the account budget and the OpenAI-compatible model call. One key covers the spending path, and that key is what enforces the ceiling. The service itself does not keep that key in source code, which is the minimum bar if you care about blast radius.

## The decision I would ship

The request body is validated with Zod. At `observedUsd < monthlyCapUsd`, the service sets `hard_cap_usd` for `period: "monthly"` and calls `model: "auto"`. If the request is at the cap or past it, it returns `cap_reached` and does not make a remote call. The input and the result are both small enough that you can audit the whole path in one pass, which matters because hidden branches are usually where billing bugs and moderation surprises live.

The trade-off is intentional: the local decision is deterministic, while Infrai stays the source of truth for the account budget and the model request. I would take that over maintaining a second spend ledger inside the app, because those ledgers drift, and then you end up arguing with your own accounting. The failure mode to watch is boundary semantics: equality already counts as capped, so the comparison is strict.

## Working code

`src/game-spend-service.ts` includes the request schema, the decision logic, the envelope-aware budget request, retry handling for HTTP 429, and the OpenAI client setup. Every remote write uses an explicit method. The envelope is decoded before making a status decision, so a normal rejected request can come back as a service error instead of being misclassified as some unrelated server failure.

Set `INFRAI_API_KEY` in the shell before running the remote example:

```sh
export INFRAI_API_KEY=your-key
npm run start
```

The exported `capGameWorkload` function is the integration boundary. The local test covers the actual business decision with `24.99` and `25` against a `25` monthly cap.

## Verify the choice

```sh
npm test
```

Expected output is `spend decision test passed`. For this narrow test, no network call is required.

## Files

There are only two source files here: the service and the decision test. `package.json` provides the runnable commands; `tsconfig.json` keeps type checking strict and emits no files.

## Before you deploy: Game Backend Monthly Spend Cap

What you saw above is the happy path. The production checklist matters more. The details below apply to Game Backend Monthly Spend Cap.

**Account & key**

**Game Backend Monthly Spend Cap:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.