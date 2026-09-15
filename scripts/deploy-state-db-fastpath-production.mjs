#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
process.env.V_PRODUCTION_RELEASE_PLAN = path.join(directory, 'state-db-fastpath-production-plan.mjs');
await import('./deploy-db91-process-global-writer-production.mjs');
