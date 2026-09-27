import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { validatePublicConfig, validateServiceKey, validateRuntimeEnvironment, assertNoPrivateKeyInPublicAssets } from './safety.mjs';

try {
  validateRuntimeEnvironment(process.env);
  const config = validatePublicConfig(JSON.parse(await readFile('qa-public-config.json', 'utf8')));
  const key = (await readFile('/run/secrets/supabase_service_role', 'utf8')).trim();
  validateServiceKey(key, config);
  await assertNoPrivateKeyInPublicAssets(process.cwd(), key);
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '0.0.0.0', '--port', '3000'], {
    stdio: 'inherit',
    env: { ...process.env, ...config, SUPABASE_SERVICE_ROLE_KEY: key },
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  child.on('error', () => { console.error('QA frontend failed to start'); process.exitCode = 1; });
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
} catch {
  console.error('QA startup safety check failed; review config, secret mount and public build assets privately.');
  process.exitCode = 1;
}
