---
apiVersion: nightshift.versa.ai/v1alpha1
kind: Workflow
metadata:
  id: vlab-native-dispatch-smoke
  version: 0.2.0
  name: VLab 原生 Workboard 接力验收
spec:
  ownerAgentRole: operator
  concurrency: {perInstance: 1, maxActiveInstances: 5}
  inputs:
    runTag: {type: string, required: true}
---

# VLab 原生 Workboard 接力验收

## STAGE a｜第一棒

### Goal

调用 exec 在前台等待 15 秒，确认当前 runTag，随后按 Workboard 原生完成协议完成本卡；不得启动后台任务。

```stage
actor: agent
scope: project
skills: [background-worker-contract]
outputs: [stageAResult]
completeWhen: [output.stageAResult.recorded]
timeout: 10m
retry: {maxAttempts: 1, idempotencyKey: "${instance.id}:a"}
next: [b]
```

## STAGE b｜第二棒

### Goal

确认 A 已完成，调用 exec 在前台等待 15 秒，随后按 Workboard 原生完成协议完成本卡；不得启动后台任务。

```stage
actor: agent
scope: project
skills: [background-worker-contract]
needs: [a]
outputs: [stageBResult]
completeWhen: [output.stageBResult.recorded]
timeout: 10m
retry: {maxAttempts: 1, idempotencyKey: "${instance.id}:b"}
next: [c]
```

## STAGE c｜第三棒

### Goal

确认 B 已完成，调用 exec 在前台等待 15 秒，随后按 Workboard 原生完成协议完成本卡；不得启动后台任务。

```stage
actor: agent
scope: project
skills: [background-worker-contract]
needs: [b]
outputs: [stageCResult]
completeWhen: [output.stageCResult.recorded]
timeout: 10m
retry: {maxAttempts: 1, idempotencyKey: "${instance.id}:c"}
```
