// v12 Secure Sharing Beta — expiring, revocable, server-validated booking handoff capabilities.
(function bootV12SecureSharing(){
  function initV12SecureSharing(){
    const durability=globalThis.MosigoV10BookingDurability;
    const sync=globalThis.MosigoV6BookingSync;
    const recovery=globalThis.MosigoV7BookingRecovery;
    const runtime=globalThis.MosigoV4BookingRuntime;
    if(!durability || !sync || !recovery || !runtime){
      setTimeout(initV12SecureSharing,25);
      return;
    }
    if(globalThis.MosigoV12SecureSharing) return;

    const SHARE_API='/api/booking-shares';
    const BOOKING_API='/api/bookings';
    const FRAGMENT_PREFIX='#mosigo-share=';
    const BOOKING_ID_PATTERN=/^(?:M[46789][A-Z0-9]{8}|M1[01][A-Z0-9]{8})$/;
    const SHARE_TOKEN_PATTERN=/^[A-Za-z0-9_-]{24,}$/;
    const DEFAULT_TTL_MINUTES=60;
    let queue=Promise.resolve();
    let ownerAccessProvider=()=>false;
    let state={ status:'ready', bookingId:'', active:false, expiresAt:'', redacted:false, error:'' };

    function currentBookingId(){
      return String(sync.getState?.()?.bookingId || recovery.getLatestId?.() || '').trim();
    }

    function publish(status,{ bookingId=currentBookingId(), active=false, expiresAt='', redacted=state.redacted, error='' }={}){
      state={
        status:String(status||'ready'),
        bookingId:String(bookingId||''),
        active:Boolean(active),
        expiresAt:String(expiresAt||''),
        redacted:Boolean(redacted),
        error:String(error||'')
      };
      globalThis.v12SecureShareState=state;
      try{
        window.dispatchEvent(new CustomEvent('mosigo:secure-share',{ detail:{ ...state } }));
      }catch(error){}
    }

    function enqueue(task){
      const run=()=>Promise.resolve().then(task).catch((error)=>{
        publish('error',{ error:error?.message||'Secure sharing failed.' });
        console.warn('[Mosigo v12 secure sharing]',error?.message||error);
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

    async function copyText(text){
      const value=String(text||'');
      if(!value) return false;
      if(globalThis.navigator?.clipboard?.writeText){
        try{
          await globalThis.navigator.clipboard.writeText(value);
          return true;
        }catch(error){}
      }

      const doc=globalThis.document;
      if(!doc?.body || typeof doc.createElement!=='function' || typeof doc.execCommand!=='function') return false;
      const textarea=doc.createElement('textarea');
      textarea.value=value;
      textarea.setAttribute('readonly','');
      textarea.style.position='fixed';
      textarea.style.opacity='0';
      textarea.style.pointerEvents='none';
      doc.body.appendChild(textarea);
      textarea.select?.();
      textarea.setSelectionRange?.(0,value.length);
      let copied=false;
      try{ copied=doc.execCommand('copy')===true; }catch(error){}
      if(typeof textarea.remove==='function') textarea.remove();
      else doc.body.removeChild?.(textarea);
      return copied;
    }

    function parseShareFragment(fragment=globalThis.location?.hash||''){
      const raw=String(fragment||'').trim();
      if(!raw.startsWith(FRAGMENT_PREFIX)) return null;
      let decoded='';
      try{
        decoded=decodeURIComponent(raw.slice(FRAGMENT_PREFIX.length));
      }catch(error){
        throw new Error('공유 링크 형식이 올바르지 않습니다.');
      }
      const separator=decoded.indexOf('.');
      if(separator<1) throw new Error('공유 링크 형식이 올바르지 않습니다.');
      const bookingId=decoded.slice(0,separator).trim().toUpperCase();
      const shareToken=decoded.slice(separator+1).trim();
      if(!BOOKING_ID_PATTERN.test(bookingId) || !SHARE_TOKEN_PATTERN.test(shareToken)){
        throw new Error('공유 링크 형식이 올바르지 않습니다.');
      }
      return { bookingId, shareToken };
    }

    function buildShareFragment(bookingId,shareToken){
      const id=String(bookingId||'').trim().toUpperCase();
      const token=String(shareToken||'').trim();
      if(!BOOKING_ID_PATTERN.test(id) || !SHARE_TOKEN_PATTERN.test(token)){
        throw new Error('예약 번호와 공유 토큰을 확인해주세요.');
      }
      return FRAGMENT_PREFIX+encodeURIComponent(id+'.'+token);
    }

    function redactShareFragment(){
      const loc=globalThis.location;
      if(!String(loc?.hash||'').startsWith(FRAGMENT_PREFIX)) return false;
      const replacement=(loc?.pathname||'/')+(loc?.search||'');
      try{
        globalThis.history?.replaceState?.(globalThis.history?.state||null,'',replacement);
        return true;
      }catch(error){
        return false;
      }
    }

    function recoveryKeyFor(bookingId=currentBookingId()){
      return String(durability.getRecoveryKey?.(bookingId) || sync.getRecoveryKey?.(bookingId) || '').trim();
    }

    function accountOwnerAccess(bookingId){
      try{return ownerAccessProvider(String(bookingId||'').trim().toUpperCase())===true;}catch(error){return false;}
    }

    function hasOwnerAccess(bookingId=currentBookingId()){
      const id=String(bookingId||'').trim().toUpperCase();
      return BOOKING_ID_PATTERN.test(id) && Boolean(recoveryKeyFor(id) || accountOwnerAccess(id));
    }

    function ensureOwnerAccess(bookingId){
      const id=String(bookingId||'').trim().toUpperCase();
      if(!BOOKING_ID_PATTERN.test(id)) throw new Error('공유할 예약 번호를 찾을 수 없습니다.');
      const recoveryKey=recoveryKeyFor(id);
      if(!recoveryKey && !accountOwnerAccess(id)) throw new Error('이 예약의 소유자 권한을 확인할 수 없습니다.');
      return { bookingId:id, recoveryKey };
    }

    function ownerHeaders(owner,includeContentType=false){
      const headers={};
      if(includeContentType) headers['Content-Type']='application/json';
      if(owner.recoveryKey) headers['X-Mosigo-Recovery-Key']=owner.recoveryKey;
      return headers;
    }

    async function issueShare({ bookingId=currentBookingId(), ttlMinutes=DEFAULT_TTL_MINUTES }={}){
      const owner=ensureOwnerAccess(bookingId);
      publish('issuing',{ bookingId:owner.bookingId });
      const data=await requestJson(SHARE_API,{
        method:'POST',
        headers:ownerHeaders(owner,true),
        body:JSON.stringify({ bookingId:owner.bookingId, ttlMinutes })
      });
      const shareToken=String(data.shareToken||'').trim();
      if(!SHARE_TOKEN_PATTERN.test(shareToken)) throw new Error('서버에서 유효한 공유 토큰을 받지 못했습니다.');
      const loc=globalThis.location;
      if(!loc?.origin || !loc?.pathname) throw new Error('현재 페이지 주소를 확인할 수 없습니다.');
      const link=loc.origin+loc.pathname+buildShareFragment(owner.bookingId,shareToken);
      publish('issued',{
        bookingId:owner.bookingId,
        active:true,
        expiresAt:data.share?.expiresAt||''
      });
      return { ...data, link };
    }

    async function rollbackIssuedShare(bookingId){
      try{
        await revokeShare(bookingId);
        return true;
      }catch(error){
        console.warn('[Mosigo v12 secure sharing] failed to revoke un-copied share',error?.message||error);
        return false;
      }
    }

    async function copyShareLink(options={}){
      const issued=await issueShare(options);
      const copied=await copyText(issued.link);
      if(!copied){
        await rollbackIssuedShare(issued.bookingId);
        throw new Error('링크를 복사하지 못해 새 공유 링크를 즉시 폐기했습니다.');
      }
      publish('copied',{
        bookingId:issued.bookingId,
        active:true,
        expiresAt:issued.share?.expiresAt||''
      });
      return issued;
    }

    async function getShareStatus(bookingId=currentBookingId()){
      const owner=ensureOwnerAccess(bookingId);
      const data=await requestJson(SHARE_API+'?bookingId='+encodeURIComponent(owner.bookingId),{
        headers:ownerHeaders(owner,false)
      });
      publish('status',{
        bookingId:owner.bookingId,
        active:Boolean(data.share?.active),
        expiresAt:data.share?.expiresAt||''
      });
      return data.share||null;
    }

    async function revokeShare(bookingId=currentBookingId()){
      const owner=ensureOwnerAccess(bookingId);
      publish('revoking',{ bookingId:owner.bookingId });
      const data=await requestJson(SHARE_API,{
        method:'DELETE',
        headers:ownerHeaders(owner,true),
        body:JSON.stringify({ bookingId:owner.bookingId })
      });
      publish('revoked',{ bookingId:owner.bookingId, active:false, expiresAt:data.share?.expiresAt||'' });
      return data.share||null;
    }

    async function recoverFromShareFragment(fragment=globalThis.location?.hash||''){
      const raw=String(fragment||'');
      if(!raw.startsWith(FRAGMENT_PREFIX)) return null;
      let parsed;
      try{
        parsed=parseShareFragment(raw);
      }catch(error){
        const redacted=redactShareFragment();
        publish('invalid',{ bookingId:'', active:false, redacted, error:error.message });
        return null;
      }

      const redacted=redactShareFragment();
      publish('recovering',{ bookingId:parsed.bookingId, active:true, redacted });
      const data=await requestJson(BOOKING_API+'?bookingId='+encodeURIComponent(parsed.bookingId),{
        method:'GET',
        headers:{ 'X-Mosigo-Share-Token':parsed.shareToken }
      });
      if(!data?.booking?.bookingId) throw new Error('공유 링크로 예약을 불러오지 못했습니다.');
      sync.setShareToken?.(parsed.bookingId,parsed.shareToken);
      runtime.hydrate(data.booking);
      sync.hydrate(data.booking);
      publish('recovered',{ bookingId:data.booking.bookingId, active:true, redacted });
      return data.booking;
    }

    globalThis.MosigoV12SecureSharing={
      issueShare:(options={})=>enqueue(()=>issueShare(options)),
      rotateShare:(options={})=>enqueue(()=>issueShare(options)),
      copyShareLink:(options={})=>enqueue(()=>copyShareLink(options)),
      getShareStatus:(bookingId=currentBookingId())=>enqueue(()=>getShareStatus(bookingId)),
      revokeShare:(bookingId=currentBookingId())=>enqueue(()=>revokeShare(bookingId)),
      recoverFromShareFragment:(fragment=globalThis.location?.hash||'')=>enqueue(()=>recoverFromShareFragment(fragment)),
      parseShareFragment,
      buildShareFragment,
      redactShareFragment,
      hasOwnerAccess,
      setOwnerAccessProvider:(provider)=>{ ownerAccessProvider=typeof provider==='function' ? provider : ()=>false; publish('ready',{ bookingId:currentBookingId() }); },
      getState:()=>({ ...state })
    };

    publish('ready',{ bookingId:currentBookingId() });
    if(String(globalThis.location?.hash||'').startsWith(FRAGMENT_PREFIX)){
      enqueue(()=>recoverFromShareFragment(globalThis.location.hash));
    }
  }

  initV12SecureSharing();
})();
