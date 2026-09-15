import {spawnSync} from 'node:child_process';
import {rm,copyFile} from 'node:fs/promises';
// Rehearsals use synthetic data and exist only on these feature previews, never in production.
const rehearsal=process.env.VERCEL_ENV==='preview' && ['codex/post-visit-reviews','feat/reviews-customer-panel'].includes(process.env.VERCEL_GIT_COMMIT_REF);
await rm(new URL('../public/pruebas-resenas',import.meta.url),{recursive:true,force:true});
if(rehearsal) await import('./build-review-preview.mjs');
await rm(new URL('../public/pruebas-agencia',import.meta.url),{recursive:true,force:true});
if(process.env.VERCEL_ENV==='preview' && process.env.VERCEL_GIT_COMMIT_REF==='feat/agency-control-center') {
  const {build}=await import('vite');
  await build({configFile:'tests/agency-preview/vite.config.ts'});
}
// Responsive browser QA is available only on the restaurant redesign preview.
await rm(new URL('../public/qa-la-reserva.html',import.meta.url),{force:true});
if(process.env.VERCEL_ENV==='preview' && process.env.VERCEL_GIT_COMMIT_REF==='feat/la-reserva-modern') {
  await copyFile(new URL('../tests/la-reserva-preview/index.html',import.meta.url),new URL('../public/qa-la-reserva.html',import.meta.url));
}
const result=spawnSync(process.execPath,['node_modules/next/dist/bin/next','build',...process.argv.slice(2)],{stdio:'inherit',env:process.env});
if(result.error) console.error(result.error.message);
process.exitCode=result.status??1;
