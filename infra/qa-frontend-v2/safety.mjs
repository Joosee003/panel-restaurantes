import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const publicNames = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SITE_URL',
];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message); // Never include values in errors.
}

function jwtRole(value) {
  try {
    return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()).role;
  } catch {
    return null;
  }
}

export function validatePublicConfig(config) {
  requireCondition(config && typeof config === 'object' && !Array.isArray(config), 'QA public config must be an object');
  requireCondition(Object.keys(config).length === publicNames.length && Object.keys(config).every(key => publicNames.includes(key)), 'Only the three documented public variables are allowed');
  for (const name of publicNames) requireCondition(typeof config[name] === 'string' && config[name].trim() === config[name] && config[name].length > 0, `Missing or invalid ${name}`);
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SITE_URL']) {
    let url;
    try { url = new URL(config[name]); } catch { throw new Error(`Invalid ${name}`); }
    requireCondition(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, `Unsafe ${name}`);
    requireCondition(url.hostname === 'qa.gastrohelp.es' || url.hostname.endsWith('.qa.gastrohelp.es'), `${name} must use the existing protected QA namespace`);
    if (name === 'NEXT_PUBLIC_SITE_URL') requireCondition(url.pathname === '/' && url.hostname !== 'qa.gastrohelp.es', 'The second frontend must have a separate QA hostname');
  }
  const key = config.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  requireCondition(key.startsWith('sb_publishable_') || jwtRole(key) === 'anon', 'Public key must be publishable or legacy anon, never service_role');
  return config;
}

export function validateServiceKey(key, config) {
  requireCondition(typeof key === 'string' && key.length > 0, 'Missing server-only QA service key');
  requireCondition(key.startsWith('sb_secret_') || jwtRole(key) === 'service_role', 'Invalid server-only key type');
  requireCondition(!Object.values(config).some(value => value.includes(key)), 'Server key must never appear in public config');
}

export function validateRuntimeEnvironment(env) {
  for (const name of Object.keys(env)) {
    requireCondition(!name.startsWith('NEXT_PUBLIC_') && !/^(SUPABASE_|N8N_|WAHA_|GASTROHELP_WAHA_|META_|VERCEL_|DEMO_USER_EMAIL)/.test(name), 'Do not inherit application variables; use the isolated QA files only');
  }
}

export async function assertNoPrivateKeyInPublicAssets(root, privateKey) {
  let scanned = 0;
  async function walk(directory, renderedOnly = false) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file, renderedOnly);
      else if (entry.isFile() && (!renderedOnly || /\.(html|rsc|txt|body|json|map)$/.test(entry.name))) {
        const data = await readFile(file);
        const text = data.toString('utf8');
        // Supabase's public SDK contains the bare prefix as a type check.
        // A key value after that prefix, unlike the prefix itself, is forbidden.
        requireCondition(!text.includes('SUPABASE_SERVICE_ROLE_KEY') && !/sb_secret_[A-Za-z0-9_-]{6,}/.test(text), 'Private-key reference found in public build assets');
        requireCondition(!privateKey || !data.includes(Buffer.from(privateKey)), 'Private key found in public build assets');
        for (const token of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) requireCondition(jwtRole(token[0]) !== 'service_role', 'Privileged JWT found in public build assets');
        scanned++;
      }
    }
  }
  await walk(path.join(root, '.next/static'));
  await walk(path.join(root, 'public'));
  await walk(path.join(root, '.next/server/app'), true);
  requireCondition(scanned > 0, 'No public build assets found');
  return scanned;
}
