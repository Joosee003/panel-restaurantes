import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({
 root:fileURLToPath(new URL('.',import.meta.url)),
 base:'/pruebas-resenas/',
 resolve:{alias:{'@':fileURLToPath(new URL('../../',import.meta.url))}},
 oxc:{jsx:{runtime:'automatic'}},
 server:{host:'0.0.0.0',allowedHosts:['terminal.local']},
 build:{outDir:'../../public/pruebas-resenas',emptyOutDir:true,rolldownOptions:{input:{
  index:fileURLToPath(new URL('./index.html',import.meta.url)),
  mobile:fileURLToPath(new URL('./mobile.html',import.meta.url)),
 }}},
});
