import {spawn} from 'node:child_process';
const args=process.argv.slice(2);
// The supervised browser preview supplies Vite's flags. Normal development keeps Next.js.
const reviewPreview=args.includes('--strictPort');
if(reviewPreview) await (await import('./prepare-review-preview.mjs')).prepareReviewPreview();
const child=spawn(process.execPath,reviewPreview
 ? ['node_modules/vite/bin/vite.js','--config','tests/review-preview/vite.config.ts',...args]
 : ['node_modules/next/dist/bin/next',...['dev',...args]],{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
