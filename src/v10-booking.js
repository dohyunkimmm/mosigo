// v10 Durable Booking Beta — durable canonical recovery layered over v9 same-device coordination.
(function bootV10BookingDurability(){
  function initV10BookingDurability(){
    const sync=globalThis.MosigoV6BookingSync;
    const recovery=globalThis.MosigoV7BookingRecovery;
    const coordination=globalThis.MosigoV9BookingCoordination;
    const runtime=globalThis.MosigoV4BookingRuntime;
    if(!sync || !recovery || !coordination || !runtime){
      setTimeout(initV10BookingDurability,25);
      return;
    }
    if(globalThis.MosigoV10BookingDurability) return;

    const API='/api/bookings';
    let capability=null;
    let state={ status:'checking', durable:false, bookingId:'', revision:0, error:'' };
    let queue=Promise.resolve();

    function publish(status,booking=null,error=''){
      state={
        status,
        durable:Boolean(capability?.durableServerPersistence),
        bookingId:String(booking?.bookingId||''),
        revision:Number.isInteger(Number(booking?.revision)) ? Number(booking.revision) : 0,
        error:String(error||'')
      };
      globalThis.v10BookingDurabilityState=state;
    }

    function enqueue(task){
      const run=()=>Promise.resolve().then(task).catch((error)=>{
        publish('fallback',sync.getState(),error?.message||'durable booking operation failed');
        console.warn('[Mosigo v10 booking durability]',error?.message||error);
        return null;
      });
      queue=queue.then(run,run);
      return queue;
    }

    async function readCapability(){
      const response=await fetch(API,{ credentials:'same-origin' });
      const data=await response.json().catch(()=>null);
      if(!response.ok || !data?.success) throw new Error(data?.message||data?.error||('HTTP '+response.status));
      capability=data;
      publish(data.durableServerPersistence?'ready':'fallback',sync.getState(),data.durableServerPersistence?'':'Durable storage is not configured.');
      return capability;
    }

    async function recoverDurable(bookingId,recoveryKey=sync.getRecoveryKey?.(bookingId)||''){
      const id=String(bookingId||'').trim();
      const key=String(recoveryKey||'').trim();
      if(!id || !key) throw new Error('Booking ID and recovery key are required.');
      if(!capability) await readCapability();
      if(!capability?.durableServerPersistence) return coordination.getCanonical(id);

      publish('recovering',sync.getState());
      const response=await fetch(API+'?bookingId='+encodeURIComponent(id),{
        method:'GET',
        headers:{ 'X-Mosigo-Recovery-Key':key },
        credentials:'same-origin'
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok || !data?.success || !data?.booking){
        throw new Error(data?.message||data?.error||('HTTP '+response.status));
      }
      sync.setRecoveryKey?.(id,key);
      runtime.hydrate(data.booking);
      sync.hydrate(data.booking);
      publish('recovered',data.booking);
      return data.booking;
    }

    async function canonical(bookingId=recovery.getLatestId()){
      const id=String(bookingId||'').trim();
      if(!id) return null;
      if(!capability) await readCapability();
      if(!capability?.durableServerPersistence) return coordination.getCanonical(id);
      const key=sync.getRecoveryKey?.(id)||'';
      if(!key) return coordination.getCanonical(id);
      return recoverDurable(id,key);
    }

    globalThis.MosigoV10BookingDurability={
      refreshCapability:()=>enqueue(readCapability),
      recover:(bookingId,recoveryKey)=>enqueue(()=>recoverDurable(bookingId,recoveryKey)),
      getCanonical:(bookingId=recovery.getLatestId())=>enqueue(()=>canonical(bookingId)),
      getCapability:()=>capability ? { ...capability } : null,
      getState:()=>({ ...state }),
      getRecoveryKey:(bookingId=recovery.getLatestId())=>sync.getRecoveryKey?.(bookingId)||''
    };

    enqueue(async()=>{
      await readCapability();
      const current=sync.getState();
      const id=current?.bookingId || recovery.getLatestId();
      const key=id ? sync.getRecoveryKey?.(id) : '';
      if(capability?.durableServerPersistence && id && key) await recoverDurable(id,key);
      return capability;
    });
  }

  initV10BookingDurability();
})();
