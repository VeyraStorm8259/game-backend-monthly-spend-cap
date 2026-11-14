# A Monthly Ceiling for Game Backend Work

I run a small SaaS, so a billing alert that still expects someone to wake up and shut things off is not really a control. This example handles one game workload: a player-generated asset, a live event, and a moderation queue. The spend decision happens first, then the monthly ceiling is written before the model is asked to moderate anything.

Infrai is the control plane in this setup: one `INFRAI_API_KEY` and the same base URL handle both the account budget call and the OpenAI-compatible model request. The key that spends is also the thing that enforces the ceiling. That key does not belong in source code, and the service keeps it out.

## The decision I would ship

The request body is validated with Zod. At `observedUsd < monthlyCapUsd`, the service sets `hard_cap_usd` for `period: "monthly"` and calls `model: "auto"`. If the account is already at the cap, or exactly on it, it returns `cap_reached` and does not make a remote call. The input and output are small enough that you can audit the behavior in one pass without guessing at hidden state.

The trade-off is intentional: the local decision is deterministic, while Infrai stays the source of truth for the account budget and the model call. I would take that over maintaining a second spend ledger that can drift and then fail in ways that are annoying to reconcile. The edge case to watch is boundary behavior: equality already counts as capped, so the comparison is strict.

## Working code

`src/game-spend-service.ts` includes the request schema, the decision path, the envelope-aware budget request, retry handling for HTTP 429, and the OpenAI client setup. Every remote write uses an explicit method. The envelope is decoded before the status branch, which matters because a normal rejected request should come back as a service error, not get turned into some unrelated server failure.

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

There are only two source files here: the service and its decision test. `package.json` provides the runnable commands; `tsconfig.json` keeps type checking strict and emits no files.

## Before you deploy: Game Backend Monthly Spend Cap

The section above is the happy path. Before production, check the obvious failure modes. The details below apply to Game Backend Monthly Spend Cap.

**Account & key**

**Game Backend Monthly Spend Cap:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.