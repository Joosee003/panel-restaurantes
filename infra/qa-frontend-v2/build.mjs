import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validatePublicConfig, validateRuntimeEnvironment, assertNoPrivateKeyInPublicAssets } from './safety.mjs';

try {
  validateRuntimeEnvironment(process.env);
  const rawConfig = await readFile('/run/secrets/qa_public');
  if (createHash('sha256').update(rawConfig).digest('hex') !== process.env.QA_PUBLIC_CONFIG_SHA256) throw new Error('Missing or mismatched QA public config digest');
  const config = validatePublicConfig(JSON.parse(rawConfig.toString('utf8')));
  const result = spawnSync(process.execPath, ['scripts/build-app.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, ...config },
  });
  if (result.error || result.status !== 0) throw new Error('QA Next build failed');
  await assertNoPrivateKeyInPublicAssets(process.cwd());
  // Public, already baked into JS; never store a server key here.
  await writeFile('qa-public-config.json', JSON.stringify(config));
  console.log('QA build and public-asset boundary check passed; no private key was supplied.');
} catch (error) {
  // JSON parsing could echo user input. Do not print exception details.
  console.error(error instanceof SyntaxError ? 'Invalid QA public configuration JSON' : error.message);
  process.exitCode = 1;
}
