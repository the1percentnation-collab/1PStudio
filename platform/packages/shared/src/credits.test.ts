import { strict as assert } from "node:assert";
import test from "node:test";
import { estimateVideoCost, stageCharge, STAGE_CREDIT_COST, PLANS } from "./credits";

test("estimateVideoCost: 10min source, 5 clips, 1080p", () => {
  const cost = estimateVideoCost({ sourceDurationSec: 600, clipCount: 5, resolution: "R1080" });
  // transcribe 10 + analyze 10 + select 20 + reframe 5 + render ceil(3*1*1.5)=5 * 5 = 25
  assert.equal(cost, 10 + 10 + 20 + 5 + 25);
});

test("estimateVideoCost: sub-minute source rounds up to 1 minute", () => {
  const cost = estimateVideoCost({ sourceDurationSec: 30, clipCount: 1, resolution: "R720" });
  assert.equal(cost, 1 + 1 + 2 + 1 + 3);
});

test("stageCharge applies resolution multiplier only to RENDER", () => {
  assert.equal(stageCharge("RENDER", 1, "R4K"), Math.ceil(STAGE_CREDIT_COST.RENDER * 4));
  assert.equal(stageCharge("TRANSCRIBE", 10, "R4K"), 10);
});

test("free plan is watermarked and expiring", () => {
  assert.equal(PLANS.FREE.watermark, true);
  assert.equal(PLANS.FREE.clipTtlDays, 3);
  assert.equal(PLANS.PRO.watermark, false);
});
