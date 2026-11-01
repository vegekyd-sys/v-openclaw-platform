/** Detach only an admitted Voice product task during call teardown. */
export function createVoiceTaskLifetime({enabled,callSignal,consultSignal,isCallClosing}) {
  const controller=new AbortController();let accepted=false,detached=false;
  const fromCall=()=>{
    if(enabled&&accepted&&isCallClosing()){detached=true;return;}
    controller.abort(callSignal.reason);
  };
  const fromConsult=()=>{
    // Explicit task cancellation is never excused by a simultaneous hangup.
    controller.abort(consultSignal.reason);
  };
  callSignal.addEventListener('abort',fromCall);
  consultSignal.addEventListener('abort',fromConsult);
  if(callSignal.aborted)fromCall();if(consultSignal.aborted)fromConsult();
  return {
    signal:controller.signal,
    accepted(){accepted=true;},
    get detached(){return detached&&!controller.signal.aborted;},
    dispose(){callSignal.removeEventListener('abort',fromCall);consultSignal.removeEventListener('abort',fromConsult);},
  };
}
