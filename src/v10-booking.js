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

    // v11 adds portable cross-device recovery without changing v10 durable storage semantics.
    if(typeof document!=='undefined' && !document.querySelector('script[data-mosigo-v11-booking]')){
      const v11=document.createElement('script');
      v11.src='v11-booking.js';
      v11.async=false;
      v11.dataset.mosigoV11Booking='1';
      document.head.appendChild(v11);
    }
    if(typeof document!=='undefined' && !document.querySelector('script[data-mosigo-v11-ui]')){
      const v11Ui=document.createElement('script');
      v11Ui.src='v11-ui.js';
      v11Ui.async=false;
      v11Ui.dataset.mosigoV11Ui='1';
      document.head.appendChild(v11Ui);
    }

    // v12 layers expiring/revocable share capabilities over the stable v10 durable booking contract.
    if(typeof document!=='undefined' && !document.querySelector('script[data-mosigo-v12-sharing]')){
      const v12=document.createElement('script');
      v12.src='v12-sharing.js';
      v12.async=false;
      v12.dataset.mosigoV12Sharing='1';
      document.head.appendChild(v12);
    }
    if(typeof document!=='undefined' && !document.querySelector('script[data-mosigo-v12-ui]')){
      const v12Ui=document.createElement('script');
      v12Ui.src='v12-ui.js';
      v12Ui.async=false;
      v12Ui.dataset.mosigoV12Ui='1';
      document.head.appendChild(v12Ui);
    }

    // v13 adds authenticated account ownership and cross-device owned-booking listing.
    if(typeof document!=='undefined' && !document.querySelector('script[data-mosigo-v13-account]')){
      const v13=document.createElement('script');
      v13.src='v13-account.js';
      v13.async=false;
      v13.dataset.mosigoV13Account='1';
      document.head.appendChild(v13);
    }
    if(typeof document!=='undefined' && !document.querySelector('script[data-mosigo-v13-ui]')){
      const v13Ui=document.createElement('script');
      v13Ui.src='v13-ui.js';
      v13Ui.async=false;
      v13Ui.dataset.mosigoV13Ui='1';
      document.head.appendChild(v13Ui);
    }
  }

  initV10BookingDurability();
})();
