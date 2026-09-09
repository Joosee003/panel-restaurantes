import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { create, act } from 'react-test-renderer';

// Exercise the production React boundary and resolver; only the network and
// browser storage are replaced. No credentials, real customers or messages.
const require = createRequire(import.meta.url);
const { useQuery, useQueryClient } = require('@tanstack/react-query');
const root = resolve(import.meta.dirname, '..');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const memory = () => {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,String(v)), removeItem: k => values.delete(k), clear: () => values.clear() };
};
const windowMock = new EventTarget();
windowMock.sessionStorage = memory();
windowMock.localStorage = memory();
windowMock.setTimeout = setTimeout;
globalThis.window = windowMock;
let actor = 'owner-a';
const listeners = new Set();
let checkAccess = async () => ({ data: true, error: null });
let membership = 'restaurant-a';
const db = {
  auth: {
    getUser: async () => ({ data: { user: actor ? { id: actor } : null } }),
    getSession: async () => ({ data: { session: actor ? { user: { id: actor } } : null } }),
    onAuthStateChange: callback => {
      listeners.add(callback);
      queueMicrotask(() => { if (listeners.has(callback)) callback('INITIAL_SESSION', actor ? { user: { id: actor } } : null); });
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    },
  },
  rpc: (...args) => checkAccess(...args),
  from: () => {
    const builder = { select: () => builder, eq: () => builder, order: () => builder, limit: () => builder,
      maybeSingle: async () => ({ data: { restaurante_id: membership }, error: null }) };
    return builder;
  },
};
const modules = new Map();
function load(file) {
  let path = resolve(root, file);
  if (!existsSync(path)) path = ['.ts','.tsx'].map(ext => path + ext).find(existsSync);
  if (path.endsWith('/lib/supabaseClient.ts')) return { supabase: db };
  if (path.endsWith('/query/queryClientConfig.ts')) return { queryClientConfig: { queries: { gcTime: 0, retry: false } } };
  if (modules.has(path)) return modules.get(path).exports;
  const compiled = { exports: {} }; modules.set(path, compiled);
  const source = ts.transpileModule(readFileSync(path,'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const localRequire = name => name.startsWith('.') ? load(resolve(dirname(path),name)) : require(name);
  new Function('require','module','exports',source)(localRequire,compiled,compiled.exports);
  return compiled.exports;
}
const { default: RestaurantScope } = load('app/(app)/components/RestaurantScope.tsx');
const selection = load('app/(app)/lib/activeRestaurant.ts');
const { getRestauranteUsuario } = load('app/(app)/lib/getRestauranteUsuario.ts');
const tick = () => new Promise(r => setTimeout(r, 15));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const signIn = id => { actor = id; for (const f of listeners) f(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? { user: { id } } : null); };

// The same query key deliberately reproduces the regression in useRestaurante.
let loadData = async () => selection.getActiveRestaurant();
let latest;
function Panel() {
  const client = useQueryClient();
  const [draft, setDraft] = React.useState('');
  const query = useQuery({ queryKey: ['restaurante'], queryFn: () => loadData(), staleTime: 60_000, retry: false });
  React.useLayoutEffect(() => { latest = { client, draft, setDraft, data: query.data }; }, [client, draft, query.data]);
  return React.createElement('output', null, query.data ?? 'loading');
}
const panel = () => React.createElement(RestaurantScope, null, React.createElement(Panel));

test('switch A → B → A clears cached restaurant, local forms and old cache', async () => {
  selection.setActiveRestaurant('restaurant-a');
  let renderer;
  await act(async () => { renderer = create(panel()); await tick(); });
  await act(tick);
  assert.equal(latest.data,'restaurant-a');
  const cacheA = latest.client;
  await act(async () => latest.setDraft('unsaved client A'));
  await act(async () => { selection.setActiveRestaurant('restaurant-b'); await tick(); });
  await act(tick);
  assert.equal(latest.data,'restaurant-b'); assert.equal(latest.draft,'');
  assert.notEqual(latest.client,cacheA); assert.equal(cacheA.getQueryCache().getAll().length,0);
  await act(async () => { selection.setActiveRestaurant('restaurant-a'); await tick(); });
  await act(tick); assert.equal(latest.data,'restaurant-a'); assert.equal(latest.draft,'');
  await act(async () => renderer.unmount());
});

test('late response from A cannot populate B, including after returning to A', async () => {
  const old = deferred(); selection.setActiveRestaurant('restaurant-a'); loadData = () => old.promise;
  let renderer;
  await act(async () => { renderer=create(panel()); await tick(); });
  const oldCache=latest.client;
  loadData=async () => selection.getActiveRestaurant();
  await act(async () => { selection.setActiveRestaurant('restaurant-b'); await tick(); });
  await act(tick);
  await act(async () => { old.resolve('stale private A'); await tick(); });
  assert.equal(latest.data,'restaurant-b'); assert.equal(oldCache.getQueryCache().getAll().length,0);
  await act(async () => { selection.setActiveRestaurant('restaurant-a'); await tick(); });
  await act(tick); assert.equal(latest.data,'restaurant-a');
  await act(async () => renderer.unmount());
});

test('account changes discard cache even with the same restaurant; refresh preserves drafts', async () => {
  selection.setActiveRestaurant('restaurant-a'); actor='owner-a'; loadData=async () => actor;
  let renderer;
  await act(async () => { renderer=create(panel()); await tick(); }); await act(tick);
  await act(async () => latest.setDraft('keep on refresh'));
  const cache=latest.client;
  await act(async () => signIn('owner-a'));
  assert.equal(latest.client,cache); assert.equal(latest.draft,'keep on refresh');
  await act(async () => { signIn('owner-b'); await tick(); }); await act(tick);
  assert.equal(latest.data,'owner-b'); assert.equal(latest.draft,''); assert.notEqual(latest.client,cache);
  await act(async () => { signIn(null); await tick(); }); await act(tick);
  assert.equal(latest.data,null); assert.equal(latest.draft,'');
  await act(async () => renderer.unmount()); actor='owner-a';
});

test('selection uses tab storage; shared legacy value cannot replace this panel', () => {
  selection.setActiveRestaurant('restaurant-a');
  window.localStorage.setItem(selection.ACTIVE_RESTAURANT_KEY,'restaurant-b');
  assert.equal(selection.getActiveRestaurant(),'restaurant-a');
  window.sessionStorage.clear(); assert.equal(selection.getActiveRestaurant(),null);
  selection.setActiveRestaurant('restaurant-b');
  assert.equal(window.localStorage.getItem(selection.ACTIVE_RESTAURANT_KEY),null);
});

test('unauthorized selection is not returned; default is an assigned restaurant', async () => {
  selection.setActiveRestaurant('foreign'); checkAccess=async () => ({ data:false,error:null });
  assert.equal(await getRestauranteUsuario(),null); assert.equal(selection.getActiveRestaurant(),null);
  membership='restaurant-a'; assert.equal(await getRestauranteUsuario(),'restaurant-a');
});

test('permission lookup error fails closed and does not silently select another restaurant', async () => {
  selection.setActiveRestaurant('restaurant-b'); checkAccess=async () => ({ data:null,error:new Error('offline') });
  await assert.rejects(getRestauranteUsuario(), /offline/);
  assert.equal(selection.getActiveRestaurant(),'restaurant-b');
});

test('delayed access check cannot undo a new selection or account change', async () => {
  const check=deferred(); checkAccess=() => check.promise; selection.setActiveRestaurant('restaurant-a');
  const resolving=getRestauranteUsuario(); await tick(); selection.setActiveRestaurant('restaurant-b');
  check.resolve({data:true,error:null}); assert.equal(await resolving,null);
  const check2=deferred(); checkAccess=() => check2.promise;
  const resolving2=getRestauranteUsuario(); await tick(); actor='owner-b';
  check2.resolve({data:true,error:null}); assert.equal(await resolving2,null); actor='owner-a';
});

test('kitchen service isolates orders for an agency account with access to both restaurants', async () => {
  const from=db.from;
  const orders=[{id:'order-a',restaurante_id:'restaurant-a',mesa:'1'}, {id:'order-b',restaurante_id:'restaurant-b',mesa:'1'}];
  db.from=table => {
    assert.equal(table,'pedidos_qr');
    let rows=orders;
    const builder={ select:()=>builder, eq:(key,value)=>{rows=rows.filter(r=>r[key]===value);return builder;}, order:()=>builder, limit:async()=>({data:rows,error:null}) };
    return builder;
  };
  try {
    const { getPedidosByRestaurante }=load('app/services/pedidos.service.ts');
    assert.deepEqual((await getPedidosByRestaurante('restaurant-a')).map(r=>r.id),['order-a']);
    assert.deepEqual((await getPedidosByRestaurante('restaurant-b')).map(r=>r.id),['order-b']);
    await assert.rejects(getPedidosByRestaurante(''),/Selecciona/);
  } finally { db.from=from; }
});

test('reputation rejects an explicit foreign URL and recovers a stale preference after login', () => {
  const { selectOpinionRestaurant }=load('lib/opiniones/restaurantSelection.ts');
  const a={restaurante_id:'restaurant-a'}, b={restaurante_id:'restaurant-b'};
  assert.equal(selectOpinionRestaurant([b],'restaurant-a','restaurant-b'),null);
  assert.equal(selectOpinionRestaurant([b],null,'restaurant-a'),b);
  assert.equal(selectOpinionRestaurant([a,b],'restaurant-b','restaurant-a'),b);
  assert.equal(selectOpinionRestaurant([a,b],null,'unknown'),null);
});
