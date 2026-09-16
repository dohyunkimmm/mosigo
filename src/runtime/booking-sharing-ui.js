// v12 Secure Sharing UI — owner controls for expiring/revocable booking handoff links.
(function bootV12SecureSharingUi(){
  function initV12SecureSharingUi(){
    const sharing=globalThis.MosigoV12SecureSharing;
    const sync=globalThis.MosigoV6BookingSync;
    if(!sharing || !sync){
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

    function moveInOrder(parent,nodes){
      if(!parent) return;
      nodes.filter(Boolean).forEach((node)=>parent.appendChild(node));
    }

    function applyHomeContentOrder(){
      const body=document.querySelector('#s-home .body-scroll');
      if(!body) return;
      const active=document.getElementById('home-active-card');
      const search=body.querySelector('.search-wrap');
      const categories=body.querySelector('.cat-wrap');
      const history=body.querySelector('.history-item')?.closest?.('.sec') || null;
      const banner=body.querySelector('.banner-sec');
      const promo=body.querySelector('.rep-promo');
      moveInOrder(body,[active,search,categories,history,banner,promo]);
    }

    function applySettingsContentOrder(){
      const body=document.querySelector('#s-settings .body-scroll');
      if(!body) return;
      const children=[...body.children];
      const hello=children.find((el)=>el.classList.contains('mp-hello'));
      const icons=children.find((el)=>el.classList.contains('mp-icons'));
      const blue=children.find((el)=>el.matches?.('.mp-banner.blue'));
      const yellow=children.find((el)=>el.matches?.('.mp-banner.yellow'));
      const grade=children.find((el)=>el.classList.contains('mp-grade'));
      const promo=children.find((el)=>el.classList.contains('mp-promo'));
      const benefits=children.find((el)=>el.classList.contains('mp-sec'));
      const foot=children.find((el)=>el.classList.contains('mp-foot'));
      const menus=children.filter((el)=>el.classList.contains('mp-menu'));
      const care=menus.find((el)=>el.textContent.includes('돌봄 · 참여'));
      const settings=menus.find((el)=>el.textContent.includes('서비스 설정'));
      const customer=menus.find((el)=>el.textContent.includes('고객센터'));

      if(icons){
        const items=[...icons.children];
        const reservation=items.find((el)=>el.textContent.includes('예약'));
        const report=items.find((el)=>el.textContent.includes('리포트'));
        const rest=items.filter((el)=>el!==reservation && el!==report);
        moveInOrder(icons,[reservation,report,...rest]);
      }

      moveInOrder(body,[hello,icons,blue,care,settings,customer,yellow,grade,promo,benefits,foot]);
    }

    function applyContentOrder(){
      applyHomeContentOrder();
      applySettingsContentOrder();
    }

    function getOrderCard(){
      const orderNo=document.getElementById('order-no');
      return orderNo?.closest?.('.order-card') || orderNo?.parentElement?.parentElement || null;
    }

    function currentBookingId(){
      return String(sharing.getState?.()?.bookingId || sync.getState?.()?.bookingId || '').trim();
    }

    function accessMode(){
      const bookingId=currentBookingId();
      const owner=Boolean(bookingId && sharing.hasOwnerAccess?.(bookingId));
      const shared=Boolean(bookingId && sync.getShareToken?.(bookingId));
      return { bookingId, owner, shared };
    }

    function removeOwnerActions(){
      document.getElementById('v11-recovery-copy')?.remove?.();
      document.getElementById('v12-share-copy')?.remove?.();
      document.getElementById('v12-share-revoke')?.remove?.();
    }

    function ensureStatus(orderCard){
      let status=document.getElementById('v12-share-status');
      if(!status){
        status=document.createElement('div');
        status.id='v12-share-status';
        status.setAttribute('role','status');
        status.setAttribute('aria-live','polite');
        status.style.cssText='margin-top:8px;font-size:12px;color:var(--text-sub,#68707c)';
        orderCard.appendChild(status);
      }
      return status;
    }

    function ensureSharingControls(){
      const orderCard=getOrderCard();
      if(!orderCard) return;
      const mode=accessMode();
      const status=ensureStatus(orderCard);

      if(!mode.owner){
        removeOwnerActions();
        if(mode.shared){
          status.textContent='공유받은 예약 · 임시 접근 중';
          status.hidden=false;
        }else{
          status.textContent='';
          status.hidden=true;
        }
        return;
      }

      status.hidden=false;
      if(!status.textContent) status.textContent='공유 링크는 서버에서 만료·폐기 여부를 확인합니다.';

      const legacy=document.getElementById('v11-recovery-copy');
      let copy=document.getElementById('v12-share-copy');
      if(!copy && legacy){
        copy=legacy.cloneNode(true);
        copy.id='v12-share-copy';
        copy.textContent='안전한 이어보기 링크 복사 (1시간)';
        legacy.replaceWith(copy);
      }else if(legacy){
        legacy.remove?.();
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
          let issued=null;
          try{
            issued=await sharing.copyShareLink({ ttlMinutes:60 });
          }finally{
            copy.disabled=false;
          }
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
          let result=null;
          try{
            result=await sharing.revokeShare();
          }finally{
            revoke.disabled=false;
          }
          show(result ? '기존 공유 링크를 폐기했습니다' : '폐기할 공유 링크가 없습니다');
        });
      }
    }

    function updateStatus(detail={}){
      const status=document.getElementById('v12-share-status');
      if(!status) return;
      const mode=accessMode();
      if(!mode.owner && mode.shared){
        status.hidden=false;
        status.textContent='공유받은 예약 · 임시 접근 중';
        return;
      }
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

    applyContentOrder();
    ensureSharingControls();
    try{
      window.addEventListener('mosigo:booking-sync',()=>{
        applyContentOrder();
        ensureSharingControls();
      });
      window.addEventListener('mosigo:secure-share',(event)=>{
        ensureSharingControls();
        updateStatus(event?.detail||{});
        presentRecoveredBooking(event?.detail||{});
      });
    }catch(error){}

    globalThis.MosigoV12SecureSharingUi={
      refresh:ensureSharingControls,
      applyContentOrder,
      updateStatus
    };
  }

  initV12SecureSharingUi();
})();
