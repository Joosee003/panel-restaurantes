import {build} from 'vite';
import {prepareReviewPreview} from './prepare-review-preview.mjs';
await prepareReviewPreview();
await build({configFile:'tests/review-preview/vite.config.ts'});
