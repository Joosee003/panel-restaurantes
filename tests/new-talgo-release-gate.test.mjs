import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = new URL("../scripts/prepare-new-talgo-publication.mjs", import.meta.url);
test("release preparation refuses unconfirmed New Talgo publication details", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(script)], {
    env: {
      ...process.env,
      GASTROHELP_DEPLOYMENT_MODE: "approved-production",
      NEW_TALGO_PUBLICATION_APPROVED: "yes",
      NEW_TALGO_PUBLIC_BASE_URL: "https://example.com/new-talgo/",
    },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /NEW_TALGO_CONFIRMATION_MISSING:legalConfirmed/);
});
