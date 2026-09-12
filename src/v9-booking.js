// v9 Coordinated Booking Beta — keeps same-device tabs aligned without claiming durable server state.
(function bootV9BookingCoordination(){
  function initV9BookingCoordination(){
    const sync=globalThis.MosigoV6BookingSync;
    const recovery=globalThis.MosigoV7BookingRecovery;
    if(!sync || !recovery){
      setTimeout(initV9BookingCoordination,25);
      return;
    }
    if(globalThis.MosigoV9BookingCoordination) return;

    const LATEST_KEY='mosigo-v7-booking-latest';
    const PREFIX='mosigo-v7-booking:';
    let queue=Promise.resolve();
    let coordinationState={
      status:'idle',
      bookingId:'',
      revision:0,
      source:'',
      conflict:''
    };

    function revisionOf(booking){
      const revision=Number(booking?.revision);
      return Number.isInteger(revision) && revision>=0 ? revision : 0;
    }

    function updatedAtOf(booking){
      const value=Date.parse(booking?.updatedAt || booking?.createdAt || '');
      return Number.isFinite(value) ? value : 0;
    }

    function publish(status,booking=null,source='',conflict=''){
      coordinationState={
        status,
        bookingId:String(booking?.bookingId||''),
        revision:revisionOf(booking),
        source:String(source||''),
        conflict:String(conflict||'')
      };
      globalThis.v9BookingCoordinationState=coordinationState;
    }

    function enqueue(task){
      const run=()=>Promise.resolve().then(task).catch((error)=>{
        publish('fallback',sync.getState(),'coordination',error?.message||'same-device coordination failed');
        console.warn('[Mosigo v9 booking coordination]',error?.message||error);
        return null;
      });
      queue=queue.then(run,run);
      return queue;
    }

    function shouldAdopt(snapshot,current){
      if(!snapshot?.bookingId) return false;
      if(!current?.bookingId) return true;
      if(snapshot.bookingId===current.bookingId){
        return revisionOf(snapshot)>revisionOf(current);
      }
      return updatedAtOf(snapshot)>updatedAtOf(current);
    }

    async function adoptStored(bookingId,source='storage'){
      const id=String(bookingId||'').trim();
      if(!id) return null;
      const snapshot=recovery.getSnapshot(id);
      if(!snapshot) return null;
      const current=sync.getState();
      if(!shouldAdopt(snapshot,current)){
        publish('current',current,source);
        return current;
      }

      publish('coordinating',snapshot,source);
      const booking=await recovery.recover(id);
      if(booking){
        publish('coordinated',booking,source);
        return booking;
      }
      publish('fallback',snapshot,source,'Stored booking could not be revalidated.');
      return null;
    }

    function handleStorage(event){
      if(event.storageArea!==localStorage) return;
      if(event.key===LATEST_KEY && event.newValue){
        enqueue(()=>adoptStored(event.newValue,'latest-key'));
        return;
      }
      if(!event.key?.startsWith(PREFIX) || !event.newValue) return;
      try{
        const snapshot=JSON.parse(event.newValue);
        if(snapshot?.bookingId) enqueue(()=>adoptStored(snapshot.bookingId,'snapshot'));
      }catch(error){}
    }

    function handleSnapshotConflict(event){
      const detail=event?.detail || {};
      const stored=detail.stored;
      if(!stored?.bookingId) return;
      publish('conflict',stored,'local-write',detail.kind||'snapshot-conflict');
      enqueue(async()=>{
        const booking=await recovery.recover(stored.bookingId);
        if(booking) publish('coordinated',booking,'conflict-recovery',detail.kind||'snapshot-conflict');
        return booking;
      });
    }

    window.addEventListener('storage',handleStorage);
    window.addEventListener('mosigo:booking-snapshot-conflict',handleSnapshotConflict);

    globalThis.MosigoV9BookingCoordination={
      reconcile:(bookingId=recovery.getLatestId())=>enqueue(()=>adoptStored(bookingId,'manual')),
      getState:()=>({ ...coordinationState }),
      getCanonical:(bookingId=recovery.getLatestId())=>recovery.getSnapshot(bookingId)
    };

    const current=sync.getState();
    const latestId=recovery.getLatestId();
    if(latestId){
      const latest=recovery.getSnapshot(latestId);
      if(shouldAdopt(latest,current)) enqueue(()=>adoptStored(latestId,'startup'));
      else publish(current?.bookingId?'current':'idle',current,'startup');
    }else{
      publish(current?.bookingId?'current':'idle',current,'startup');
    }
  }

  initV9BookingCoordination();
})();
