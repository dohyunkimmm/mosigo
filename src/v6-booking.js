// v6 Pilot-ready Beta — best-effort server command sync layered over the stable v4 booking UI.
(function bootV6BookingSync(){
  function initV6BookingSync(){
    if(globalThis.MosigoV6BookingSync) return;
    if(typeof doPay!=='function' || typeof confirmBkCancel!=='function' || typeof completeReturn!=='function' || typeof resetDemoState!=='function' || !globalThis.v4BookingState){
      setTimeout(initV6BookingSync,25);
      return;
    }

    const API='/api/bookings';
    const STORAGE_KEY='mosigo-v6-booking';
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

    async function command(method,payload){
      const response=await fetch(API,{
        method,
        headers:{ 'Content-Type':'application/json' },
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
        console.warn('[Mosigo v6 booking sync]',error?.message||error);
        return null;
      });
      queue=queue.then(run,run);
      return queue;
    }

    async function createRemote(local){
      if(!local?.bookingId) return null;
      setStatus('syncing');
      const data=await command('POST',{ booking:local });
      persistRemote(data.booking);
      return remoteBooking;
    }

    async function applyAction(action){
      if(!remoteBooking) return null;
      setStatus('syncing');
      const data=await command('PATCH',{ action, booking:remoteBooking });
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
      persistRemote(null);
      setStatus('idle');
      originalResetDemoState();
    };

    globalThis.MosigoV6BookingSync={
      reconcile:()=>enqueue(()=>reconcileLocal(globalThis.v4BookingState)),
      hydrate,
      getState:()=>remoteBooking,
      getStatus:()=>syncStatus
    };

    if(globalThis.v4BookingState?.bookingId){
      enqueue(()=>reconcileLocal(globalThis.v4BookingState));
    }

    // v7 adds same-device recovery on top of the stable v6 command sync contract.
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
