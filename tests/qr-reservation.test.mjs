import test from 'node:test';
import assert from 'node:assert/strict';
import { clearStoredQrClose, eligibleQrReservations, parsePendingQrClose, pendingQrCloseKey, qrAdjustment, qrCloseRejected, qrCloseError } from '../app/(app)/lib/qr-reservation.ts';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = { id: id(1), restaurante_id: id(2), mesa_id: id(3), cliente_id: id(4), nombre_cliente: 'Cliente ficticio', estado: 'confirmada', inicio_at: '2026-09-08T12:00:00Z', fin_at: '2026-09-08T14:00:00Z', consumo_registrado_en: null };
const now = Date.parse('2026-09-08T13:00:00Z');
const orders = ['2026-09-08T12:30:00Z'];
const eligible = rows => eligibleQrReservations(rows, id(2), id(3), orders, now);
const pending = { restaurantId: id(2), request: { p_operacion_id: id(5), p_mesa_id: id(3), p_pedidos_ids: [id(6), id(7)], p_mesa_session_id: id(8), p_total_esperado: 30, p_descuento: 2, p_propina: 3, p_metodo_pago: 'tarjeta', p_notas: 'Prueba', p_reserva_id: id(1) } };

test('suggestions require exact restaurant and table; never infer from name', () => {
  assert.deepEqual(eligible([row, { ...row, id: id(10), restaurante_id: id(9) }, { ...row, id: id(11), mesa_id: id(9) }]), [row]);
});
test('unassigned clients, consumed/cancelled/no-show reservations are excluded', () => {
  assert.deepEqual(eligible([{ ...row, cliente_id: null }, { ...row, consumo_registrado_en: '2026-09-08T12:45:00Z' }, { ...row, estado: 'cancelada' }, { ...row, estado: 'no_show' }]), []);
});
test('service must include now and every order, using exclusive end', () => {
  assert.equal(eligibleQrReservations([row], id(2), id(3), orders, Date.parse(row.fin_at)).length, 0);
  assert.equal(eligibleQrReservations([row], id(2), id(3), [...orders, row.fin_at], now).length, 0);
  assert.equal(eligibleQrReservations([row], id(2), id(3), ['2026-09-08T11:59:59Z'], now).length, 0);
  assert.equal(eligibleQrReservations([row], id(2), id(3), [row.inicio_at], now).length, 1);
});
test('missing/invalid dates and empty accounts fail closed', () => {
  assert.deepEqual(eligible([{ ...row, inicio_at: null }]), []);
  assert.deepEqual(eligibleQrReservations([row], id(2), id(3), ['invalid'], now), []);
  assert.deepEqual(eligibleQrReservations([row], id(2), id(3), [], now), []);
});
test('pending operation round-trip retains exact ID, quote, reservation and tip', () => {
  assert.deepEqual(parsePendingQrClose(JSON.stringify(pending), id(2)), pending);
  assert.notEqual(pendingQrCloseKey(id(2)), pendingQrCloseKey(id(9)));
  assert.deepEqual(parsePendingQrClose(JSON.stringify({ ...pending, request: { ...pending.request, p_reserva_id: null } }), id(2)).request.p_reserva_id, null);
});
test('corrupt/wrong restaurant pending operation cannot be silently discarded', () => {
  assert.throws(() => parsePendingQrClose('{', id(2)));
  assert.throws(() => parsePendingQrClose(JSON.stringify(pending), id(9)));
  for (const patch of [{ p_operacion_id: 'invalid' }, { p_pedidos_ids: [] }, { p_pedidos_ids: [id(6), id(6)] }, { p_total_esperado: null }, { p_descuento: 31 }, { p_propina: -1 }, { p_propina: 1.001 }, { p_metodo_pago: 'unknown' }]) {
    assert.throws(() => parsePendingQrClose(JSON.stringify({ ...pending, request: { ...pending.request, ...patch } }), id(2)));
  }
});
test('only explicit rejection permits clearing a pending close', () => {
  for (const code of ['P0001', '22023', '23505', '42501', '40001', '55P03', 'PGRST202']) assert.equal(qrCloseRejected(code), true, code);
  for (const code of [undefined, '', '08006', '08007', 'PGRST116', 'TypeError', '504']) assert.equal(qrCloseRejected(code), false, String(code));
});
test('consumption conflicts and disabled module have actionable non-success wording', () => {
  assert.match(qrCloseError('CONSUMO_PREVIO_REQUIERE_REVISION'), /sin duplicarlo/);
  assert.match(qrCloseError('CAMARERO_DIGITAL_NO_ACTIVO'), /no está activo/);
  assert.match(qrCloseError('RESERVA_MESA_DISTINTA'), /no se ha cerrado/);
});
test('late response from A cannot erase later operation B; matching A is cleared', () => {
  let raw = JSON.stringify({ ...pending, request: { ...pending.request, p_operacion_id: id(99) } });
  const storage = { getItem: () => raw, removeItem: () => { raw = null; } };
  assert.equal(clearStoredQrClose(storage, pending), false);
  assert.ok(raw);
  raw = JSON.stringify(pending);
  assert.equal(clearStoredQrClose(storage, pending), true);
  assert.equal(raw, null);
  assert.equal(clearStoredQrClose(storage, pending), false);
});
test('invalid inputs are rejected before pending storage and never silently clamped', () => {
  for (const text of ['1.001', '10001', '-1', 'NaN', 'Infinity', 'texto', '1,000.00']) assert.throws(() => qrAdjustment(text, 10000));
  assert.throws(() => qrAdjustment('31', 30));
  assert.equal(qrAdjustment('1,25', 30), 1.25);
  assert.equal(qrAdjustment('.50', 30), 0.5);
  assert.equal(qrAdjustment('', 30), 0);
});
