import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { NextRequest } from 'next/server.js';

const require = createRequire(import.meta.url);
const restaurantA = '73000000-0000-4000-8000-000000000001';
const restaurantB = '73000000-0000-4000-8000-000000000002';
const channelId = '74000000-0000-4000-8000-000000000001';
const secretSession = 'gh_74000000000040008000000000000001';
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 42]);
process.env.GASTROHELP_WAHA_WEBHOOK_URL = 'https://panel.invalid/api/whatsapp/waha/webhook';

function compile(file, imports) {
  const compiled = { exports: {} };
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(
    name => imports[name] || require(name), compiled, compiled.exports,
  );
  return compiled.exports;
}

const clone = value => value == null ? value : structuredClone(value);
function channel(overrides = {}) {
  return {
    id: channelId, restaurante_id: restaurantA, session_name: secretSession,
    phone_e164: null, status: 'SCAN_QR_CODE', enabled: false,
    chatbot_enabled: false, reviews_enabled: false, generation: 1, revision: 1,
    activated_at: null, created_at: '2026-09-13T00:00:00Z', updated_at: '2026-09-13T00:00:00Z',
    ...overrides,
  };
}
function fixture(overrides = {}) {
  const state = {
    authenticated: true, permitted: true, demo: false, configured: true,
    modules: { chatbot: true, resenas: true, estado: 'activo' },
    channel: channel(), session: { name: secretSession, status: 'SCAN_QR_CODE', phone: null, restricted: false },
    calls: [], contacts: [], failCas: false, failLogout: false, failStop: false, ...overrides,
  };
  const log = (operation, details = {}) => state.calls.push({ operation, ...details });
  const store = {
    getWahaChannelForRestaurant: async (_db, id) => {
      log('readChannel', { restaurantId: id });
      return state.channel?.restaurante_id === id ? clone(state.channel) : null;
    },
    createWahaChannel: async (_db, id) => {
      log('createChannel', { restaurantId: id });
      state.channel = channel({ restaurante_id: id, status: 'STOPPED' });
      return clone(state.channel);
    },
    getWahaContact: async (_db, id, phone) => {
      log('getContact', { channelId: id, phone });
      return clone(state.contacts.find(contact => contact.channel_id === id && contact.contact_phone === phone) || null);
    },
    resumeWahaContact: async (_db, id, phone) => {
      log('resumeContact', { channelId: id, phone });
      const contact = state.contacts.find(contact => contact.channel_id === id && contact.contact_phone === phone);
      if (!contact) return false;
      contact.paused = false;
      return true;
    },
    updateWahaChannel: async (_db, id, patch, generation, revision) => {
      log('updateChannel', { id, patch: clone(patch), generation, revision });
      if (state.failCas || !state.channel || id !== state.channel.id
        || generation !== state.channel.generation || revision !== state.channel.revision) return null;
      const previous = state.channel;
      const next = { ...previous, ...patch, revision: previous.revision + 1 };
      if (['phone_e164', 'enabled', 'chatbot_enabled', 'reviews_enabled'].some(key => next[key] !== previous[key])) {
        next.generation++;
      }
      // Mirror only the database identity guard relevant to route sequencing.
      if (next.phone_e164 !== previous.phone_e164) next.enabled = false;
      state.channel = next;
      return clone(next);
    },
  };
  const provider = {
    wahaConfigured: () => state.configured,
    getWahaSession: async session => {
      log('getSession', { session });
      const result = clone(state.session);
      await state.afterGetSession?.(state);
      return result;
    },
    createWahaSession: async (session, webhook) => {
      log('createSession', { session, webhook });
      state.session = { name: session, status: 'STOPPED', phone: null, restricted: false };
      return clone(state.session);
    },
    startWahaSession: async session => {
      log('startSession', { session });
      state.session = { name: session, status: 'SCAN_QR_CODE', phone: null, restricted: false };
      return clone(state.session);
    },
    logoutWahaSession: async session => {
      log('logoutSession', { session, enabledAtLogout: state.channel?.enabled });
      if (state.failLogout) throw new Error('secret provider URL and credentials must stay private');
      return { name: session, status: 'STOPPED', phone: null, restricted: false };
    },
    stopWahaSession: async session => {
      log('stopSession', { session, enabledAtStop: state.channel?.enabled, statusAtStop: state.channel?.status });
      if (state.failStop) throw new Error('private upstream failure');
      return { name: session, status: 'STOPPED', phone: null, restricted: false };
    },
    getWahaQr: async session => {
      log('getQr', { session });
      await state.afterGetQr?.(state);
      return { data: png, mimetype: 'image/png' };
    },
  };
  const db = {
    from: table => {
      if (table === 'whatsapp_channel_contacts') {
        const filters = {};
        const query = {
          select: fields => { log('selectContacts', { fields }); return query; },
          eq: (key, value) => { filters[key] = value; return query; },
          order: () => query,
          limit: async limit => {
            log('readContacts', { filters: clone(filters), limit });
            return { data: state.contacts.filter(contact => Object.entries(filters).every(([key, value]) => contact[key] === value)).slice(0, limit), error: null };
          },
        };
        return query;
      }
      assert.equal(table, 'restaurante_modulos');
      return { select: fields => ({ eq: (field, id) => ({ maybeSingle: async () => {
        log('readModules', { fields, field, restaurantId: id });
        return { data: clone(state.modules), error: state.moduleError || null };
      } }) }) };
    },
  };
  const imports = {
    '@supabase/supabase-js': { createClient: (_url, _key, options) => {
      log('createAuth', { authorization: options.global.headers.Authorization });
      return {
        auth: { getUser: async token => {
          log('getUser', { token });
          return { data: { user: state.authenticated ? { id: 'verified-user' } : null }, error: null };
        } },
        rpc: async (name, args) => {
          log('authRpc', { name, args });
          if (name === 'is_demo_user') return { data: state.demo, error: state.demoError || null };
          assert.equal(name, 'puede_acceder_restaurante');
          return { data: state.permitted && args.p_restaurante_id === restaurantA, error: state.accessError || null };
        },
      };
    } },
    '@/app/lib/supabaseAdmin': { getSupabaseAdmin: () => { log('getAdmin'); return db; } },
    '@/lib/whatsapp/waha-api': provider,
    '@/lib/whatsapp/waha-store': store,
  };
  const management = compile('../app/api/whatsapp/channel/route.ts', imports);
  const qr = compile('../app/api/whatsapp/channel/qr/route.ts', imports);
  function request(path, { body, authorization = 'Bearer valid-user-token', headers = {} } = {}) {
    return new NextRequest(`https://panel.invalid/api/whatsapp/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(authorization ? { Authorization: authorization } : {}), ...headers,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function call(route, options = {}) {
    const response = await (route === 'qr' ? qr.GET : options.body === undefined ? management.GET : management.POST)(
      request(route === 'qr' ? `channel/qr?restaurantId=${options.restaurantId || restaurantA}&generation=${options.generation ?? 1}`
        : `channel?restaurantId=${options.restaurantId || restaurantA}`, options),
    );
    const image = response.headers.get('content-type')?.startsWith('image/');
    return { status: response.status, headers: response.headers,
      body: image ? new Uint8Array(await response.arrayBuffer()) : await response.json() };
  }
  return { state, call, post: (action, body = {}) => call('channel', { body: {
    restaurantId: restaurantA, action, generation: state.channel?.generation, ...body,
  } }) };
}

function noPrivateAccess(state) {
  assert.equal(state.calls.some(call => ['getAdmin', 'readChannel', 'updateChannel', 'createChannel', 'getSession',
    'createSession', 'startSession', 'stopSession', 'logoutSession', 'getQr', 'getContact', 'resumeContact', 'readContacts'].includes(call.operation)), false);
}
function assertPrivate(response) {
  assert.match(response.headers.get('cache-control'), /private/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.match(response.headers.get('vary'), /Authorization/i);
}

test('missing or unverifiable bearer credentials cannot read a channel, fetch QR or mutate', async () => {
  for (const route of ['channel', 'qr']) {
    for (const options of [{ authorization: '' }, {}]) {
      const f = fixture({ authenticated: false });
      const result = await f.call(route, options);
      assert.ok([400, 401].includes(result.status));
      noPrivateAccess(f.state);
      assertPrivate(result);
    }
  }
  const f = fixture({ authenticated: false });
  assert.equal((await f.post('connect')).status, 401);
  noPrivateAccess(f.state);
});

test('a verified user cannot access another restaurant channel even when supplying its ID', async () => {
  for (const route of ['channel', 'qr']) {
    const f = fixture();
    assert.equal((await f.call(route, { restaurantId: restaurantB })).status, 403);
    noPrivateAccess(f.state);
  }
  const f = fixture();
  assert.equal((await f.post('connect', { restaurantId: restaurantB })).status, 403);
  noPrivateAccess(f.state);
});

test('access RPC errors and uncertain demo status fail closed for QR and mutations', async () => {
  for (const overrides of [{ accessError: { code: 'DB_UNAVAILABLE' } }, { demoError: { code: 'DB_UNAVAILABLE' } }, { demo: null }]) {
    for (const action of ['qr', 'connect', 'activate', 'pause', 'disconnect', 'resume_contact']) {
      const f = fixture(overrides);
      assert.equal((await (action === 'qr' ? f.call('qr') : f.post(action))).status, 403);
      noPrivateAccess(f.state);
    }
  }
});

test('read-only demo can see safe cached status but cannot fetch QR, poll provider or write', async () => {
  const f = fixture({ demo: true });
  const result = await f.call('channel');
  assert.equal(result.status, 200);
  assert.equal(result.body.readOnly, true);
  assert.equal(f.state.calls.some(call => ['getSession', 'updateChannel'].includes(call.operation)), false);
  for (const action of ['qr', 'connect', 'activate', 'pause', 'disconnect', 'resume_contact']) {
    const other = fixture({ demo: true });
    assert.equal((await (action === 'qr' ? other.call('qr') : other.post(action))).status, 403);
    noPrivateAccess(other.state);
  }
});

test('unconfigured provider reports readiness truthfully and cannot create a fake QR or session', async () => {
  const f = fixture({ configured: false, channel: null });
  const status = await f.call('channel');
  assert.equal(status.body.configured, false);
  assert.equal(status.body.channel, null);
  assert.equal((await f.post('connect')).status, 503);
  assert.equal((await f.call('qr')).status, 503);
  assert.equal(f.state.calls.some(call => ['createChannel', 'createSession', 'getSession', 'getQr'].includes(call.operation)), false);
});

test('server creates the session from the trusted channel and ignores supplied session, phone and restaurant fields', async () => {
  const f = fixture({ channel: null, session: null });
  const result = await f.post('connect', { session_name: 'attacker-session', phone_e164: '+447700900999',
    enabled: true, restaurant_id: restaurantB });
  assert.equal(result.status, 200);
  assert.equal(f.state.channel.restaurante_id, restaurantA);
  assert.equal(f.state.channel.enabled, false);
  assert.equal(f.state.channel.phone_e164, null);
  const created = f.state.calls.find(call => call.operation === 'createSession');
  assert.equal(created.session, secretSession);
  assert.equal(created.webhook, process.env.GASTROHELP_WAHA_WEBHOOK_URL);
});

test('restaurants without active chatbot/review modules cannot connect or activate those features', async () => {
  for (const modules of [{ chatbot: true, resenas: true, estado: 'inactivo' }, { chatbot: false, resenas: false, estado: 'activo' }]) {
    const f = fixture({ modules });
    assert.equal((await f.post('connect')).status, 409);
    assert.equal(f.state.calls.some(call => ['createChannel', 'createSession', 'startSession'].includes(call.operation)), false);
  }
  const f = fixture({ modules: { chatbot: false, resenas: true, estado: 'activo' },
    channel: channel({ status: 'WORKING', phone_e164: '+447700900124' }),
    session: { status: 'WORKING', phone: '447700900124', restricted: false } });
  assert.equal((await f.post('activate', { chatbotEnabled: true, reviewsEnabled: true })).status, 409);
  assert.equal(f.state.channel.enabled, false);
});

test('a paired session remains disabled until an explicit activation using the observed generation', async () => {
  const f = fixture({ session: { status: 'WORKING', phone: '447700900124', restricted: false } });
  let result = await f.call('channel');
  assert.equal(result.body.channel.phone, '+447700900124');
  assert.equal(result.body.channel.enabled, false);
  assert.equal((await f.post('activate', { generation: 1, chatbotEnabled: true })).status, 409);
  result = await f.post('activate', { chatbotEnabled: true, reviewsEnabled: false });
  assert.equal(result.status, 200);
  assert.equal(result.body.channel.enabled, true);
  assert.equal(result.body.channel.chatbotEnabled, true);
  assert.equal(result.body.channel.reviewsEnabled, false);
});

test('a changed linked number disables the old channel and cannot be silently activated or replaced', async () => {
  const f = fixture({ channel: channel({ phone_e164: '+447700900124', enabled: true, status: 'WORKING' }),
    session: { status: 'WORKING', phone: '447700900125', restricted: false } });
  const result = await f.call('channel');
  assert.equal(result.body.channel.status, 'NUMBER_MISMATCH');
  assert.equal(result.body.channel.enabled, false);
  assert.equal(result.body.channel.phone, '+447700900124');
  assert.equal((await f.post('activate', { chatbotEnabled: true })).status, 409);
  assert.equal((await f.post('connect')).status, 409);
  assert.equal(f.state.channel.phone_e164, '+447700900124');
});

test('restricted or incomplete provider sessions cannot activate messaging', async () => {
  for (const session of [{ status: 'WORKING', phone: '447700900124', restricted: true },
    { status: 'WORKING', phone: null, restricted: false }, { status: 'STARTING', phone: '447700900124', restricted: false }]) {
    const f = fixture({ channel: channel({ phone_e164: '+447700900124' }), session });
    assert.equal((await f.post('activate', { chatbotEnabled: true })).status, 409);
    assert.equal(f.state.channel.enabled, false);
  }
});

test('a stale client generation blocks all management actions before provider side effects', async () => {
  for (const action of ['connect', 'activate', 'pause', 'disconnect']) {
    const f = fixture({ channel: channel({ generation: 3 }) });
    assert.equal((await f.post(action, { generation: 2 })).status, 409);
    assert.equal(f.state.calls.some(call => ['updateChannel', 'getSession', 'createSession', 'logoutSession'].includes(call.operation)), false);
  }
});

test('a lost database revision race prevents connect and disconnect provider effects', async () => {
  for (const action of ['connect', 'disconnect']) {
    const f = fixture({ failCas: true });
    assert.equal((await f.post(action)).status, 409);
    assert.equal(f.state.calls.some(call => ['getSession', 'createSession', 'startSession', 'logoutSession'].includes(call.operation)), false);
  }
});

test('activation cannot overwrite a concurrent channel revision update', async () => {
  const f = fixture({ channel: channel({ status: 'WORKING', phone_e164: '+447700900124' }),
    session: { status: 'WORKING', phone: '447700900124', restricted: false },
    afterGetSession: state => { state.channel.revision++; } });
  assert.equal((await f.post('activate', { chatbotEnabled: true })).status, 409);
  assert.equal(f.state.channel.enabled, false);
});

test('disconnect persists disabled state before logout and preserves the pause if the provider fails', async () => {
  for (const failLogout of [false, true]) {
    const f = fixture({ failLogout, channel: channel({ status: 'WORKING', phone_e164: '+447700900124', enabled: true,
      chatbot_enabled: true, reviews_enabled: true }) });
    const result = await f.post('disconnect');
    assert.equal(result.status, failLogout ? 503 : 200);
    const logout = f.state.calls.find(call => call.operation === 'logoutSession');
    const stopped = f.state.calls.find(call => call.operation === 'stopSession');
    assert.equal(stopped.enabledAtStop, false);
    assert.equal(stopped.statusAtStop, 'STOPPED');
    assert.ok(f.state.calls.indexOf(stopped) < f.state.calls.indexOf(logout));
    assert.equal(logout.enabledAtLogout, false);
    assert.equal(f.state.channel.enabled, false);
    if (failLogout) {
      assert.equal(f.state.channel.phone_e164, '+447700900124');
      assert.deepEqual(result.body, { error: 'CHANNEL_UNAVAILABLE' });
    } else {
      assert.equal(f.state.channel.phone_e164, null);
      assert.equal(f.state.channel.status, 'STOPPED');
      assert.equal(f.state.channel.chatbot_enabled, false);
      assert.equal(f.state.channel.reviews_enabled, false);
    }
  }
});

test('pause remains available when provider configuration is absent', async () => {
  const f = fixture({ configured: false, channel: channel({ enabled: true, phone_e164: '+447700900124', status: 'WORKING' }) });
  assert.equal((await f.post('pause')).status, 200);
  assert.equal(f.state.channel.enabled, false);
  assert.equal(f.state.calls.some(call => ['getSession', 'logoutSession'].includes(call.operation)), false);
});

test('a failed provider stop keeps the database disconnected and never proceeds to logout', async () => {
  const f = fixture({ failStop: true, channel: channel({ enabled: true, phone_e164: '+447700900124', status: 'WORKING' }) });
  assert.equal((await f.post('disconnect')).status, 503);
  assert.equal(f.state.channel.enabled, false);
  assert.equal(f.state.channel.status, 'STOPPED');
  assert.equal(f.state.calls.some(call => call.operation === 'logoutSession'), false);
});

test('a stopped channel is not silently restarted or resynchronized by a status poll', async () => {
  const f = fixture({ channel: channel({ status: 'STOPPED' }), session: { status: 'WORKING', phone: '447700900124', restricted: false } });
  const result = await f.call('channel');
  assert.equal(result.status, 200);
  assert.equal(result.body.channel.status, 'STOPPED');
  assert.equal(result.body.channel.phone, null);
  assert.equal(f.state.calls.some(call => ['getSession', 'updateChannel', 'startSession'].includes(call.operation)), false);
});

test('paused contact listing is filtered to the authorized channel and exposes only the reviewed contact fields', async () => {
  const f = fixture({ demo: true, contacts: [
    { channel_id: channelId, contact_phone: '+447700900124', paused: true, paused_at: '2026-09-13T00:00:00Z', pause_reason: 'private' },
    { channel_id: 'other-channel', contact_phone: '+447700900125', paused: true, paused_at: '2026-09-13T00:00:00Z' },
    { channel_id: channelId, contact_phone: '+447700900126', paused: false, paused_at: '2026-09-13T00:00:00Z' },
  ] });
  const result = await f.call('channel');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.pausedContacts, [{ phone: '+447700900124', pausedAt: '2026-09-13T00:00:00Z' }]);
  const lookup = f.state.calls.find(call => call.operation === 'readContacts');
  assert.deepEqual(lookup.filters, { channel_id: channelId, paused: true });
  assert.ok(lookup.limit <= 50);
});

test('a restaurant can resume its paused customer using the E.164 phone returned by the status API', async () => {
  const f = fixture({ channel: channel({ status: 'WORKING', phone_e164: '+447700900100', enabled: true, chatbot_enabled: true }),
    contacts: [{ channel_id: channelId, contact_phone: '+447700900124', paused: true, paused_at: '2026-09-13T00:00:00Z' }] });
  const result = await f.post('resume_contact', { contactPhone: '+447700900124' });
  assert.equal(result.status, 200);
  assert.equal(f.state.contacts[0].paused, false);
  assert.deepEqual(result.body.pausedContacts, []);
  assert.equal(f.state.calls.find(call => call.operation === 'resumeContact').channelId, channelId);
  assert.equal(f.state.calls.some(call => ['getSession', 'createSession', 'startSession', 'stopSession', 'logoutSession'].includes(call.operation)), false);
});

test('resume cannot unpause an unknown contact or one belonging to a different restaurant channel', async () => {
  const f = fixture({ channel: channel({ status: 'WORKING', phone_e164: '+447700900100', enabled: true, chatbot_enabled: true }),
    contacts: [{ channel_id: 'other-channel', contact_phone: '+447700900124', paused: true }] });
  const result = await f.post('resume_contact', { contactPhone: '+447700900124', channelId: 'other-channel' });
  assert.equal(result.status, 409);
  assert.equal(f.state.contacts[0].paused, true);
  assert.equal(f.state.calls.some(call => call.operation === 'resumeContact'), false);
});

test('resume requires a current enabled chatbot channel and an authorized active chatbot module', async () => {
  for (const overrides of [{ enabled: false }, { chatbot_enabled: false }, { status: 'CAPPED' }]) {
    const f = fixture({ channel: channel({ status: 'WORKING', phone_e164: '+447700900100', enabled: true, chatbot_enabled: true, ...overrides }),
      contacts: [{ channel_id: channelId, contact_phone: '+447700900124', paused: true }] });
    assert.equal((await f.post('resume_contact', { contactPhone: '+447700900124' })).status, 409);
    assert.equal(f.state.calls.some(call => call.operation === 'resumeContact'), false);
  }
  const f = fixture({ modules: { chatbot: false, resenas: true, estado: 'activo' },
    channel: channel({ status: 'WORKING', phone_e164: '+447700900100', enabled: true, chatbot_enabled: true }),
    contacts: [{ channel_id: channelId, contact_phone: '+447700900124', paused: true }] });
  assert.ok([400, 409].includes((await f.post('resume_contact', { contactPhone: '+447700900124' })).status));
  assert.equal(f.state.calls.some(call => call.operation === 'resumeContact'), false);
});

test('QR is unavailable for stale generations, active channels and non-pairing states', async () => {
  for (const overrides of [{ generation: 2 }, { enabled: true }, { status: 'WORKING' }, { status: 'NUMBER_MISMATCH' }]) {
    const f = fixture({ channel: channel(overrides) });
    assert.equal((await f.call('qr')).status, 409);
    assert.equal(f.state.calls.some(call => call.operation === 'getQr'), false);
  }
});

test('QR fetched during a channel generation or status change is discarded', async () => {
  for (const afterGetQr of [state => { state.channel.generation++; }, state => { state.channel.enabled = true; },
    state => { state.channel.status = 'STOPPED'; }, state => { state.channel = null; }]) {
    const f = fixture({ afterGetQr });
    const result = await f.call('qr');
    assert.equal(result.status, 409);
    assert.equal(result.headers.get('content-type').startsWith('image/'), false);
  }
});

test('QR fetched across a reconnect revision change is discarded even when generation and visible status match', async () => {
  const f = fixture({ afterGetQr: state => { state.channel.revision++; } });
  const result = await f.call('qr');
  assert.equal(result.status, 409);
  assert.equal(result.headers.get('content-type').startsWith('image/'), false);
});

test('only the authorized restaurant pairing QR is returned with private non-cacheable headers', async () => {
  const f = fixture();
  const result = await f.call('qr');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, png);
  assertPrivate(result);
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(f.state.calls.find(call => call.operation === 'getQr').session, secretSession);
  assert.equal(f.state.calls.filter(call => call.operation === 'readChannel').length, 2);
});

test('public channel DTO contains only reviewed fields and never provider session or server secrets', async () => {
  const f = fixture({ demo: true, channel: channel({ api_key: 'not-for-browser', webhook_secret: 'also-private' }) });
  const result = await f.call('channel');
  assert.deepEqual(Object.keys(result.body.channel).sort(), ['id', 'phone', 'status', 'enabled', 'chatbotEnabled', 'reviewsEnabled', 'generation'].sort());
  const serialized = JSON.stringify(result.body);
  assert.doesNotMatch(serialized, /gh_7400|session_name|api_key|webhook_secret|not-for-browser|also-private/);
  assertPrivate(result);
});
