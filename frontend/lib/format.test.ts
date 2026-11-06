import assert from "node:assert/strict";
import { test } from "node:test";

import {
  convertArea, convertSpeed, convertTemp, elapsed, healthFromNdvi, initials, kkDate, ndviColor,
} from "./format.ts";

test("area conversion", () => {
  assert.equal(convertArea(100, "metric"), 100);
  assert.ok(Math.abs(convertArea(100, "imperial") - 247.105) < 0.001);
});

test("temperature and wind conversion", () => {
  assert.equal(convertTemp(0, "imperial"), 32);
  assert.equal(convertTemp(20, "metric"), 20);
  assert.ok(Math.abs(convertSpeed(100, "imperial") - 62.1371) < 0.001);
});

test("health thresholds match the backend", () => {
  assert.equal(healthFromNdvi(0.6), "healthy");
  assert.equal(healthFromNdvi(0.59), "attention");
  assert.equal(healthFromNdvi(0.4), "attention");
  assert.equal(healthFromNdvi(0.39), "critical");
  assert.equal(healthFromNdvi(null), "unknown");
  assert.equal(healthFromNdvi(Number.NaN), "unknown");
});

test("NDVI colours clamp at the ends of the scale", () => {
  assert.equal(ndviColor(-1), "rgb(217,87,87)");
  assert.equal(ndviColor(0.2), "rgb(217,87,87)");
  assert.equal(ndviColor(0.95), "rgb(23,76,56)");
  assert.equal(ndviColor(0.5), "rgb(240,234,216)");
});

test("Kazakh dates use our own month names", () => {
  const date = new Date(2026, 10, 7, 9, 5);
  assert.equal(kkDate(date, "short"), "7 қар");
  assert.equal(kkDate(date, "long"), "7 қар 2026");
  assert.equal(kkDate(date, "time"), "7 қар, 09:05");
});

test("elapsed time units", () => {
  const now = new Date(2026, 10, 7, 12, 0);
  const ago = (ms: number) => elapsed(new Date(now.getTime() - ms), now);
  const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  assert.deepEqual(ago(30_000), { unit: "now", n: 0 });
  assert.deepEqual(ago(5 * MIN), { unit: "minutes", n: 5 });
  assert.deepEqual(ago(3 * HOUR), { unit: "hours", n: 3 });
  assert.deepEqual(ago(DAY + HOUR), { unit: "yesterday", n: 1 });
  assert.deepEqual(ago(4 * DAY), { unit: "days", n: 4 });
});

test("initials", () => {
  assert.equal(initials("Aidar Serikov"), "AS");
  assert.equal(initials("  madina "), "M");
});
