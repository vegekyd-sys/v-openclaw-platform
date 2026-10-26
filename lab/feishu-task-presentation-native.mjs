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
        const title=record.source==='inter-session'?'📨 跨会话任务':'📞 语音交办';
        const response=await client.im.message.create({params:{receive_id_type:route.kind==='group'?'chat_id':'open_id'},
          data:{receive_id:route.chatId,msg_type:'text',uuid:record.id.slice(0,32),content:JSON.stringify({text:title+'\n'+record.text})}});
        if(response?.code!==0||!response.data?.message_id)throw Error('Feishu task anchor was not acknowledged');
        record.anchorId=response.data.message_id;
        const conversationChatId=/^oc_[A-Za-z0-9]+$/u.test(response.data.chat_id??'')?response.data.chat_id:undefined;
        await persist({...state,anchorId:record.anchorId,...conversationChatId?{conversationChatId}:{}});
      }
      let begun=false,selectedModel=record.selectedModel;
      const taskState={state,uuid:'bt_'+record.id.slice(0,28),checkpoint:async stream=>{
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
            await native.dispatcherOptions.onIdle?.();
            if(result?.finalization)result=await result.finalization;
            native.delivery.onDelivered?.(payload,info,result);
            if(result?.visibleReplySent!==true&&native.getVisibleReplyState?.().visibleReplySent!==true)throw Error('Native Feishu reply did not confirm visible delivery');
            await flush();await persist({...state,deliveredPayloads:i+1});
          }
          await native.dispatcherOptions.onIdle?.();await flush();
        },
        async cleanup(){await native.dispatcherOptions.onCleanup?.();},
      };
    },
  };
}
