// v13 Account Ownership Beta — authenticated owner sessions and cross-device booking ownership.
(function bootV13AccountOwnership(){
  function initV13AccountOwnership(){
    const sync=globalThis.MosigoV6BookingSync;
    const durability=globalThis.MosigoV10BookingDurability;
    const runtime=globalThis.MosigoV4BookingRuntime;
    const sharing=globalThis.MosigoV12SecureSharing;
    if(!sync || !durability || !runtime || !sharing){
      setTimeout(initV13AccountOwnership,25);
      return;
    }
    if(globalThis.MosigoV13AccountOwnership) return;

    const ACCOUNT_API='/api/account';
    const BOOKING_API='/api/bookings';
    let queue=Promise.resolve();
    let state={
      status:'checking',
      authenticated:false,
      account:null,
      bookings:[],
      sessionExpiresAt:'',
      error:''
    };

    function publish(status,patch={}){
      state={
        ...state,
        ...patch,
        status:String(status||state.status||'ready'),
        authenticated:Boolean(patch.authenticated ?? state.authenticated),
        account:(patch.account===undefined ? state.account : patch.account) || null,
        bookings:Array.isArray(patch.bookings) ? patch.bookings : state.bookings,
        sessionExpiresAt:String(patch.sessionExpiresAt ?? state.sessionExpiresAt ?? ''),
        error:String(patch.error ?? '')
      };
      globalThis.v13AccountOwnershipState={ ...state, bookings:[...state.bookings] };
      try{
        window.dispatchEvent(new CustomEvent('mosigo:account',{ detail:globalThis.v13AccountOwnershipState }));
      }catch(error){}
      try{ globalThis.MosigoV12SecureSharingUi?.refresh?.(); }catch(error){}
    }

    function enqueue(task){
      const run=()=>Promise.resolve().then(task).catch((error)=>{
        publish('error',{ error:error?.message||'Account operation failed.' });
        console.warn('[Mosigo v13 account ownership]',error?.message||error);
        return null;
      });
      queue=queue.then(run,run);
      return queue;
    }

    async function requestJson(path,options={}){
      const response=await fetch(path,{ credentials:'same-origin', ...options });
      const data=await response.json().catch(()=>null);
      if(!response.ok || !data?.success){
        const error=new Error(data?.message||data?.error||('HTTP '+response.status));
        error.code=data?.error||'';
        error.status=response.status;
        throw error;
      }
      return data;
    }

    function ownsBooking(bookingId){
      const id=String(bookingId||'').trim();
      return Boolean(state.authenticated && id && state.bookings.some((booking)=>String(booking?.bookingId||'')===id));
    }

    function syncSharingOwnerProvider(){
      try{
        sharing.setOwnerAccessProvider?.((bookingId)=>ownsBooking(bookingId));
      }catch(error){}
    }

    async function listBookingsInternal(){
      if(!state.authenticated) return [];
      const data=await requestJson(ACCOUNT_API+'?resource=bookings');
      const bookings=Array.isArray(data.bookings) ? data.bookings : [];
      publish('ready',{ bookings, account:data.account||state.account, error:'' });
      syncSharingOwnerProvider();
      return bookings;
    }

    async function refreshInternal(){
      publish('checking',{ error:'' });
      const data=await requestJson(ACCOUNT_API);
      const authenticated=Boolean(data.authenticated && data.account);
      publish(authenticated?'authenticated':'signed-out',{
        authenticated,
        account:authenticated ? data.account : null,
        bookings:authenticated ? state.bookings : [],
        sessionExpiresAt:data.sessionExpiresAt||'',
        error:''
      });
      if(authenticated) await listBookingsInternal();
      else syncSharingOwnerProvider();
      return data;
    }

    async function authAction(action,email,password){
      const mode=action==='register'?'register':'login';
      publish(mode==='register'?'registering':'signing-in',{ error:'' });
      const data=await requestJson(ACCOUNT_API,{
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ action:mode, email:String(email||'').trim(), password:String(password||'') })
      });
      publish('authenticated',{
        authenticated:true,
        account:data.account||null,
        bookings:[],
        sessionExpiresAt:data.sessionExpiresAt||'',
        error:''
      });
      await listBookingsInternal();
      return data.account||null;
    }

    async function logoutInternal(){
      publish('signing-out',{ error:'' });
      await requestJson(ACCOUNT_API,{ method:'DELETE' });
      publish('signed-out',{
        authenticated:false,
        account:null,
        bookings:[],
        sessionExpiresAt:'',
        error:''
      });
      syncSharingOwnerProvider();
      return true;
    }

    async function claimBookingInternal(bookingId,recoveryKey=''){
      if(!state.authenticated) throw new Error('로그인 후 예약을 계정에 연결할 수 있습니다.');
      const id=String(bookingId||'').trim();
      const key=String(recoveryKey || durability.getRecoveryKey?.(id) || sync.getRecoveryKey?.(id) || '').trim();
      if(!id || !key) throw new Error('예약 번호와 복구 키가 필요합니다.');
      publish('claiming',{ error:'' });
      const data=await requestJson(ACCOUNT_API,{
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ action:'claim-booking', bookingId:id, recoveryKey:key })
      });
      await listBookingsInternal();
      publish('claimed',{ error:'' });
      return data.booking||null;
    }

    async function claimCurrentBookingInternal(){
      const booking=sync.getState?.();
      if(!booking?.bookingId) throw new Error('현재 연결할 예약이 없습니다.');
      return claimBookingInternal(booking.bookingId);
    }

    async function openBookingInternal(bookingId){
      if(!state.authenticated) throw new Error('로그인이 필요합니다.');
      const id=String(bookingId||'').trim();
      if(!id) throw new Error('예약 번호를 확인해주세요.');
      publish('opening',{ error:'' });
      const data=await requestJson(BOOKING_API+'?bookingId='+encodeURIComponent(id));
      if(!data?.booking?.bookingId) throw new Error('예약을 불러오지 못했습니다.');
      runtime.hydrate(data.booking);
      sync.hydrate(data.booking);
      publish('opened',{ error:'' });
      if(typeof globalThis.goTo==='function') globalThis.goTo('s-order');
      else if(typeof globalThis.go==='function') globalThis.go('s-order');
      return data.booking;
    }

    async function copyShareForBookingInternal(bookingId,ttlMinutes=60){
      if(!ownsBooking(bookingId)) throw new Error('내 계정 소유 예약만 공유할 수 있습니다.');
      return sharing.copyShareLink({ bookingId, ttlMinutes });
    }

    async function revokeShareForBookingInternal(bookingId){
      if(!ownsBooking(bookingId)) throw new Error('내 계정 소유 예약만 공유할 수 있습니다.');
      return sharing.revokeShare(bookingId);
    }

    async function shareStatusForBookingInternal(bookingId){
      if(!ownsBooking(bookingId)) throw new Error('내 계정 소유 예약만 확인할 수 있습니다.');
      return sharing.getShareStatus(bookingId);
    }

    globalThis.MosigoV13AccountOwnership={
      refresh:()=>enqueue(refreshInternal),
      register:(email,password)=>enqueue(()=>authAction('register',email,password)),
      login:(email,password)=>enqueue(()=>authAction('login',email,password)),
      logout:()=>enqueue(logoutInternal),
      listBookings:()=>enqueue(listBookingsInternal),
      claimBooking:(bookingId,recoveryKey='')=>enqueue(()=>claimBookingInternal(bookingId,recoveryKey)),
      claimCurrentBooking:()=>enqueue(claimCurrentBookingInternal),
      openBooking:(bookingId)=>enqueue(()=>openBookingInternal(bookingId)),
      copyShareLink:(bookingId,ttlMinutes=60)=>enqueue(()=>copyShareForBookingInternal(bookingId,ttlMinutes)),
      revokeShare:(bookingId)=>enqueue(()=>revokeShareForBookingInternal(bookingId)),
      getShareStatus:(bookingId)=>enqueue(()=>shareStatusForBookingInternal(bookingId)),
      ownsBooking,
      getState:()=>({ ...state, bookings:[...state.bookings] })
    };

    syncSharingOwnerProvider();
    enqueue(refreshInternal);
  }

  initV13AccountOwnership();
})();
