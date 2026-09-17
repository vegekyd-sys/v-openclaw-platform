#!/usr/bin/env node
// Gives tasks.list a request-scoped session-store cache.
//
// WHY. listTaskRecordPage (task-registry-B4-CJZk7.js:866) walks every task and
// runs the permission check LAST in the filter chain, so every task with a
// non-empty requester_session_key costs one resolveSessionSharingTarget. On
// production V that is N=7674 calls to return 100 rows — about 9 s. Those 7674
// calls only touch 1094 distinct session keys, and the distribution is heavily
// skewed (the hottest cron session repeats 1461 times; the top 5 cover 42%).
// A cache shared across one request collapses 7674 lookups into 1094.
//
// It helps whether or not the warm gate hits, which the exactRead patch alone
// could not guarantee:
//   gate hits  -> exactKeys are in the cache key, so 7674 point lookups
//                 collapse to 1094 distinct ones
//   gate misses-> exactKeys is cleared, so every call shares ONE cache entry
//                 and the full store is loaded once instead of 7674 times
//
// CORRECTNESS. tasks.list retries when readGatewayAccessRevision() changes
// mid-page — the point of that loop is to re-evaluate access after a
// permission change. A cache that outlived an attempt would feed the retry the
// same stale snapshot, so the caches are rebuilt at the top of every attempt.
// Within one attempt a shared snapshot is not just safe but better: without it
// the 7674 lookups can straddle a permission change and produce a mixed view,
// which is exactly what the revision check exists to reject.
//
// Runs against the target's own bytes — never copies a frozen artifact.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIST = process.argv[2];
if (!DIST) {
  console.error("usage: apply-task-access-storecache-patch.mjs <dist-dir>");
  process.exit(1);
}

const TASKS = join(DIST, "tasks-DNVtnKlS.js");
const SUMMARY = join(DIST, "task-summary-qdovVAE7.js");

// --- edit 1: create per-attempt caches and pass them into canReadTask
const TASKS_OLD_FILTER = `		const canReadTask = (task) => canAccessTaskRequesterSession({
			cfg,
			client,
			task
		});
`;
const TASKS_NEW_FILTER = `		let taskAccessCaches = {
			storeCache: /* @__PURE__ */ new Map(),
			targetDiscoveryCache: /* @__PURE__ */ new Map()
		};
		const canReadTask = (task) => canAccessTaskRequesterSession({
			cfg,
			client,
			task,
			storeCache: taskAccessCaches.storeCache,
			targetDiscoveryCache: taskAccessCaches.targetDiscoveryCache
		});
`;

// --- edit 2: reset those caches at the top of each retry attempt
const TASKS_OLD_ATTEMPT = `			const accessRevision = readGatewayAccessRevision();
			const pageResult = await listTaskRecordPage(pageParams);`;
const TASKS_NEW_ATTEMPT = `			taskAccessCaches = {
				storeCache: /* @__PURE__ */ new Map(),
				targetDiscoveryCache: /* @__PURE__ */ new Map()
			};
			const accessRevision = readGatewayAccessRevision();
			const pageResult = await listTaskRecordPage(pageParams);`;

// --- edit 3: forward the caches to resolveSessionSharingTarget
const SUMMARY_OLD = `	const sharingTarget = resolveSessionSharingTarget({
		cfg: params.cfg,
		...target
	});`;
const SUMMARY_NEW = `	const sharingTarget = resolveSessionSharingTarget({
		cfg: params.cfg,
		...params.storeCache ? { storeCache: params.storeCache } : {},
		...params.targetDiscoveryCache ? { targetDiscoveryCache: params.targetDiscoveryCache } : {},
		...target
	});`;

const tasksSrc = readFileSync(TASKS, "utf8");
const summarySrc = readFileSync(SUMMARY, "utf8");

if (tasksSrc.includes("taskAccessCaches") && summarySrc.includes("params.storeCache")) {
  console.log("already patched, nothing to do");
  process.exit(0);
}

// Compute both files fully before writing either, so a shape mismatch never
// leaves one file patched and the other not.
const check = (src, needle, label) => {
  const n = src.split(needle).length - 1;
  if (n !== 1) {
    console.error(`FAIL: ${label}: expected exactly 1 occurrence, found ${n}`);
    console.error("The bundle shape changed; re-verify against the live bytes before deploying.");
    process.exit(1);
  }
};

check(tasksSrc, TASKS_OLD_FILTER, "tasks canReadTask");
check(tasksSrc, TASKS_OLD_ATTEMPT, "tasks attempt loop");
check(summarySrc, SUMMARY_OLD, "task-summary sharingTarget");

// The attempt-loop edit must land after the filter edit in source order,
// otherwise the caches would be reset before they are declared.
if (tasksSrc.indexOf(TASKS_OLD_ATTEMPT) < tasksSrc.indexOf(TASKS_OLD_FILTER)) {
  console.error("FAIL: attempt loop precedes canReadTask; declaration order would be wrong");
  process.exit(1);
}

const tasksOut = tasksSrc
  .replace(TASKS_OLD_FILTER, TASKS_NEW_FILTER)
  .replace(TASKS_OLD_ATTEMPT, TASKS_NEW_ATTEMPT);
const summaryOut = summarySrc.replace(SUMMARY_OLD, SUMMARY_NEW);

writeFileSync(TASKS, tasksOut);
writeFileSync(SUMMARY, summaryOut);
console.log(`patched ${TASKS}`);
console.log(`patched ${SUMMARY}`);
