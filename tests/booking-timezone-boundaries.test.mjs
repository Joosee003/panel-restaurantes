import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../app/lib/bookingDate.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dates = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);

test("restaurant-local dates differ correctly around UTC midnight", () => {
  const now = new Date("2026-06-30T22:30:00.000Z");
  assert.equal(dates.dateInTimezone("Europe/Madrid", now), "2026-07-01");
  assert.equal(dates.dateInTimezone("Atlantic/Canary", now), "2026-06-30");
});

test("calendar windows survive both Spanish daylight-saving transitions", () => {
  for (const now of [
    new Date("2026-03-29T00:30:00.000Z"),
    new Date("2026-10-25T01:30:00.000Z"),
  ]) {
    const today = dates.dateInTimezone("Europe/Madrid", now);
    assert.equal(dates.isBookingDateAllowed(today, "Europe/Madrid", 60, now), true);
    assert.equal(
      dates.isBookingDateAllowed(
        dates.addCalendarDays(today, 61),
        "Europe/Madrid",
        60,
        now,
      ),
      false,
    );
  }
});

test("minimum advance uses instants while the allowed day uses restaurant time", () => {
  const now = new Date("2026-10-25T00:30:00.000Z");
  assert.equal(
    dates.isBookingStartAllowed(
      "2026-10-25T02:15:00+01:00",
      "Europe/Madrid",
      60,
      30,
      now,
    ),
    true,
  );
  assert.equal(
    dates.isBookingStartAllowed(
      "2026-10-25T02:15:00+02:00",
      "Europe/Madrid",
      60,
      30,
      now,
    ),
    false,
  );
});
