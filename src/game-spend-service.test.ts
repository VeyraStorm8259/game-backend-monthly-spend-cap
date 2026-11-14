import assert from "node:assert/strict";
import { decideSpend } from "./game-spend-service.ts";

const workload = {
  playerAsset: "guild-banner",
  liveEvent: "winter-arena",
  moderationQueue: "asset-review",
  monthlyCapUsd: 25
};

assert.deepEqual(decideSpend(workload, 24.99), {
  allowed: true,
  reason: "within_cap",
  hard_cap_usd: 25,
  period: "monthly"
});
assert.equal(decideSpend(workload, 25).allowed, false);
console.log("spend decision test passed");
