import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validatePublicConfig, validateServiceKey, validateRuntimeEnvironment, assertNoPrivateKeyInPublicAssets } from '../infra/qa-frontend-v2/safety.mjs';

const jwt = role => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({role})).toString('base64url')}.synthetic`;
const config = () => ({
  NEXT_PUBLIC_SUPABASE_URL: 'https://qa.gastrohelp.es/supabase',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon'),
  NEXT_PUBLIC_SITE_URL: 'https://v2.qa.gastrohelp.es',
});

test('accepts public QA config without confusing structural checks with server verification', () => {
  assert.deepEqual(validatePublicConfig(config()), config());
  assert.doesNotThrow(() => validateServiceKey(jwt('service_role'), config()));
});

test('rejects server keys, extra variables and wrong public key roles', () => {
  for (const key of [jwt('service_role'), jwt('authenticated'), 'sb_secret_fixture', 'unknown']) {
    assert.throws(() => validatePublicConfig({...config(), NEXT_PUBLIC_SUPABASE_ANON_KEY:key}));
  }
  assert.throws(() => validatePublicConfig({...config(), NEXT_PUBLIC_SERVICE_ROLE_KEY:jwt('service_role')}));
  assert.throws(() => validatePublicConfig({...config(), SUPABASE_SERVICE_ROLE_KEY:jwt('service_role')}));
  assert.throws(() => validatePublicConfig({...config(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}));
  assert.throws(() => validateServiceKey(jwt('anon'), config()));
});

test('rejects production, cloud, internal Docker URLs, deceptive hostnames and replacing old QA', () => {
  for (const url of ['https://panel.gastrohelp.es', 'https://example.supabase.co', 'http://kong:8000', 'https://qa.gastrohelp.es.attacker.invalid', 'https://qa.gastrohelp.es@attacker.invalid', 'https://qa.gastrohelp.es?token=x']) {
    assert.throws(() => validatePublicConfig({...config(), NEXT_PUBLIC_SUPABASE_URL:url}));
  }
  assert.throws(() => validatePublicConfig({...config(), NEXT_PUBLIC_SITE_URL:'https://qa.gastrohelp.es'}));
});

test('rejects inherited application/transport variables instead of mixing environments', () => {
  for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_OTHER_SECRET', 'N8N_CHATBOT_WEBHOOK_SECRET', 'WAHA_API_KEY', 'META_TOKEN', 'VERCEL_ENV', 'DEMO_USER_EMAIL']) {
    assert.throws(() => validateRuntimeEnvironment({[name]:'synthetic'}));
  }
  assert.doesNotThrow(() => validateRuntimeEnvironment({NODE_ENV:'production', PATH:'/usr/bin'}));
  assert.throws(() => validateRuntimeEnvironment({NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:''}));
});

test('checks static assets and prerendered responses for a runtime canary and privileged JWTs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gastrohelp-qa-assets-'));
  try {
    for (const dir of ['.next/static', 'public', '.next/server/app']) await mkdir(path.join(root, dir), {recursive:true});
    const file = path.join(root, '.next/static/test.js');
    await writeFile(file, 'public SDK type check: startsWith("sb_secret_")');
    assert.equal(await assertNoPrivateKeyInPublicAssets(root, 'private-canary'), 1);
    for (const forbidden of ['private-canary', jwt('service_role'), 'SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_fixture']) {
      await writeFile(file, forbidden);
      await assert.rejects(assertNoPrivateKeyInPublicAssets(root, 'private-canary'));
    }
    await writeFile(file, jwt('anon'));
    await writeFile(path.join(root, '.next/server/app/login.html'), 'private-canary');
    await assert.rejects(assertNoPrivateKeyInPublicAssets(root, 'private-canary'));
  } finally {
    await rm(root, {recursive:true, force:true});
  }
});

test('packaging never mounts the private runtime secret into the build or exposes a public host port', async () => {
  const docker = await readFile(new URL('../infra/qa-frontend-v2/Dockerfile', import.meta.url), 'utf8');
  const compose = await readFile(new URL('../infra/qa-frontend-v2/compose.yaml', import.meta.url), 'utf8');
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.doesNotMatch(docker, /SUPABASE_SERVICE_ROLE_KEY|supabase_service_role/);
  assert.match(docker, /USER node/);
  assert.match(docker, /sha256:[a-f0-9]{64}/);
  assert.match(docker, /ARG QA_PUBLIC_CONFIG_SHA256/);
  assert.match(compose, /QA_PUBLIC_CONFIG_SHA256: \$\{QA_PUBLIC_CONFIG_SHA256:\?/);
  assert.match(compose, /127\.0\.0\.1:\$\{QA_FRONTEND_PORT/);
  assert.doesNotMatch(compose, /env_file:|network_mode:|privileged:|docker\.sock|container_name:/);
  assert.equal(vercel.git.deploymentEnabled['codex/qa-frontend-v2'], false);
});
