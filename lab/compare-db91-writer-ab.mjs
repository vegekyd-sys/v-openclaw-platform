import fs from 'node:fs';
import {compareDb91WriterAb} from './db91-writer-ab-analysis.mjs';

const [baselinePath, candidatePath] = process.argv.slice(2);
if (!baselinePath || !candidatePath) throw new Error('Usage: compare-db91-writer-ab.mjs BASELINE.json CANDIDATE.json');
const result = compareDb91WriterAb(
  JSON.parse(fs.readFileSync(baselinePath, 'utf8')),
  JSON.parse(fs.readFileSync(candidatePath, 'utf8')),
);
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
