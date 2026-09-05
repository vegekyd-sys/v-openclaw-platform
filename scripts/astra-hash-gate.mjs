import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const [phase,core,worker]=process.argv.slice(2);
assert(['before','after'].includes(phase));assert(core&&worker);
assert.equal(JSON.parse(fs.readFileSync(`${core}/package.json`)).version,'2026.9.1');
const files=[
  [`${core}/dist/model-route-contract-B2Q_03Gg.js`,'93b53a2dc672f42655fb825c129815c3ada1ef73e571c4f64076461aea71e84a','b5742a35a72498ea00fd6a40433090be4e7d0ecd8188415a1371441e28473b9d'],
  [`${core}/dist/openai-chatgpt-provider-BApw3_oy.js`,'e804793440fa4f2671d12a13f58778a0cd0f7eeb9c105e79a44d29e3a390c254','f31ddb3e6896bb884823a85c32ca60d59a11e1c2c77cde7eb8d9b4c3fc2de06d'],
  [`${worker}/openclaw.plugin.json`,'ae075e7a9f861c34bf36747e42e439a196a0e28b04cdd4d4cd53d5f20d2eff13','2af61b3949b4abca021cf397f999ecde27fa4cf93f81b1f90c476e23278c7cec'],
];
for(const [file,before,after] of files) {
  const hash=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(hash,phase==='before'?before:after,`Hash drift: ${file}; review, do not bypass or overwrite another patch`);
}
console.log(JSON.stringify({phase,matched:files.length,openclaw:'2026.9.1'}));
