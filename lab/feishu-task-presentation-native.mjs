/** Inlined into the native monitor so the existing renderer owns cards and media. */
export function createTaskPresentationAccount({cfg,accountId,runtime,createClient,createReplyDispatcher,resolveAccount,resolveProgressRuntimes=()=>[]}) {
  const account=resolveAccount(cfg,accountId);
  return {
    async authorize(route){
      if(route.accountId!==account.accountId||!account.enabled)throw Error('Feishu account is not active');
      if(route.kind==='group'){
        const response=await createClient(account).im.chat.get({path:{chat_id:route.chatId}});
        if(response?.code!==0)throw Error('Feishu conversation membership unavailable');
      }
    },
    async open(record,checkpoint){
      const client=createClient(account),route=record.route;
      let state=record.sinkState??{};
      const persist=async next=>{state=JSON.parse(JSON.stringify(next));record.sinkState=state;await checkpoint(state);};
      if(!record.anchorId){
        const title=record.source==='cron-continuation'?'↩️ 自动续接':record.source==='queued-followup'?'⏳ 排队请求':record.source==='subagent-announce'?'↩️ 子任务回报':record.source==='inter-session'?'📨 跨会话任务':'📞 语音交办';
        const response=await client.im.message.create({params:{receive_id_type:route.kind==='group'?'chat_id':'open_id'},
          data:{receive_id:route.chatId,msg_type:'text',uuid:record.id.slice(0,32),content:JSON.stringify({text:title+'\n'+record.text})}});
        if(response?.code!==0||!response.data?.message_id)throw Error('Feishu task anchor was not acknowledged');
        record.anchorId=response.data.message_id;
        const conversationChatId=/^oc_[A-Za-z0-9]+$/u.test(response.data.chat_id??'')?response.data.chat_id:undefined;
        await persist({...state,anchorId:record.anchorId,...conversationChatId?{conversationChatId}:{}});
      }
      let begun=false,selectedModel=record.selectedModel;
      const taskState={state,source:record.source,progressEvent:()=>record.latestProgressEvent,runId:()=>record.activeRunId??record.runIds.at(-1),uuid:'bt_'+record.id.slice(0,28),checkpoint:async stream=>{
        await persist({...state,stream});taskState.state=state;
      }};
      const native=createReplyDispatcher({cfg,agentId:record.agentId,sessionKey:record.sessionKey,chatId:state.conversationChatId??route.chatId,
        sendTarget:route.to,accountId,replyToMessageId:record.anchorId,replyInThread:false,
        rootId:route.threadId,runtime,messageCreateTimeMs:record.createdAt,boundTaskPresentation:taskState});
      const flush=async()=>{await native.flushTaskPresentation?.();await persist({...state,...native.snapshotTaskPresentation?.()});taskState.state=state;};
      async function start(model=selectedModel){
        if(model?.provider&&model?.model)selectedModel=model;
        if(model?.provider&&model?.model)await native.replyOptions.onModelSelected?.(model);
        if(begun)return;begun=true;
        native.replyOptions.onAgentRunStart?.(record.runIds.at(-1));
        await native.dispatcherOptions.onReplyStart?.();await flush();
      }
      return {
        start,
        async partial(payload){await start();
          if(payload.kind==='status'&&native.setTaskPresentationStatus){native.setTaskPresentationStatus(payload.text);await flush();return;}
          native.setTaskPresentationStatus?.('');
          if(payload.kind==='preamble'&&resolveProgressRuntimes(account.config).includes(selectedModel?.agentRuntime)&&native.replyOptions.onItemEvent)
            native.replyOptions.onItemEvent({kind:'preamble',phase:'end',itemId:payload.itemId,progressText:payload.text});
          else native.replyOptions.onPartialReply?.(payload);
          await flush();},
        async tool(payload){await start();native.replyOptions.onToolStart?.(payload);await flush();},
        async finish(payloads){await start();
          for(let i=state.deliveredPayloads??0;i<payloads.length;i++){
            const info={kind:'final'},payload=native.dispatcherOptions.beforeDeliver?.(payloads[i],info)??payloads[i];
            let result=await native.delivery.deliver(payload,info);
            // Native streaming receipts settle only after idle closes the CardKit stream.
            // Attach both rejection handlers before idle starts. A failed close
            // rejects both promises; observing only idle leaves finalization
            // unhandled and can terminate the Gateway before its retry timer.
            const settled=await Promise.allSettled([
              Promise.resolve(result?.finalization??result),
              Promise.resolve().then(()=>native.dispatcherOptions.onIdle?.()),
            ]);
            for(const outcome of settled)if(outcome.status==='rejected')throw outcome.reason;
            result=settled[0].value;
            native.delivery.onDelivered?.(payload,info,result);
            // A previously visible progress card is not this final's receipt.
            // In particular, never acknowledge a failed attachment because the
            // text payload before it was successfully delivered.
            if(result?.visibleReplySent!==true)throw Error('Native Feishu reply did not confirm visible delivery');
            await flush();
            const messageId=result.receipt?.primaryPlatformMessageId??result.messageIds?.[0]??result.messageId??state.stream?.messageId;
            if(!messageId)throw Error('Native Feishu final receipt has no message identity');
            await persist({...state,deliveredPayloads:i+1,receipts:[...(state.receipts??[]),{
              payloadIndex:i,visibleReplySent:true,messageId,
            }]});
          }
          await native.dispatcherOptions.onIdle?.();await flush();
        },
        async suppress(){native.dispatcherOptions.onSkip?.(undefined,{kind:'final',reason:'silent'});await native.dispatcherOptions.onIdle?.();await flush();},
        async cleanup(){await native.dispatcherOptions.onCleanup?.();},
      };
    },
  };
}
