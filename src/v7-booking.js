// v7 Recoverable Booking Beta — same-device recovery backed by localStorage + server validation.
(function bootV7BookingRecovery(){
  function initV7BookingRecovery(){
    const sync=globalThis.MosigoV6BookingSync;
    const runtime=globalThis.MosigoV4BookingRuntime;
    if(!sync || !runtime){
      setTimeout(initV7BookingRecovery,25);
      return;
    }
    if(globalThis.MosigoV7BookingRecovery) return;

    const API='/api/bookings';
    const LATEST_KEY='mosigo-v7-booking-latest';
    const PREFIX='mosigo-v7-booking:';
    let recoveryStatus={ status:'idle', bookingId:'', error:'' };

    function publish(status,bookingId='',error=''){
      recoveryStatus={ status, bookingId:String(bookingId||''), error:String(error||'') };
      globalThis.v7BookingRecoveryStatus=recoveryStatus;
    }

    function storageGet(key){
      try{return localStorage.getItem(key);}catch(error){return null;}
    }

    function storageSet(key,value){
      try{localStorage.setItem(key,value); return true;}catch(error){return false;}
    }

    function storageRemove(key){
      try{localStorage.removeItem(key);}catch(error){}
    }

    function bookingKey(bookingId){
      return PREFIX+String(bookingId||'').trim();
    }

    function latestId(){
      return String(storageGet(LATEST_KEY)||'').trim();
    }

    function readSnapshot(bookingId){
      const raw=storageGet(bookingKey(bookingId));
      if(!raw) return null;
      try{
        const parsed=JSON.parse(raw);
        return parsed && typeof parsed==='object' ? parsed : null;
      }catch(error){
        return null;
      }
    }

    function snapshotRevision(booking){
      const revision=Number(booking?.revision);
      return Number.isInteger(revision) && revision>=0 ? revision : 0;
    }

    function snapshotUpdatedAt(booking){
      const value=Date.parse(booking?.updatedAt || booking?.createdAt || '');
      return Number.isFinite(value) ? value : 0;
    }

    function emitSnapshotConflict(kind,incoming,stored){
      try{
        window.dispatchEvent(new CustomEvent('mosigo:booking-snapshot-conflict',{
          detail:{ kind, incoming, stored }
        }));
      }catch(error){}
    }

    function shouldPromoteLatest(booking){
      const currentId=latestId();
      if(!currentId || currentId===booking.bookingId) return true;
      const current=readSnapshot(currentId);
      if(!current) return true;

      const incomingAt=snapshotUpdatedAt(booking);
      const currentAt=snapshotUpdatedAt(current);
      if(incomingAt!==currentAt) return incomingAt>currentAt;
      return String(booking.bookingId).localeCompare(String(current.bookingId))>0;
    }

    function saveSnapshot(booking){
      if(!booking?.bookingId) return false;
      const existing=readSnapshot(booking.bookingId);
      const incomingRevision=snapshotRevision(booking);
      const storedRevision=snapshotRevision(existing);
      const serialized=JSON.stringify(booking);

      if(existing && incomingRevision<storedRevision){
        emitSnapshotConflict('stale-revision',booking,existing);
        return false;
      }
      if(existing && incomingRevision===storedRevision){
        const storedSerialized=JSON.stringify(existing);
        if(serialized!==storedSerialized){
          emitSnapshotConflict('equal-revision-divergence',booking,existing);
          return false;
        }
        if(shouldPromoteLatest(booking)) storageSet(LATEST_KEY,booking.bookingId);
        return true;
      }

      if(!storageSet(bookingKey(booking.bookingId),serialized)) return false;
      if(shouldPromoteLatest(booking)) storageSet(LATEST_KEY,booking.bookingId);
      return true;
    }

    function clearSnapshot(bookingId){
      const id=String(bookingId||'').trim();
      if(id) storageRemove(bookingKey(id));
      if(!id || latestId()===id) storageRemove(LATEST_KEY);
    }

    async function validateSnapshot(snapshot){
      const response=await fetch(API,{
        method:'PUT',
        headers:{ 'Content-Type':'application/json' },
        credentials:'same-origin',
        body:JSON.stringify({ booking:snapshot })
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok || !data?.success || !data?.recovered){
        throw new Error(data?.message || data?.error || ('HTTP '+response.status));
      }
      return data.booking;
    }

    async function recover(bookingId=latestId()){
      const id=String(bookingId||'').trim();
      if(!id){
        publish('empty');
        return null;
      }
      const snapshot=readSnapshot(id);
      if(!snapshot){
        publish('missing',id,'No same-device booking snapshot was found.');
        return null;
      }

      publish('recovering',id);
      try{
        const booking=await validateSnapshot(snapshot);
        saveSnapshot(booking);
        runtime.hydrate(booking);
        sync.hydrate(booking);
        publish('recovered',booking.bookingId);
        return booking;
      }catch(error){
        publish('fallback',id,error?.message||'Booking recovery failed.');
        console.warn('[Mosigo v7 booking recovery]',error?.message||error);
        return null;
      }
    }

    window.addEventListener('mosigo:booking-sync',(event)=>{
      const booking=event?.detail?.booking;
      if(booking?.bookingId){
        const saved=saveSnapshot(booking);
        publish(saved?'saved':'conflict',booking.bookingId,saved?'':'A newer or conflicting snapshot is already stored.');
        return;
      }
      const id=latestId();
      if(id) clearSnapshot(id);
      publish('idle');
    });

    globalThis.MosigoV7BookingRecovery={
      recover,
      getLatestId:latestId,
      getStatus:()=>recoveryStatus,
      getSnapshot:(bookingId=latestId())=>readSnapshot(bookingId),
      clear:(bookingId=latestId())=>clearSnapshot(bookingId)
    };

    const current=sync.getState();
    if(current?.bookingId){
      saveSnapshot(current);
      publish('saved',current.bookingId);
    }else if(latestId()){
      recover(latestId());
    }else{
      publish('empty');
    }

    // v8 adds validated lifecycle history on top of the recoverable v7 booking resource.
    if(!document.querySelector('script[data-mosigo-v8-booking]')){
      const v8=document.createElement('script');
      v8.src='v8-booking.js';
      v8.async=false;
      v8.dataset.mosigoV8Booking='1';
      document.head.appendChild(v8);
    }
  }

  initV7BookingRecovery();
})();
