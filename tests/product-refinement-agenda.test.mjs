import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../app/(app)/dashboard/service-agenda.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { groupServiceArrivals } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const now = new Date('2026-09-27T19:45:00Z');
const arrival = (id, minutes, estado = 'confirmada') => Object.freeze({ id, nombre_cliente: id, personas: 2, estado,
  fecha_hora_reserva: minutes == null ? null : new Date(now.getTime() + minutes * 60_000).toISOString() });

test('service agenda prioritizes current and next 90 minutes without dropping any reservation', () => {
  const rows = Object.freeze([arrival('past', -500, 'completada'), arrival('pending', -300, 'pendiente'), arrival('current', -30), arrival('next', 60), arrival('later', 120), arrival('undated', null)]);
  const groups = groupServiceArrivals(rows, now);
  for (const [key, id] of Object.entries({ current: 'current', next: 'next', later: 'later', earlier: 'pending', finished: 'past', undated: 'undated' })) assert.equal(groups[key][0].id, id);
  assert.equal(Object.values(groups).flat().length, rows.length);
  assert.equal(new Set(Object.values(groups).flat().map(row => row.id)).size, rows.length);
  assert.equal(groups.earlier[0], rows[1], 'Identity, state and original record are preserved');
});

test('visual windows have exact inclusive boundaries and do not label a reservation late or attended', () => {
  const groups = groupServiceArrivals([-91, -90, 0, 1, 90, 91].map(n => arrival(String(n), n)), now);
  assert.deepEqual(groups.current.map(r => r.id), ['-90', '0']);
  assert.deepEqual(groups.next.map(r => r.id), ['1', '90']);
  assert.deepEqual(groups.later.map(r => r.id), ['91']);
  assert.deepEqual(groups.earlier.map(r => r.id), ['-91']);
  assert.ok(Object.values(groups).flat().every(row => row.estado === 'confirmada'));
});

test('existing terminal spellings stay accessible; unknown and arrived states remain open', () => {
  for (const state of ['completada', 'cancelada', 'no-show', 'no_show', 'No Show']) {
    const row = arrival(state, -30, state);
    assert.equal(groupServiceArrivals([row], now).finished[0], row);
  }
  for (const state of ['llegada', 'sentada', 'confirmada', 'custom_state', null]) {
    assert.equal(groupServiceArrivals([arrival('x', -30, state)], now).current[0].estado, state);
  }
});

test('missing clock and invalid dates never erase a record or mutate source order', () => {
  const a = arrival('next', 30), b = arrival('earlier', -60);
  const invalid = Object.freeze({ ...a, id: 'invalid', fecha_hora_reserva: 'not-a-date' });
  const rows = Object.freeze([a, invalid, b]);
  const groups = groupServiceArrivals(rows, null);
  assert.deepEqual(groups.later.map(r => r.id), ['earlier', 'next']);
  assert.equal(groups.undated[0], invalid);
  assert.deepEqual(rows.map(r => r.id), ['next', 'invalid', 'earlier']);
});

test('clock presentation has no data side effects; urgency thresholds remain unchanged', () => {
  assert.doesNotMatch(source, /supabase|fetch\(|localStorage|sessionStorage|\.estado\s*=/);
  const page = readFileSync(new URL('../app/(app)/dashboard/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /pedidosAbiertos\.filter\(\(p\) => minutosDesde\(p\.created_at\) >= 12\)/);
  assert.match(page, /pedidosAbiertos\.filter\(\(p\) => minutosDesde\(p\.created_at\) >= 20\)/);
  const elapsed = (created, clock) => Math.max(0, Math.floor((clock - Date.parse(created)) / 60_000));
  const created = [21, 13, 11, 9, 8, 7, 6, 5].map(age => new Date(now.getTime() - age * 60_000).toISOString());
  assert.equal(created.filter(date => elapsed(date, now.getTime()) >= 20).length, 1);
  assert.equal(created.filter(date => elapsed(date, now.getTime() + 20 * 60_000) >= 20).length, 8);
});
