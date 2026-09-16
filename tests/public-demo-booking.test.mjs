import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=(path,imports)=>{const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{if(name in imports)return imports[name];throw Error(name)},m,m.exports);return m.exports;};
test('public demo rejects valid direct booking requests before storing contact details',async()=>{
  let writes=0;
  const route=compile('../app/api/public/restaurants/[slug]/bookings/route.ts',{
    'next/server':{NextResponse:{json:(b,o={})=>new Response(JSON.stringify(b),o)}},
    '../../../../../lib/bookingDate':{isBookingStartAllowed:()=>true},
    '../../../../../lib/publicLegal':{BOOKING_LEGAL_VERSION:'2026-08-03'},
    '../../../../../lib/publicRestaurant':{getPublicRestaurant:async()=>({demo:true,booking:{enabled:true}})},
    '../../../../../lib/publicRateLimit':{consumePublicRateLimit:async()=>true},
    '../../../../../lib/supabaseAdmin':{getSupabaseAdmin:()=>{writes++;throw Error('Must not reach storage')}},
  });
  const response=await route.POST(new Request('https://fixture.invalid/api/public/restaurants/demo/bookings',{method:'POST',body:JSON.stringify({start:'2026-09-20T12:00:00Z',party:2,name:'Private name',phone:'+34600000000',privacyInformed:true,conditionsAccepted:true,legalVersion:'2026-08-03',idempotencyKey:'11111111-1111-4111-8111-111111111111'})}),{params:Promise.resolve({slug:'demo'})});
  assert.equal(response.status,403);assert.equal((await response.json()).error,'DEMO_READ_ONLY');assert.equal(writes,0);
});
