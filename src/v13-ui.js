// v13 Account Ownership UI — account entry, owned-booking list, claim, and share management.
(function bootV13AccountOwnershipUi(){
  function initV13AccountOwnershipUi(){
    const account=globalThis.MosigoV13AccountOwnership;
    const sync=globalThis.MosigoV6BookingSync;
    const durability=globalThis.MosigoV10BookingDurability;
    if(!account || !sync || !durability){
      setTimeout(initV13AccountOwnershipUi,25);
      return;
    }
    if(globalThis.MosigoV13AccountOwnershipUi) return;
    if(typeof document==='undefined') return;

    function show(message){
      try{ globalThis.showToast?.(message); }catch(error){}
    }

    function node(tag,{ id='', className='', text='', type='', attrs={} }={}){
      const item=document.createElement(tag);
      if(id) item.id=id;
      if(className) item.className=className;
      if(text) item.textContent=text;
      if(type) item.type=type;
      Object.entries(attrs).forEach(([key,value])=>item.setAttribute(key,String(value)));
      return item;
    }

    function open(id){ document.getElementById(id)?.classList.add('show'); }
    function close(id){ document.getElementById(id)?.classList.remove('show'); }

    function state(){ return account.getState?.()||{ authenticated:false, account:null, bookings:[], error:'' }; }

    function ensureLandingEntry(){
      const email=document.getElementById('land-email');
      if(!email || document.getElementById('v13-account-entry')) return;
      const button=node('button',{
        id:'v13-account-entry',
        className:'btn secondary',
        text:'계정 로그인 · 예약 이어보기',
        type:'button'
      });
      button.style.cssText='width:100%;margin:0 0 10px';
      button.addEventListener('click',()=>{
        const modalEmail=document.getElementById('v13-account-email');
        if(modalEmail && email.value) modalEmail.value=email.value;
        open('modal-v13-account');
      });
      email.insertAdjacentElement('afterend',button);
    }

    function ensureAccountModal(){
      if(document.getElementById('modal-v13-account')) return;
      const overlay=node('div',{ id:'modal-v13-account', className:'overlay', attrs:{ 'aria-hidden':'true' } });
      const sheet=node('div',{ className:'modal-sheet' });
      overlay.addEventListener('click',(event)=>{ if(event.target===overlay) close('modal-v13-account'); });
      sheet.appendChild(node('div',{ className:'modal-handle' }));
      sheet.appendChild(node('div',{ className:'modal-title', text:'계정으로 예약 이어보기' }));
      const sub=node('div',{ className:'modal-sub', text:'로그인하면 내 예약을 계정 기준으로 불러오고 다른 기기에서도 이어볼 수 있어요.' });
      sub.style.marginBottom='14px';
      sheet.appendChild(sub);

      const email=node('input',{ id:'v13-account-email', className:'input filled', attrs:{ type:'email', autocomplete:'email', placeholder:'이메일' } });
      const password=node('input',{ id:'v13-account-password', className:'input filled', attrs:{ type:'password', autocomplete:'current-password', placeholder:'비밀번호 (8자 이상)' } });
      sheet.appendChild(email);
      sheet.appendChild(password);

      const actions=node('div');
      actions.style.cssText='display:flex;gap:8px;margin-top:10px';
      const login=node('button',{ className:'btn primary', text:'로그인', type:'button' });
      const register=node('button',{ className:'btn secondary', text:'계정 만들기', type:'button' });
      login.style.flex='1'; register.style.flex='1';

      async function run(mode){
        const emailValue=email.value.trim();
        const passwordValue=password.value;
        login.disabled=true; register.disabled=true;
        try{
          const result=mode==='register'
            ? await account.register(emailValue,passwordValue)
            : await account.login(emailValue,passwordValue);
          if(result){
            password.value='';
            close('modal-v13-account');
            show(mode==='register'?'계정을 만들고 로그인했습니다':'로그인했습니다');
            renderAccountCard();
          }else{
            show(state().error||'계정 요청을 처리하지 못했습니다');
          }
        }finally{
          login.disabled=false; register.disabled=false;
        }
      }

      login.addEventListener('click',()=>run('login'));
      register.addEventListener('click',()=>run('register'));
      password.addEventListener('keydown',(event)=>{ if(event.key==='Enter') run('login'); });
      actions.append(login,register);
      sheet.appendChild(actions);
      overlay.appendChild(sheet);
      (document.getElementById('phone')||document.body).appendChild(overlay);
    }

    function currentClaimable(){
      const current=sync.getState?.();
      const id=String(current?.bookingId||'').trim();
      const key=id ? String(durability.getRecoveryKey?.(id)||sync.getRecoveryKey?.(id)||'').trim() : '';
      const owned=id ? account.ownsBooking?.(id) : false;
      return { current, id, key, claimable:Boolean(state().authenticated && id && key && !owned) };
    }

    function ensureSettingsCard(){
      const body=document.querySelector('#s-settings .body-scroll');
      const hello=body?.querySelector('.mp-hello');
      if(!body || !hello) return null;
      let card=document.getElementById('v13-account-card');
      if(!card){
        card=node('div',{ id:'v13-account-card', className:'sec' });
        card.style.cssText='margin-top:12px;border:1px solid var(--border,#e5e7eb);border-radius:16px;padding:14px;background:#fff';
      }
      hello.insertAdjacentElement('afterend',card);
      return card;
    }

    function renderAccountCard(){
      ensureLandingEntry();
      ensureAccountModal();
      ensureBookingsModal();
      const card=ensureSettingsCard();
      if(!card) return;
      const s=state();
      card.replaceChildren();

      const title=node('div',{ text:'계정으로 예약 이어보기' });
      title.style.cssText='font-size:15px;font-weight:800;color:var(--g900,#111827)';
      const desc=node('div');
      desc.style.cssText='font-size:12px;line-height:1.55;color:var(--g500,#6b7280);margin-top:5px';
      desc.textContent=s.authenticated
        ? `${s.account?.email||''} · 내 예약 ${s.bookings?.length||0}건`
        : '로그인하면 다른 기기에서도 내 예약을 계정으로 불러올 수 있어요.';
      card.append(title,desc);

      const row=node('div');
      row.style.cssText='display:flex;gap:8px;margin-top:12px';
      if(s.authenticated){
        const list=node('button',{ className:'btn secondary', text:'내 예약 보기', type:'button' });
        const logout=node('button',{ className:'btn secondary', text:'로그아웃', type:'button' });
        list.style.flex='1'; logout.style.flex='1';
        list.addEventListener('click',async()=>{
          await account.listBookings();
          renderBookingsModal();
          open('modal-v13-bookings');
        });
        logout.addEventListener('click',async()=>{
          const ok=await account.logout();
          if(ok) show('로그아웃했습니다');
          renderAccountCard();
        });
        row.append(list,logout);
      }else{
        const login=node('button',{ className:'btn primary', text:'로그인 / 계정 만들기', type:'button' });
        login.style.width='100%';
        login.addEventListener('click',()=>open('modal-v13-account'));
        row.appendChild(login);
      }
      card.appendChild(row);

      const claim=currentClaimable();
      if(claim.claimable){
        const claimButton=node('button',{ className:'btn secondary', text:'현재 예약을 내 계정에 연결', type:'button' });
        claimButton.style.cssText='width:100%;margin-top:8px';
        claimButton.addEventListener('click',async()=>{
          claimButton.disabled=true;
          try{
            const result=await account.claimCurrentBooking();
            if(result){ show('현재 예약을 내 계정에 연결했습니다'); renderAccountCard(); }
            else show(state().error||'예약을 계정에 연결하지 못했습니다');
          }finally{ claimButton.disabled=false; }
        });
        card.appendChild(claimButton);
      }
    }

    function ensureBookingsModal(){
      if(document.getElementById('modal-v13-bookings')) return;
      const overlay=node('div',{ id:'modal-v13-bookings', className:'overlay' });
      const sheet=node('div',{ className:'modal-sheet' });
      sheet.style.maxHeight='82vh';
      overlay.addEventListener('click',(event)=>{ if(event.target===overlay) close('modal-v13-bookings'); });
      sheet.appendChild(node('div',{ className:'modal-handle' }));
      const head=node('div');
      head.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px';
      head.appendChild(node('div',{ className:'modal-title', text:'내 예약' }));
      const refresh=node('button',{ className:'btn secondary', text:'새로고침', type:'button' });
      refresh.style.cssText='min-height:36px;padding:0 12px';
      refresh.addEventListener('click',async()=>{ await account.listBookings(); renderBookingsModal(); });
      head.appendChild(refresh);
      sheet.appendChild(head);
      const list=node('div',{ id:'v13-booking-list' });
      list.style.cssText='overflow:auto;max-height:60vh;margin-top:10px';
      sheet.appendChild(list);
      overlay.appendChild(sheet);
      (document.getElementById('phone')||document.body).appendChild(overlay);
    }

    function bookingLabel(booking){
      const hospital=String(booking?.hospitalName||'병원동행 예약');
      const date=[booking?.date,booking?.time].filter(Boolean).join(' ');
      return { hospital, date };
    }

    function renderBookingsModal(){
      const list=document.getElementById('v13-booking-list');
      if(!list) return;
      list.replaceChildren();
      const s=state();
      if(!s.authenticated){
        const empty=node('div',{ text:'로그인이 필요합니다.' });
        empty.style.cssText='padding:22px 4px;color:var(--g500,#6b7280);font-size:13px';
        list.appendChild(empty);
        return;
      }
      if(!s.bookings?.length){
        const empty=node('div',{ text:'계정에 연결된 예약이 아직 없습니다.' });
        empty.style.cssText='padding:22px 4px;color:var(--g500,#6b7280);font-size:13px';
        list.appendChild(empty);
        return;
      }

      s.bookings.forEach((booking)=>{
        const labels=bookingLabel(booking);
        const card=node('div');
        card.style.cssText='border:1px solid var(--border,#e5e7eb);border-radius:14px;padding:12px;margin-bottom:10px';
        const hospital=node('div',{ text:labels.hospital });
        hospital.style.cssText='font-size:14px;font-weight:800;color:var(--g900,#111827)';
        const meta=node('div',{ text:[labels.date,booking?.targetName,booking?.phase].filter(Boolean).join(' · ') });
        meta.style.cssText='font-size:11px;color:var(--g500,#6b7280);margin-top:4px';
        const id=node('div',{ text:String(booking?.bookingId||'') });
        id.style.cssText='font-size:10px;color:var(--g400,#9ca3af);margin-top:3px';
        card.append(hospital,meta,id);

        const actions=node('div');
        actions.style.cssText='display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:10px';
        const openButton=node('button',{ className:'btn secondary', text:'열기', type:'button' });
        const shareButton=node('button',{ className:'btn secondary', text:'1시간 공유', type:'button' });
        const revokeButton=node('button',{ className:'btn secondary', text:'공유 폐기', type:'button' });
        [openButton,shareButton,revokeButton].forEach((button)=>{ button.style.cssText='min-height:38px;padding:0 6px;font-size:11px'; });

        openButton.addEventListener('click',async()=>{
          const opened=await account.openBooking(booking.bookingId);
          if(opened){ close('modal-v13-bookings'); show('내 예약을 불러왔습니다'); }
          else show(state().error||'예약을 불러오지 못했습니다');
        });
        shareButton.addEventListener('click',async()=>{
          shareButton.disabled=true;
          try{
            const result=await account.copyShareLink(booking.bookingId,60);
            if(result?.link) show('1시간 공유 링크를 복사했습니다');
            else show(state().error||'공유 링크를 만들지 못했습니다');
          }finally{ shareButton.disabled=false; }
        });
        revokeButton.addEventListener('click',async()=>{
          revokeButton.disabled=true;
          try{
            const result=await account.revokeShare(booking.bookingId);
            if(result) show('공유 링크를 폐기했습니다');
            else show(state().error||'공유 링크를 폐기하지 못했습니다');
          }finally{ revokeButton.disabled=false; }
        });
        actions.append(openButton,shareButton,revokeButton);
        card.appendChild(actions);
        list.appendChild(card);
      });
    }

    ensureLandingEntry();
    ensureAccountModal();
    ensureBookingsModal();
    renderAccountCard();
    try{
      window.addEventListener('mosigo:account',()=>{
        renderAccountCard();
        renderBookingsModal();
      });
      window.addEventListener('mosigo:booking-sync',()=>renderAccountCard());
    }catch(error){}

    globalThis.MosigoV13AccountOwnershipUi={
      openAccount:()=>open('modal-v13-account'),
      openBookings:async()=>{ await account.listBookings(); renderBookingsModal(); open('modal-v13-bookings'); },
      refresh:()=>{ renderAccountCard(); renderBookingsModal(); }
    };
  }

  initV13AccountOwnershipUi();
})();
