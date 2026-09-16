import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
const module={exports:{}};
new Function('module','exports',ts.transpileModule(readFileSync(new URL('../lib/orders/order-state.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports);
const {isOrderClosed,dashboardOrderFilter}=module.exports;
test('delivered food stays on the open-table count until settlement',()=>{
 const orders=[{table:'Mesa 10',state:'servido'},{table:'Mesa 10',state:'entregado'},{table:'Mesa 4',state:'cobrado'},{table:'Mesa 8',state:'cancelado'}];
 assert.deepEqual([...new Set(orders.filter(o=>!isOrderClosed(o.state)).map(o=>o.table))],['Mesa 10']);
 for(const state of [null,'nuevo','listo','servida','entregada'])assert.equal(isOrderClosed(state),false);
 for(const state of ['cerrado',' CERRADA ','cancelada','cobrada'])assert.equal(isOrderClosed(state),true);
});
test('dashboard request retains restaurant scope and includes unfinished orders from earlier days',async()=>{
 let url;const client=createClient('https://fixture.example.invalid','fixture-only',{global:{fetch:async request=>{url=new URL(request);return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});}}});
 await client.from('pedidos_qr').select('id').eq('restaurante_id','restaurant-a').or(dashboardOrderFilter('2026-09-16 00:00:00','2026-09-16 23:59:59'));
 assert.equal(url.searchParams.get('restaurante_id'),'eq.restaurant-a');
 assert.match(url.searchParams.get('or'),/and\(created_at\.gte\.2026-09-16 00:00:00,created_at\.lte\.2026-09-16 23:59:59\)/);
 assert.match(url.searchParams.get('or'),/estado\.not\.in\.\(cobrado,cobrada,cerrado,cerrada,cancelado,cancelada\)/);
 assert.match(url.searchParams.get('or'),/estado\.is\.null/);
 assert.equal(url.searchParams.has('created_at'),false);
});
