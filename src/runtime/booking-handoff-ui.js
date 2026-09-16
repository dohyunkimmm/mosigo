// v11 Portable Recovery UI — in-app recovery sheet layered over the v11 handoff facade and extended by v12 secure sharing.
(function bootV11PortableRecoveryUi(){
  function initV11PortableRecoveryUi(){
    const handoff=globalThis.MosigoV11BookingHandoff;
    if(!handoff){
      setTimeout(initV11PortableRecoveryUi,25);
      return;
    }
    if(globalThis.MosigoV11PortableRecoveryUi) return;
    if(typeof document==='undefined') return;

    function normalizeInput(value){
      const input=String(value||'').trim();
      if(!input) return '';
      if(input.startsWith('#mosigo-recovery=') || input.startsWith('#mosigo-share=')) return input;
      try{
        const url=new URL(input,globalThis.location?.origin||'https://mosigo.local');
        return String(url.hash||'');
      }catch(error){
        return input;
      }
    }

    function getModal(){ return document.getElementById('v11-recovery-modal'); }
    function getInput(){ return document.getElementById('v11-recovery-input'); }
    function getError(){ return document.getElementById('v11-recovery-error'); }

    function close(){
      getModal()?.classList.remove('show');
      const error=getError();
      if(error) error.textContent='';
    }

    function open(){
      const modal=getModal();
      const input=getInput();
      if(input) input.value='';
      const error=getError();
      if(error) error.textContent='';
      modal?.classList.add('show');
      setTimeout(()=>input?.focus?.(),50);
    }

    let lastPresentedBookingId='';

    function presentRecoveredBooking(detail={}){
      const bookingId=String(detail.bookingId||'').trim();
      if(detail.status!=='recovered' || !bookingId || bookingId===lastPresentedBookingId) return;
      lastPresentedBookingId=bookingId;
      close();
      try{ globalThis.showToast?.('예약을 이어서 불러왔습니다'); }catch(error){}
      if(typeof globalThis.goTo==='function') globalThis.goTo('s-order');
      else if(typeof globalThis.go==='function') globalThis.go('s-order');
    }

    async function submit(){
      const error=getError();
      const fragment=normalizeInput(getInput()?.value||'');
      if(error) error.textContent='';
      let booking=null;
      if(fragment.startsWith('#mosigo-share=')){
        const secureSharing=globalThis.MosigoV12SecureSharing;
        if(!secureSharing){
          if(error) error.textContent='안전한 공유 기능을 불러오는 중입니다. 잠시 후 다시 시도해주세요.';
          return null;
        }
        booking=await secureSharing.recoverFromShareFragment(fragment);
      }else if(fragment.startsWith('#mosigo-recovery=')){
        booking=await handoff.recoverFromFragment(fragment);
      }else{
        if(error) error.textContent='모시고 이어보기 링크를 붙여넣어 주세요.';
        return null;
      }
      if(!booking?.bookingId){
        if(error) error.textContent='이어보기 링크를 확인해주세요.';
        return null;
      }
      close();
      return booking;
    }

    const phone=document.querySelector('.phone-shell') || document.body;
    if(!getModal()){
      const modal=document.createElement('div');
      modal.id='v11-recovery-modal';
      modal.className='overlay';
      modal.setAttribute('role','dialog');
      modal.setAttribute('aria-modal','true');
      modal.setAttribute('aria-labelledby','v11-recovery-title');
      modal.innerHTML=''
        +'<div class="modal-sheet">'
        +'<div class="modal-handle"></div>'
        +'<div class="modal-title" id="v11-recovery-title">다른 기기의 예약 이어보기</div>'
        +'<div class="card-sub" style="margin-bottom:14px">기존 기기에서 복사한 모시고 이어보기 링크를 붙여넣어 주세요. 필요한 사람에게만 공유해주세요.</div>'
        +'<label class="label" for="v11-recovery-input" style="font-size:13px">이어보기 링크</label>'
        +'<input class="input filled" id="v11-recovery-input" inputmode="url" autocomplete="off" spellcheck="false" placeholder="이어보기 링크 붙여넣기">'
        +'<div id="v11-recovery-error" role="alert" style="min-height:18px;margin:4px 0 10px;font-size:12px;color:var(--coral)"></div>'
        +'<div style="display:flex;gap:8px">'
        +'<button class="btn secondary" id="v11-recovery-cancel" type="button" style="flex:1">취소</button>'
        +'<button class="btn primary" id="v11-recovery-submit" type="button" style="flex:1">예약 불러오기</button>'
        +'</div></div>';
      modal.addEventListener('click',(event)=>{ if(event.target===modal) close(); });
      phone.appendChild(modal);
      document.getElementById('v11-recovery-cancel')?.addEventListener('click',close);
      document.getElementById('v11-recovery-submit')?.addEventListener('click',submit);
      getInput()?.addEventListener('keydown',(event)=>{
        if(event.key==='Enter') submit();
        if(event.key==='Escape') close();
      });
    }

    const oldOpen=document.getElementById('v11-recovery-open');
    if(oldOpen){
      const replacement=oldOpen.cloneNode(true);
      oldOpen.replaceWith(replacement);
      replacement.addEventListener('click',open);
    }else{
      const landing=document.querySelector('#s-landing .land-wrap');
      if(landing){
        const button=document.createElement('button');
        button.id='v11-recovery-open';
        button.type='button';
        button.className='ob-link';
        button.textContent='다른 기기의 예약 이어보기';
        button.style.cssText='width:100%;margin-top:10px;text-align:center';
        button.addEventListener('click',open);
        landing.appendChild(button);
      }
    }

    try{
      window.addEventListener('mosigo:booking-handoff',(event)=>presentRecoveredBooking(event?.detail||{}));
    }catch(error){}
    presentRecoveredBooking(handoff.getState?.()||{});

    globalThis.MosigoV11PortableRecoveryUi={ open, close, submit };
  }

  initV11PortableRecoveryUi();
})();
