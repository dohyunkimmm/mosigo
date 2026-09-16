// v9 Coordinated Booking Beta — keeps same-device tabs aligned; v10 layers durable server recovery on top.
(function bootV9BookingCoordination(){
  function initV9BookingCoordination(){
    const sync=globalThis.MosigoV6BookingSync;
    const recovery=globalThis.MosigoV7BookingRecovery;
    const runtime=globalThis.MosigoV4BookingRuntime;
    if(!sync || !recovery || !runtime){
      setTimeout(initV9BookingCoordination,25);
      return;
    }
    if(globalThis.MosigoV9BookingCoordination) return;

    const LATEST_KEY='mosigo-v7-booking-latest';
    const PREFIX='mosigo-v7-booking:';
    let queue=Promise.resolve();
    let coordinationState={ status:'idle', bookingId:'', revision:0, source:'', conflict:'' };

    function revisionOf(booking){
      const revision=Number(booking?.revision);
      return Number.isInteger(revision) && revision>=0 ? revision : 0;
    }

    function updatedAtOf(booking){
      const value=Date.parse(booking?.updatedAt || booking?.createdAt || '');
      return Number.isFinite(value) ? value : 0;
    }

    function serialize(booking){
      try{return JSON.stringify(booking)||'';}catch(error){return '';}
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

    function compareStoredToCurrent(snapshot,current){
      if(!snapshot?.bookingId) return -1;
      if(!current?.bookingId) return 1;
      if(snapshot.bookingId===current.bookingId){
        const revisionDiff=revisionOf(snapshot)-revisionOf(current);
        if(revisionDiff!==0) return revisionDiff>0 ? 1 : -1;
        return serialize(snapshot)===serialize(current) ? 0 : 1;
      }
      const timestampDiff=updatedAtOf(snapshot)-updatedAtOf(current);
      if(timestampDiff!==0) return timestampDiff>0 ? 1 : -1;
      const bookingIdDiff=String(snapshot.bookingId).localeCompare(String(current.bookingId));
      return bookingIdDiff===0 ? 0 : (bookingIdDiff>0 ? 1 : -1);
    }

    function shouldAdopt(snapshot,current){
      if(!snapshot?.bookingId) return false;
      if(!current?.bookingId) return true;
      if(snapshot.bookingId===current.bookingId && revisionOf(snapshot)>revisionOf(current)) return true;
      return compareStoredToCurrent(snapshot,current)>0;
    }

    function equalRevisionDivergence(snapshot,current){
      return Boolean(snapshot?.bookingId && current?.bookingId && snapshot.bookingId===current.bookingId && revisionOf(snapshot)===revisionOf(current) && serialize(snapshot)!==serialize(current));
    }

    async function revalidateStored(bookingId,source='canonical',conflict=''){
      const id=String(bookingId||'').trim();
      if(!id) return null;
      const snapshot=recovery.getSnapshot(id);
      if(!snapshot){
        publish('missing-snapshot',sync.getState(),source,'Stored booking snapshot is missing.');
        return null;
      }
      publish('coordinating',snapshot,source,conflict);
      const booking=await recovery.recover(id);
      if(booking){
        publish('coordinated',booking,source,conflict);
        return booking;
      }
      publish('fallback',snapshot,source,conflict||'Stored booking could not be revalidated.');
      return null;
    }

    async function adoptStored(bookingId,source='storage'){
      const id=String(bookingId||'').trim();
      if(!id) return null;
      const snapshot=recovery.getSnapshot(id);
      if(!snapshot){
        publish('missing-snapshot',sync.getState(),source,'Stored booking snapshot is missing.');
        return null;
      }
      const current=sync.getState();
      if(!shouldAdopt(snapshot,current)){
        publish('current',current,source);
        return current;
      }
      const conflict=equalRevisionDivergence(snapshot,current) ? 'equal-revision-divergence' : '';
      return revalidateStored(id,source,conflict);
    }

    function clearCurrent(source='storage-clear'){
      runtime.hydrate({});
      sync.hydrate(null);
      publish('cleared',null,source);
      return null;
    }

    async function reconcileRemoval(removedId,source){
      const latestId=String(recovery.getLatestId()||'').trim();
      if(latestId && latestId!==removedId) return adoptStored(latestId,source);
      const current=sync.getState();
      if(!current?.bookingId){
        publish(source.includes('clear')?'cleared':'idle',null,source);
        return null;
      }
      if(!removedId || current.bookingId===removedId || !latestId) return clearCurrent(source);
      publish('current',current,source);
      return current;
    }

    function handleStorage(event){
      if(event.storageArea && event.storageArea!==localStorage) return;
      if(event.key===LATEST_KEY){
        if(event.newValue) enqueue(()=>adoptStored(event.newValue,'latest-key'));
        else enqueue(()=>reconcileRemoval(String(event.oldValue||'').trim(),'latest-clear'));
        return;
      }
      if(!event.key?.startsWith(PREFIX)) return;
      const keyBookingId=event.key.slice(PREFIX.length);
      if(!event.newValue){
        enqueue(()=>reconcileRemoval(keyBookingId,'snapshot-clear'));
        return;
      }
      try{
        const snapshot=JSON.parse(event.newValue);
        if(!snapshot || typeof snapshot!=='object' || !snapshot.bookingId || snapshot.bookingId!==keyBookingId){
          publish('invalid-snapshot',sync.getState(),'snapshot','booking-id-mismatch');
          return;
        }
        enqueue(()=>adoptStored(snapshot.bookingId,'snapshot'));
      }catch(error){
        publish('invalid-snapshot',sync.getState(),'snapshot','invalid-json');
      }
    }

    function handleSnapshotConflict(event){
      const detail=event?.detail || {};
      const stored=detail.stored;
      if(!stored?.bookingId) return;
      const kind=detail.kind||'snapshot-conflict';
      publish('conflict',stored,'local-write',kind);
      enqueue(()=>revalidateStored(stored.bookingId,'conflict-recovery',kind));
    }

    window.addEventListener('storage',handleStorage);
    window.addEventListener('mosigo:booking-snapshot-conflict',handleSnapshotConflict);

    globalThis.MosigoV9BookingCoordination={
      reconcile:(bookingId=recovery.getLatestId())=>enqueue(()=>adoptStored(bookingId,'manual')),
      getState:()=>({ ...coordinationState }),
      getSnapshot:(bookingId=recovery.getLatestId())=>recovery.getSnapshot(bookingId),
      getCanonical:(bookingId=recovery.getLatestId())=>enqueue(()=>revalidateStored(bookingId,'canonical'))
    };

    const current=sync.getState();
    const latestId=recovery.getLatestId();
    if(latestId){
      const latest=recovery.getSnapshot(latestId);
      if(latest && shouldAdopt(latest,current)) enqueue(()=>adoptStored(latestId,'startup'));
      else if(!latest) publish('missing-snapshot',current,'startup','Stored booking snapshot is missing.');
      else publish(current?.bookingId?'current':'idle',current,'startup');
    }else{
      publish(current?.bookingId?'current':'idle',current,'startup');
    }

    if(typeof document!=='undefined' && !document.querySelector('script[data-mosigo-v10-booking]')){
      const v10=document.createElement('script');
      v10.src='v10-booking.js';
      v10.async=false;
      v10.dataset.mosigoV10Booking='1';
      document.head.appendChild(v10);
    }
  }

  initV9BookingCoordination();
})();
