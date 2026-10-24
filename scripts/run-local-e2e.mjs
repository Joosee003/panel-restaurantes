import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = join(process.cwd(), "local-schema");
const status = JSON.parse(await readFile(join(root, "supabase-status.json"), "utf8"));
const fixture = JSON.parse(await readFile(join(root, "fixture-credentials.json"), "utf8"));
const url = new URL(status.API_URL);
if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "54321") {
  throw new Error("LOCAL_SUPABASE_ONLY");
}
const date = (offset) => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};
const env = {
  ...process.env,
  GH_LOCAL_E2E: "1",
  GH_LOCAL_URL: status.API_URL,
  GH_LOCAL_ANON_KEY: status.ANON_KEY,
  GH_LOCAL_SERVICE_KEY: status.SERVICE_ROLE_KEY,
  GH_LOCAL_RESTAURANT_A_ID: fixture.restaurants.newTalgo,
  GH_LOCAL_RESTAURANT_B_ID: fixture.restaurants.mesaNorte,
  GH_LOCAL_A_EMAIL: fixture.users.newTalgo.email,
  GH_LOCAL_A_PASSWORD: fixture.users.newTalgo.password,
  GH_LOCAL_B_EMAIL: fixture.users.mesaNorte.email,
  GH_LOCAL_B_PASSWORD: fixture.users.mesaNorte.password,
  GH_LOCAL_AGENCY_EMAIL: fixture.users.agency.email,
  GH_LOCAL_AGENCY_PASSWORD: fixture.users.agency.password,
  GH_LOCAL_BOOKING_DATE: date(2),
  GH_LOCAL_CAPACITY_ONE_DATE: date(3),
};
const result = spawnSync(process.execPath, ["--test", "integration-tests/white-label-local-e2e.mjs"], {
  cwd: process.cwd(), env, stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
