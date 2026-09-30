import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("private access routes are noindex and public metrics have no invented fallback", () => {
  const layout = source("app/(public)/layout.tsx");
  const login = source("app/(public)/login/page.tsx");
  assert.match(layout, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  assert.doesNotMatch(login, /FALLBACK_METRICS/);
  assert.match(login, /useState<PublicMetrics \| null>\(null\)/);
  assert.match(login, /value === null \? "—"/);
});
