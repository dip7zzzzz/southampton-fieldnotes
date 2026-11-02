import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  activityIntensity,
  formatIntensity,
  INTENSITY,
} from "../src/lib/intensity";
import { unpackDataset } from "../src/lib/codec";

test("intensity anchor is reproducible from the retained positive reference", () => {
  const data = unpackDataset(
    JSON.parse(readFileSync("public/data/southampton.json", "utf8")),
  );
  assert.equal(data.reference.version, INTENSITY.reference);
  const positive = data.reference.values.filter((v) => v > 0);
  const at = (positive.length - 1) * 0.9;
  const q90 =
    positive[Math.floor(at)] +
    (positive[Math.ceil(at)] - positive[Math.floor(at)]) * (at % 1);
  assert.equal(q90, INTENSITY.half);
  assert.equal(activityIntensity(q90), 50);
  assert.equal(activityIntensity(q90 * 4), 80);
});

test("zero stays zero, positive traces stay positive, and future extremes are not clipped", () => {
  assert.equal(activityIntensity(0), 0);
  const raw = [1e-12, 1e-6, 0.01, 0.1, 0.5, 1, 5, 10, 100, 1e6];
  const values = raw.map(activityIntensity);
  values.forEach((v, i) => {
    assert.ok(v > 0 && v < 100);
    if (i) assert.ok(v > values[i - 1]);
  });
  assert.equal(activityIntensity(Number.NaN), 0);
  assert.equal(activityIntensity(-1), 0);
});

test("rounded labels cannot imply a positive trace is zero or a finite estimate reaches100", () => {
  assert.equal(formatIntensity(0), "0");
  assert.equal(formatIntensity(activityIntensity(1e-6)), "<0.1");
  assert.equal(formatIntensity(activityIntensity(1e6)), ">99.9");
  assert.equal(formatIntensity(50), "50.0");
});
