// v6 Pilot-ready Beta sync layer, extended by v10 with durable recovery credentials.
(function bootV6BookingSync(){
  function initV6BookingSync(){
    if(globalThis.MosigoV6BookingSync) return;
    if(typeof doPay!=='function' || typeof confirmBkCancel!=='function' || typeof completeReturn!=='function' || typeof resetDemoState!=='function' || !globalThis.v4BookingState){
      setTimeout(initV6BookingSync,25);
      return;
    }

    const API='/api/bookings';
    const STORAGE_KEY='mosigo-v6-booking';
    const ACCESS_PREFIX='mosigo-v10-recovery-key:';
    let remoteBooking=null;
    let queue=Promise.resolve();
    let syncStatus={ status:'idle', error:'' };

    function publish(){
      globalThis.v6BookingState=remoteBooking;
      globalThis.v6BookingSyncStatus=syncStatus;
      try{
        window.dispatchEvent(new CustomEvent('mosigo:booking-sync',{
          detail:{ booking:remoteBooking, status:syncStatus }
        }));
      }catch(error){}
    }

    function setStatus(status,error=''){
      syncStatus={ status, error:String(error||'') };
      publish();
    }

    function accessKeyName(bookingId){
      return ACCESS_PREFIX+String(bookingId||'').trim();
    }

    function getRecoveryKey(bookingId=remoteBooking?.bookingId){
      const id=String(bookingId||'').trim();
      if(!id) return '';
      try{return String(localStorage.getItem(accessKeyName(id))||'');}catch(error){return '';}
    }

    function setRecoveryKey(bookingId,recoveryKey){
      const id=String(bookingId||'').trim();
      const key=String(recoveryKey||'').trim();
      if(!id || !key) return false;
      try{localStorage.setItem(accessKeyName(id),key); return true;}catch(error){return false;}
    }

    function clearRecoveryKey(bookingId){
      const id=String(bookingId||'').trim();
      if(!id) return;
      try{localStorage.removeItem(accessKeyName(id));}catch(error){}
    }

    function persistRemote(booking){
      remoteBooking=booking && typeof booking==='object' ? booking : null;
      try{
        if(remoteBooking) sessionStorage.setItem(STORAGE_KEY,JSON.stringify(remoteBooking));
        else sessionStorage.removeItem(STORAGE_KEY);
      }catch(error){}
      publish();
    }

    function restoreRemote(){
      try{
        const raw=sessionStorage.getItem(STORAGE_KEY);
        if(!raw) return null;
        const parsed=JSON.parse(raw);
        return parsed && typeof parsed==='object' ? parsed : null;
      }catch(error){
        return null;
      }
    }

    async function command(method,payload,recoveryKey=''){
      const headers={ 'Content-Type':'application/json' };
      if(recoveryKey) headers['X-Mosigo-Recovery-Key']=recoveryKey;
      const response=await fetch(API,{
        method,
        headers,
        credentials:'same-origin',
        body:payload ? JSON.stringify(payload) : undefined
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok || !data?.success){
        const message=data?.message || data?.error || ('HTTP '+response.status);
        throw new Error(message);
      }
      return data;
    }

    function enqueue(task){
      const run=()=>Promise.resolve().then(task).catch((error)=>{
        setStatus('fallback',error?.message||'booking sync failed');
        console.warn('[Mosigo booking sync]',error?.message||error);
        return null;
      });
      queue=queue.then(run,run);
      return queue;
    }

    async function createRemote(local){
      if(!local?.bookingId) return null;
      setStatus('syncing');
      const existingKey=getRecoveryKey(local.bookingId);
      const data=existingKey
        ? await command('PUT',{ booking:local, recoveryKey:existingKey },existingKey)
        : await command('POST',{ booking:local });
      if(data.recoveryKey) setRecoveryKey(data.booking?.bookingId||local.bookingId,data.recoveryKey);
      persistRemote(data.booking);
      return remoteBooking;
    }

    async function applyAction(action){
      if(!remoteBooking) return null;
      setStatus('syncing');
      const recoveryKey=getRecoveryKey(remoteBooking.bookingId);
      const data=await command('PATCH',{
        action,
        booking:remoteBooking,
        bookingId:remoteBooking.bookingId,
        expectedRevision:remoteBooking.revision,
        recoveryKey
      },recoveryKey);
      if(data.recoveryKey) setRecoveryKey(data.booking?.bookingId,data.recoveryKey);
      persistRemote(data.booking);
      return remoteBooking;
    }

    async function reconcileLocal(local=globalThis.v4BookingState){
      if(!local?.bookingId) return null;
      if(!remoteBooking || remoteBooking.bookingId!==local.bookingId){
        await createRemote(local);
      }
      if(!remoteBooking) return null;

      const target=local.phase;
      if(target==='cancelled'){
        if(remoteBooking.phase==='requesting' || remoteBooking.phase==='confirmed') await applyAction('cancel');
        setStatus(remoteBooking.phase==='cancelled'?'synced':'fallback',remoteBooking.phase==='cancelled'?'':'remote booking cannot be cancelled from its current phase');
        return remoteBooking;
      }

      const targetRank={ requesting:0, confirmed:1, in_progress:2, completed:3 }[target];
      if(targetRank==null){ setStatus('synced'); return remoteBooking; }
      const rank={ requesting:0, confirmed:1, in_progress:2, completed:3 };

      while((rank[remoteBooking.phase]??99)<targetRank){
        if(remoteBooking.phase==='requesting') await applyAction('confirm');
        else if(remoteBooking.phase==='confirmed') await applyAction('start');
        else if(remoteBooking.phase==='in_progress') await applyAction('complete');
        else break;
      }
      setStatus(remoteBooking.phase===target?'synced':'fallback',remoteBooking.phase===target?'':'local and server booking phases differ');
      return remoteBooking;
    }

    function hydrate(booking){
      persistRemote(booking);
      setStatus(remoteBooking?'synced':'idle');
      return remoteBooking;
    }

    remoteBooking=restoreRemote();
    publish();

    const originalDoPay=doPay;
    doPay=function(){
      originalDoPay();
      enqueue(()=>reconcileLocal(globalThis.v4BookingState));
      setTimeout(()=>enqueue(()=>reconcileLocal(globalThis.v4BookingState)),1800);
      setTimeout(()=>enqueue(()=>reconcileLocal(globalThis.v4BookingState)),3400);
    };

    const originalConfirmBkCancel=confirmBkCancel;
    confirmBkCancel=function(){
      originalConfirmBkCancel();
      enqueue(()=>reconcileLocal(globalThis.v4BookingState));
    };

    const originalCompleteReturn=completeReturn;
    completeReturn=function(){
      originalCompleteReturn();
      enqueue(()=>reconcileLocal(globalThis.v4BookingState));
    };

    const originalResetDemoState=resetDemoState;
    resetDemoState=function(){
      const currentId=remoteBooking?.bookingId;
      persistRemote(null);
      if(currentId) clearRecoveryKey(currentId);
      setStatus('idle');
      originalResetDemoState();
    };

    globalThis.MosigoV6BookingSync={
      reconcile:()=>enqueue(()=>reconcileLocal(globalThis.v4BookingState)),
      hydrate,
      getState:()=>remoteBooking,
      getStatus:()=>syncStatus,
      getRecoveryKey,
      setRecoveryKey,
      clearRecoveryKey
    };

    if(globalThis.v4BookingState?.bookingId){
      enqueue(()=>reconcileLocal(globalThis.v4BookingState));
    }

    if(!document.querySelector('script[data-mosigo-v7-booking]')){
      const v7=document.createElement('script');
      v7.src='v7-booking.js';
      v7.async=false;
      v7.dataset.mosigoV7Booking='1';
      document.head.appendChild(v7);
    }
  }

  initV6BookingSync();
})();
