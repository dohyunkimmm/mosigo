// v11 Portable Recovery Beta — accountless cross-device handoff layered over v10 durable recovery.
(function bootV11BookingHandoff(){
  function initV11BookingHandoff(){
    const durability=globalThis.MosigoV10BookingDurability;
    const sync=globalThis.MosigoV6BookingSync;
    const recovery=globalThis.MosigoV7BookingRecovery;
    const runtime=globalThis.MosigoV4BookingRuntime;
    if(!durability || !sync || !runtime){
      setTimeout(initV11BookingHandoff,25);
      return;
    }
    if(globalThis.MosigoV11BookingHandoff) return;

    const FRAGMENT_PREFIX='#mosigo-recovery=';
    const BOOKING_ID_PATTERN=/^(?:M[46789][A-Z0-9]{8}|M1[01][A-Z0-9]{8})$/;
    const RECOVERY_KEY_PATTERN=/^[A-Za-z0-9_-]{16,}$/;
    let queue=Promise.resolve();
    let state={ status:'ready', bookingId:'', portable:false, redacted:false, error:'' };

    function publish(status,bookingId='',error='',redacted=false){
      state={
        status:String(status||'ready'),
        bookingId:String(bookingId||''),
        portable:Boolean(durability.getCapability?.()?.durableServerPersistence),
        redacted:Boolean(redacted),
        error:String(error||'')
      };
      globalThis.v11BookingHandoffState=state;
      try{
        window.dispatchEvent(new CustomEvent('mosigo:booking-handoff',{
          detail:{ ...state }
        }));
      }catch(error){}
    }

    function enqueue(task){
      const run=()=>Promise.resolve().then(task).catch((error)=>{
        publish('error',currentBookingId(),error?.message||'Portable recovery failed.',state.redacted);
        console.warn('[Mosigo v11 booking handoff]',error?.message||error);
        return null;
      });
      queue=queue.then(run,run);
      return queue;
    }

    function currentBookingId(){
      return String(sync.getState?.()?.bookingId || recovery?.getLatestId?.() || '').trim();
    }

    function parseRecoveryFragment(fragment=globalThis.location?.hash||''){
      const raw=String(fragment||'').trim();
      if(!raw.startsWith(FRAGMENT_PREFIX)) return null;
      let decoded='';
      try{
        decoded=decodeURIComponent(raw.slice(FRAGMENT_PREFIX.length));
      }catch(error){
        throw new Error('복구 링크 형식이 올바르지 않습니다.');
      }
      const separator=decoded.indexOf('.');
      if(separator<1) throw new Error('복구 링크 형식이 올바르지 않습니다.');
      const bookingId=decoded.slice(0,separator).trim().toUpperCase();
      const recoveryKey=decoded.slice(separator+1).trim();
      if(!BOOKING_ID_PATTERN.test(bookingId) || !RECOVERY_KEY_PATTERN.test(recoveryKey)){
        throw new Error('복구 링크 형식이 올바르지 않습니다.');
      }
      return { bookingId, recoveryKey };
    }

    function buildRecoveryFragment(bookingId,recoveryKey){
      const id=String(bookingId||'').trim().toUpperCase();
      const key=String(recoveryKey||'').trim();
      if(!BOOKING_ID_PATTERN.test(id) || !RECOVERY_KEY_PATTERN.test(key)){
        throw new Error('예약 번호와 복구 키를 확인해주세요.');
      }
      return FRAGMENT_PREFIX+encodeURIComponent(id+'.'+key);
    }

    function createRecoveryLink(bookingId=currentBookingId()){
      const id=String(bookingId||'').trim().toUpperCase();
      if(!BOOKING_ID_PATTERN.test(id)) throw new Error('공유할 예약 번호를 찾을 수 없습니다.');
      const key=String(durability.getRecoveryKey?.(id)||'').trim();
      if(!RECOVERY_KEY_PATTERN.test(key)) throw new Error('이 예약의 복구 키를 찾을 수 없습니다.');
      const loc=globalThis.location;
      if(!loc?.origin || !loc?.pathname) throw new Error('현재 페이지 주소를 확인할 수 없습니다.');
      return loc.origin+loc.pathname+buildRecoveryFragment(id,key);
    }

    function redactRecoveryFragment(){
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

    async function recoverFromFragment(fragment=globalThis.location?.hash||''){
      const raw=String(fragment||'');
      if(!raw.startsWith(FRAGMENT_PREFIX)) return null;
      let parsed;
      try{
        parsed=parseRecoveryFragment(raw);
      }catch(error){
        const redacted=redactRecoveryFragment();
        publish('invalid','',error.message,redacted);
        return null;
      }

      const redacted=redactRecoveryFragment();
      publish('recovering',parsed.bookingId,'',redacted);
      const booking=await durability.recover(parsed.bookingId,parsed.recoveryKey);
      if(!booking?.bookingId) throw new Error('예약을 복구하지 못했습니다. 복구 링크를 다시 확인해주세요.');
      publish('recovered',booking.bookingId,'',redacted);
      return booking;
    }

    async function copyRecoveryLink(bookingId=currentBookingId()){
      const link=createRecoveryLink(bookingId);
      if(!globalThis.navigator?.clipboard?.writeText){
        throw new Error('이 브라우저에서는 링크 복사를 지원하지 않습니다.');
      }
      await globalThis.navigator.clipboard.writeText(link);
      publish('copied',String(bookingId||currentBookingId()).trim());
      return link;
    }

    function ensurePortableRecoveryUi(){
      if(typeof document==='undefined') return;

      const landing=document.querySelector('#s-landing .land-wrap');
      if(landing && !document.getElementById('v11-recovery-open')){
        const button=document.createElement('button');
        button.id='v11-recovery-open';
        button.type='button';
        button.className='ob-link';
        button.textContent='다른 기기의 예약 이어보기';
        button.style.cssText='width:100%;margin-top:10px;text-align:center';
        button.addEventListener('click',()=>{
          const input=globalThis.prompt?.('복구 링크를 붙여넣어 주세요.');
          if(!input) return;
          let fragment='';
          try{
            const url=new URL(String(input),globalThis.location?.origin||'https://mosigo.local');
            fragment=url.hash;
          }catch(error){
            fragment=String(input).trim();
          }
          enqueue(()=>recoverFromFragment(fragment)).then((booking)=>{
            if(booking?.bookingId){
              try{ globalThis.showToast?.('예약을 이어서 불러왔습니다'); }catch(error){}
            }else{
              try{ globalThis.showToast?.('복구 링크를 확인해주세요'); }catch(error){}
            }
          });
        });
        landing.appendChild(button);
      }

      const orderNo=document.getElementById('order-no');
      const orderCard=orderNo?.closest?.('.order-card') || orderNo?.parentElement?.parentElement;
      if(orderCard && !document.getElementById('v11-recovery-copy')){
        const button=document.createElement('button');
        button.id='v11-recovery-copy';
        button.type='button';
        button.className='btn secondary';
        button.textContent='다른 기기에서 이어보기 링크 복사';
        button.style.cssText='width:100%;margin-top:12px';
        button.addEventListener('click',()=>{
          enqueue(()=>copyRecoveryLink()).then((link)=>{
            try{ globalThis.showToast?.(link?'복구 링크를 복사했습니다':'복구 링크를 만들 수 없습니다'); }catch(error){}
          });
        });
        orderCard.appendChild(button);
      }
    }

    globalThis.MosigoV11BookingHandoff={
      createRecoveryLink,
      parseRecoveryFragment,
      recoverFromFragment:(fragment=globalThis.location?.hash||'')=>enqueue(()=>recoverFromFragment(fragment)),
      copyRecoveryLink:(bookingId=currentBookingId())=>enqueue(()=>copyRecoveryLink(bookingId)),
      redactRecoveryFragment,
      getState:()=>({ ...state })
    };

    ensurePortableRecoveryUi();
    try{
      window.addEventListener('mosigo:booking-sync',ensurePortableRecoveryUi);
    }catch(error){}

    const initialId=currentBookingId();
    publish('ready',initialId);
    if(String(globalThis.location?.hash||'').startsWith(FRAGMENT_PREFIX)){
      enqueue(()=>recoverFromFragment(globalThis.location.hash));
    }
  }

  initV11BookingHandoff();
})();
