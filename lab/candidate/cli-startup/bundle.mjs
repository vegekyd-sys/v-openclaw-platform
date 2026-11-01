import {createRequire} from 'node:module';
const [,, bundler, pkgs, out]=process.argv;
const require=createRequire(bundler+'/x.js');const esbuild=require('esbuild');
await esbuild.build({absWorkingDir:pkgs,entryPoints:{'typebox-index':'typebox/build/index.mjs','typebox-compile':'typebox/build/compile/index.mjs','typebox-format':'typebox/build/format/index.mjs','typebox-guard':'typebox/build/guard/index.mjs','typebox-schema':'typebox/build/schema/index.mjs','typebox-value':'typebox/build/value/index.mjs','kysely-index':'kysely/dist/index.js'},bundle:true,format:'esm',splitting:true,platform:'node',outdir:out,outExtension:{'.js':'.mjs'},chunkNames:'c-[hash]',keepNames:false,metafile:false,logLevel:'warning'});
