import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// These synthetic regressions check schedule evaluation and honest fallback
// labels across device timezones. They do not establish pedestrian accuracy.
const modelUrl = new URL("../src/lib/model.ts", import.meta.url).href;
const script = `
  import { DateTime } from "luxon";
  import { operatingState, venueActivity } from ${JSON.stringify(modelUrl)};
  const london = DateTime.fromISO("2026-03-08T02:30:00", { zone: "Europe/London" });
  const time = {
    date: "2026-03-08", hour: 2.5, weekday: 7, term: "unknown",
    instant: london.toISO(), valid: london.isValid, warnings: []
  };
  const venue = {
    id: "synthetic/timezone", name: "Synthetic timezone fixture", category: "cafe",
    hours: "Su 02:00-03:00", position: [-1.4, 50.91], size: 1,
    sizeLow: 0.5, sizeHigh: 2, beta: 0.55, areaSource: "category fallback",
    access: "not explicitly recorded", catchment: []
  };
  const state = operatingState(venue, time);
  const activity = venueActivity(venue, time);
  console.log(JSON.stringify({
    validLondonTime: london.isValid && london.hour === 2 && london.minute === 30,
    state, assumptions: activity.assumptions
  }));
`;

for (const zone of ["America/New_York", "UTC", "Europe/London"]) {
  test(`valid London hour remains explicit when the device is in ${zone}`, () => {
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "--eval", script],
        {
          env: { ...process.env, TZ: zone },
          encoding: "utf8",
          timeout: 15_000,
        },
      ),
    );
    assert.equal(result.validLondonTime, true);
    if (zone === "America/New_York") {
      // 02:30 does not exist on this date in New York, but it does in London.
      // The cafe's Sunday weekly fallback is closed; this must be presented as
      // an assumption, never a successfully evaluated recorded closure.
      assert.equal(result.state.value, 0);
      assert.equal(result.state.assumed, true);
      assert.match(result.state.reason, /device clock-change gap/);
      assert.ok(result.assumptions.includes(result.state.reason));
      assert.ok(
        result.assumptions.some((note: string) =>
          /Opening hours assumed/.test(note),
        ),
      );
    } else {
      assert.equal(result.state.value, 1);
      assert.equal(result.state.assumed, false);
      assert.equal(result.state.reason, undefined);
      assert.ok(
        !result.assumptions.some((note: string) =>
          /clock-change gap/.test(note),
        ),
      );
    }
  });
}
