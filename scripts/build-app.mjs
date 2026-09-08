import {spawnSync} from 'node:child_process';
import {rm} from 'node:fs/promises';
// The rehearsal is generated only on the authorized feature preview, never on production.
const rehearsal=process.env.VERCEL_ENV==='preview' && process.env.VERCEL_GIT_COMMIT_REF==='codex/post-visit-reviews';
await rm(new URL('../public/pruebas-resenas',import.meta.url),{recursive:true,force:true});
if(rehearsal) await import('./build-review-preview.mjs');
const result=spawnSync(process.execPath,['node_modules/next/dist/bin/next','build',...process.argv.slice(2)],{stdio:'inherit',env:process.env});
if(result.error) console.error(result.error.message);
process.exitCode=result.status??1;
