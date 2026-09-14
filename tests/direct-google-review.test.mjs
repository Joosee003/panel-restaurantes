import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import React from 'react';
import {create,act} from 'react-test-renderer';
import ts from 'typescript';

const require=createRequire(import.meta.url);
function compile(file,imports={}) {
  const module={exports:{}};
  const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','module','exports',code)(name=>imports[name]||require(name),module,module.exports);
  return module.exports;
}
const flow=compile('../lib/reviews/review-flow.ts');
const {default:DirectGoogleReview}=compile('../app/r/[token]/google/DirectGoogleReview.tsx',{'@/lib/reviews/review-flow':flow});
const original={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const target='https://search.google.com/local/writereview?placeid=fixture';
const token='76000000-0000-4000-8000-000000000001';
function setup({visibility='visible',prerender=false,fail=false}={}) {
  const calls=[];
  const document=new EventTarget();document.visibilityState=visibility;document.prerendering=prerender;
  globalThis.document=document;
  globalThis.window={location:{replace:url=>calls.push({kind:'navigate',url})}};
  globalThis.fetch=(url,options)=>{calls.push({kind:'track',url,options});return fail?Promise.reject(Error('offline')):new Promise(()=>{});};
  return {calls,document};
}
after(()=>{globalThis.window=original.window;globalThis.document=original.document;globalThis.fetch=original.fetch;globalThis.IS_REACT_ACT_ENVIRONMENT=original.act;});
test('visible navigation goes straight to Google once, without waiting for tracking or requiring a button',async()=>{
  const f=setup();let renderer;
  await act(async()=>{renderer=create(React.createElement(React.StrictMode,null,React.createElement(DirectGoogleReview,{token,target})));});
  assert.deepEqual(f.calls.map(c=>c.kind),['track','navigate']);
  assert.equal(f.calls[1].url,target);assert.equal(f.calls[0].options.method,'POST');assert.equal(f.calls[0].options.keepalive,true);
  assert.equal(f.calls[0].options.body.get('action'),'google');assert.equal(f.calls[0].options.credentials,'omit');
  assert.equal(renderer.root.findAllByType('button').length,0);
  await act(async()=>renderer.unmount());
});
test('background and prerendered pages wait until activated before tracking or navigating',async()=>{
  const f=setup({visibility:'hidden',prerender:true});let renderer;
  await act(async()=>{renderer=create(React.createElement(DirectGoogleReview,{token,target}));});assert.equal(f.calls.length,0);
  f.document.visibilityState='visible';f.document.dispatchEvent(new Event('visibilitychange'));assert.equal(f.calls.length,0);
  f.document.prerendering=false;f.document.dispatchEvent(new Event('prerenderingchange'));assert.equal(f.calls.length,2);
  f.document.dispatchEvent(new Event('visibilitychange'));assert.equal(f.calls.length,2);
  await act(async()=>renderer.unmount());
});
test('a tracking error cannot prevent Google opening, and unsafe destinations cannot redirect',async()=>{
  const f=setup({fail:true});let renderer;
  await act(async()=>{renderer=create(React.createElement(DirectGoogleReview,{token,target}));});assert.equal(f.calls.at(-1).url,target);
  await act(async()=>renderer.unmount());
  const unsafe=setup();
  await act(async()=>{renderer=create(React.createElement(DirectGoogleReview,{token,target:'https://google.com.evil.invalid/'}));});
  assert.equal(unsafe.calls.length,0);assert.equal(renderer.root.findAllByType('a').length,0);
  await act(async()=>renderer.unmount());
});
