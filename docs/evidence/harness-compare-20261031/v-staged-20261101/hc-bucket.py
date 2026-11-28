import json,sys,collections
p=json.load(open(sys.argv[1])); N={n['id']:n for n in p['nodes']}; par={}
for n in p['nodes']:
    for c in n.get('children',[]): par[c]=n['id']
B=[('session_status 工具',('buildStatusReplyParts',)),('Codex 回合开始的子 agent 监控',('registerNativeSubagentMonitor',)),('钩子请求处理',('NativeHook','nativeHook','processNativeHookRelayInvocation','runNativeHookRelay','relay')),('事件广播里的会话快照',('handleEvent','handleTranscriptUpdateBroadcast','buildSessionEventSnapshot','loadGatewaySessionSnapshot','loadGatewaySessionRow','loadGatewaySessionLifecycleSnapshot')),('Codex 回合收尾',('finalizeCodexAttempt',)),('Codex 回合启动其他',('runCodexAppServerAttempt',)),('写事务',('runOpenClawAgentWriteTransaction',)),('workboard/lifecycle',('listLifecycleCandidates','listLifecycleMatchLinks','readCardLifecycleMatchLink')),('脱敏',('redactRegisteredSecretValues',))]
s=collections.Counter(); samples=collections.Counter()
for i,d in zip(p['samples'],p['timeDeltas']):
    f=N[i]['callFrame']['functionName']
    if f=='(idle)': s['idle']+=d/1000; continue
    if f=='(garbage collector)': s['GC']+=d/1000; continue
    x=i; stack=[]
    while x is not None: stack.append(N[x]['callFrame']['functionName']); x=par.get(x)
    for name,keys in B:
        if any(any(k in g for k in keys) for g in stack): s[name]+=d/1000; break
    else:
        s['其他']+=d/1000
        top=[g for g in reversed(stack) if g and g not in('(root)','processTicksAndRejections','runMicrotasks','run','processTimers','listOnTimeout')][:2]
        samples['>'.join(top)]+=d/1000
busy=sum(v for k,v in s.items() if k!='idle')
print('busy',round(busy))
for k,v in s.most_common(): print(round(v),f'{100*v/busy:.0f}%' if k!='idle' else '',k)
print('--other top');[print(round(v),k) for k,v in samples.most_common(14)]
