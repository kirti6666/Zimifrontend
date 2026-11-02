/* Native notification actions carry explicit user intent. The server snapshot
   is delivered first; capture/accept uses the same guarded path as a screen tap. */
Native.on('call.nativeAction', data => {
  const reply = outcome => Native.send('call.nativeResult', { callId:data.callId,actionId:data.actionId,action:data.action,outcome });
  if(data.action==='open'){reply('handedOff');return}
  if(data.action!=='answer'){reply('error');return}
  void (async()=>{
    try {
      if(S.v==='ring'&&S.caller?.callId===data.callId){
        await homeAcceptCall();
        if(!S.acceptingCall)reply('handedOff');
      } else if(S.v==='incoming'&&S.memberRing?.callId===data.callId){
        // A member reviews the verified paid-call price and wallet controls on
        // the existing incoming screen before making a chargeable answer.
        if(S.memberRing.rate>0){reply('handedOff');return}
        await acceptMemberRing();
        if(!S.acceptingCall)reply('handedOff');
      } else reply('handedOff');
    } catch(_){reply('error')}
  })();
});
