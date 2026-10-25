# Public Voice capability runtime (Candidate)

Platform-owned, bounded Public backend model and tool policy. The Voice service
imports `createPublicVoiceRuntime` from an explicit installed module path and
constructs an opaque `bind({visitorId, leaseId, isAuthorized})` adapter only after
its existing device grant is verified. No administrator Gateway, account cookie,
private workspace, shell, arbitrary file tool, or personal memory index is used.

The model has four tools: public DeepSeek web search, the current visitor's own
memory search/write, and their task status. Voice owns conversation/end-call and
its existing background-task controller; the adapter supplies the task RPC
contract. All identity/path arguments are rejected or server-derived. Storage is
hashed by visitor, task access additionally requires the original device lease.
Ongoing tasks poll that lease and abort within 250 ms of its invalidation. Model
and search requests receive abort signals; every new tool step rechecks the lease.

Task admission is persisted before execution. Replays reuse the original task;
service restart marks unfinished work interrupted rather than replaying it.
Hangup leaves the same task running while its lease remains valid. Reconnect can
read it using `task_status`; successful results also enter that visitor's memory.
There is one running task per visitor, eight globally, 12 model steps and ten
minutes per task. Memory keeps 500 bounded fragments per visitor and each ledger
is capped below 4 MB. Capacity and storage errors are failures, never fake receipts.

`providers.mjs` reuses the platform's existing DeepSeek Search adapter and uses
an ordinary DeepSeek text model for multi-step background work. Provider keys
are host-only constructor options and never enter model messages. Test with:

```
node --test apps/v-voice-public/runtime.test.mjs
```

Runtime data belongs in a dedicated 0700 directory outside this repository;
ledgers are 0600 and written atomically. This module does not deploy itself or
change shared Gateway/Worker policy. Production promotion still needs its own
review and shared integration evidence.
