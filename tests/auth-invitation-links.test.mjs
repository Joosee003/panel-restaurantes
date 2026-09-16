import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function fixture(url, failure=false){
 const calls=[]; const auth={
  verifyOtp:async value=>{calls.push(['verify',value.type]);return {error:failure?Error('expired'):null}},
  setSession:async()=>{calls.push(['set']);return {error:null}},
  getSession:async()=>{calls.push(['get']);return {data:{session:{user:{id:'synthetic'}}}}},
 };
 globalThis.window={location:{href:url},history:{replaceState:(_state,_title,path)=>calls.push(['clear',path])}};
 globalThis.document={title:'Fixture'};
 const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(new URL('../app/(public)/auth/sessionFromUrl.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(()=>({supabase:{auth}}),m,m.exports);
 return {calls,run:()=>m.exports.getSessionFromAuthUrl({expectedType:['invite','recovery']})};
}
test('first invitation and recovery resend both validate their URL token and clean the URL',async()=>{
 const previous=[globalThis.window,globalThis.document];
 try { for(const type of ['invite','recovery']){
  const f=fixture(`https://fixture.invalid/auth/accept-invite?token_hash=fake&type=${type}`);
  await f.run();assert.deepEqual(f.calls,[['verify',type],['clear','/auth/accept-invite'],['get']]);
 }}finally{[globalThis.window,globalThis.document]=previous;}
});
test('expired or unrelated links never fall back to an already signed-in account',async()=>{
 const previous=[globalThis.window,globalThis.document];
 try {
  const expired=fixture('https://fixture.invalid/auth/accept-invite?token_hash=fake&type=invite',true);
  await assert.rejects(expired.run(),/expired/);assert.equal(expired.calls.some(c=>c[0]==='get'),false);
  const unrelated=fixture('https://fixture.invalid/auth/accept-invite#access_token=fake&refresh_token=fake&type=signup');
  await assert.rejects(unrelated.run(),/AUTH_LINK_TYPE_INVALID/);assert.deepEqual(unrelated.calls,[]);
  const missing=fixture('https://fixture.invalid/auth/accept-invite');
  await assert.rejects(missing.run(),/AUTH_LINK_REQUIRED/);assert.deepEqual(missing.calls,[]);
 }finally{[globalThis.window,globalThis.document]=previous;}
});
