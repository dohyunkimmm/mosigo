// v12 Secure Sharing UI — owner controls for expiring/revocable booking handoff links.
(function bootV12SecureSharingUi(){
  function initV12SecureSharingUi(){
    const sharing=globalThis.MosigoV12SecureSharing;
    if(!sharing){
      setTimeout(initV12SecureSharingUi,25);
      return;
    }
    if(globalThis.MosigoV12SecureSharingUi) return;
    if(typeof document==='undefined') return;

    function formatExpiry(value){
      const time=Date.parse(String(value||''));
      if(!Number.isFinite(time)) return '';
      try{
        return new Intl.DateTimeFormat('ko-KR',{
          hour:'2-digit',
          minute:'2-digit'
        }).format(new Date(time));
      }catch(error){
        return '';
      }
    }

    function show(message){
      try{ globalThis.showToast?.(message); }catch(error){}
    }

    function getOrderCard(){
      const orderNo=document.getElementById('order-no');
      return orderNo?.closest?.('.order-card') || orderNo?.parentElement?.parentElement || null;
    }

    function ensureOwnerControls(){
      const orderCard=getOrderCard();
      if(!orderCard) return;

      const legacy=document.getElementById('v11-recovery-copy');
      let copy=document.getElementById('v12-share-copy');
      if(!copy && legacy){
        copy=legacy.cloneNode(true);
        copy.id='v12-share-copy';
        copy.textContent='안전한 이어보기 링크 복사 (1시간)';
        legacy.replaceWith(copy);
      }
      if(!copy){
        copy=document.createElement('button');
        copy.id='v12-share-copy';
        copy.type='button';
        copy.className='btn secondary';
        copy.textContent='안전한 이어보기 링크 복사 (1시간)';
        copy.style.cssText='width:100%;margin-top:12px';
        orderCard.appendChild(copy);
      }
      if(!copy.dataset.mosigoV12Bound){
        copy.dataset.mosigoV12Bound='1';
        copy.addEventListener('click',async()=>{
          copy.disabled=true;
          const issued=await sharing.copyShareLink({ ttlMinutes:60 });
          copy.disabled=false;
          if(issued?.link){
            const expiry=formatExpiry(issued.share?.expiresAt);
            show(expiry ? `공유 링크를 복사했습니다 · ${expiry}까지 유효` : '공유 링크를 복사했습니다');
          }else{
            show('공유 링크를 만들 수 없습니다');
          }
        });
      }

      let revoke=document.getElementById('v12-share-revoke');
      if(!revoke){
        revoke=document.createElement('button');
        revoke.id='v12-share-revoke';
        revoke.type='button';
        revoke.className='btn secondary';
        revoke.textContent='공유 링크 폐기';
        revoke.style.cssText='width:100%;margin-top:8px';
        orderCard.appendChild(revoke);
      }
      if(!revoke.dataset.mosigoV12Bound){
        revoke.dataset.mosigoV12Bound='1';
        revoke.addEventListener('click',async()=>{
          revoke.disabled=true;
          const result=await sharing.revokeShare();
          revoke.disabled=false;
          show(result ? '기존 공유 링크를 폐기했습니다' : '폐기할 공유 링크가 없습니다');
        });
      }

      let status=document.getElementById('v12-share-status');
      if(!status){
        status=document.createElement('div');
        status.id='v12-share-status';
        status.setAttribute('role','status');
        status.style.cssText='margin-top:8px;font-size:12px;color:var(--text-sub,#68707c)';
        status.textContent='공유 링크는 서버에서 만료·폐기 여부를 확인합니다.';
        orderCard.appendChild(status);
      }
    }

    function updateStatus(detail={}){
      const status=document.getElementById('v12-share-status');
      if(!status) return;
      if(detail.status==='copied' || detail.status==='issued'){
        const expiry=formatExpiry(detail.expiresAt);
        status.textContent=expiry ? `현재 공유 링크: ${expiry}까지 유효` : '현재 공유 링크가 활성화되었습니다.';
      }else if(detail.status==='revoked'){
        status.textContent='현재 공유 링크는 폐기되었습니다.';
      }else if(detail.status==='recovered'){
        status.textContent='안전한 공유 링크로 예약을 불러왔습니다.';
      }else if(detail.status==='error' && detail.error){
        status.textContent=detail.error;
      }
    }

    function presentRecoveredBooking(detail={}){
      const bookingId=String(detail.bookingId||'').trim();
      if(detail.status!=='recovered' || !bookingId) return;
      try{ globalThis.MosigoV11PortableRecoveryUi?.close?.(); }catch(error){}
      show('안전한 공유 링크로 예약을 불러왔습니다');
      if(typeof globalThis.goTo==='function') globalThis.goTo('s-order');
      else if(typeof globalThis.go==='function') globalThis.go('s-order');
    }

    ensureOwnerControls();
    try{
      window.addEventListener('mosigo:booking-sync',ensureOwnerControls);
      window.addEventListener('mosigo:secure-share',(event)=>{
        ensureOwnerControls();
        updateStatus(event?.detail||{});
        presentRecoveredBooking(event?.detail||{});
      });
    }catch(error){}

    globalThis.MosigoV12SecureSharingUi={
      refresh:ensureOwnerControls,
      updateStatus
    };
  }

  initV12SecureSharingUi();
})();
