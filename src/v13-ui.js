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

    const focusReturn=new Map();

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

    function ensureStyles(){
      if(document.getElementById('v13-ui-style')) return;
      const link=node('link',{
        id:'v13-ui-style',
        attrs:{ rel:'stylesheet', href:'v13-ui.css' }
      });
      (document.head||document.documentElement).appendChild(link);
    }

    function open(id,trigger=document.activeElement){
      const overlay=document.getElementById(id);
      if(!overlay) return;
      focusReturn.set(id,trigger instanceof HTMLElement ? trigger : null);
      overlay.classList.add('show');
      overlay.setAttribute('aria-hidden','false');
      requestAnimationFrame(()=>{
        const target=overlay.querySelector('[data-autofocus], input:not([disabled]), button:not([disabled])');
        target?.focus?.({ preventScroll:true });
      });
    }

    function close(id){
      const overlay=document.getElementById(id);
      if(!overlay) return;
      overlay.classList.remove('show');
      overlay.setAttribute('aria-hidden','true');
      const target=focusReturn.get(id);
      focusReturn.delete(id);
      if(target?.isConnected) requestAnimationFrame(()=>target.focus?.({ preventScroll:true }));
    }

    function setBusy(button,busy,busyLabel='처리 중'){
      if(!button) return;
      if(busy){
        button.dataset.idleLabel=button.textContent||'';
        button.textContent=busyLabel;
        button.disabled=true;
        button.setAttribute('aria-busy','true');
      }else{
        button.textContent=button.dataset.idleLabel||button.textContent||'';
        delete button.dataset.idleLabel;
        button.disabled=false;
        button.removeAttribute('aria-busy');
      }
    }

    function state(){ return account.getState?.()||{ authenticated:false, account:null, bookings:[], error:'' }; }

    function ensureLandingEntry(){
      const email=document.getElementById('land-email');
      if(!email || document.getElementById('v13-account-entry')) return;
      const button=node('button',{
        id:'v13-account-entry',
        className:'btn secondary v13-account-entry',
        text:'계정 로그인 · 예약 이어보기',
        type:'button',
        attrs:{ 'aria-haspopup':'dialog', 'aria-controls':'modal-v13-account' }
      });
      button.addEventListener('click',()=>{
        const modalEmail=document.getElementById('v13-account-email');
        if(modalEmail && email.value) modalEmail.value=email.value;
        open('modal-v13-account',button);
      });
      email.insertAdjacentElement('afterend',button);
    }

    function ensureAccountModal(){
      if(document.getElementById('modal-v13-account')) return;
      const overlay=node('div',{
        id:'modal-v13-account',
        className:'overlay v13-modal',
        attrs:{ 'aria-hidden':'true' }
      });
      const sheet=node('div',{
        className:'modal-sheet v13-modal-sheet',
        attrs:{ role:'dialog', 'aria-modal':'true', 'aria-labelledby':'v13-account-title', tabindex:'-1' }
      });
      overlay.addEventListener('click',(event)=>{ if(event.target===overlay) close('modal-v13-account'); });
      sheet.appendChild(node('div',{ className:'modal-handle', attrs:{ 'aria-hidden':'true' } }));

      const head=node('div',{ className:'v13-modal-head' });
      const copy=node('div',{ className:'v13-modal-copy' });
      copy.appendChild(node('div',{ className:'v13-modal-eyebrow', text:'Account ownership' }));
      copy.appendChild(node('div',{ id:'v13-account-title', className:'v13-modal-title', text:'계정으로 예약 이어보기' }));
      copy.appendChild(node('div',{
        className:'v13-modal-sub',
        text:'로그인하면 내 예약을 계정 기준으로 불러오고 다른 기기에서도 이어볼 수 있어요.'
      }));
      const closeButton=node('button',{
        className:'v13-icon-btn',
        text:'×',
        type:'button',
        attrs:{ 'aria-label':'계정 창 닫기' }
      });
      closeButton.addEventListener('click',()=>close('modal-v13-account'));
      head.append(copy,closeButton);
      sheet.appendChild(head);

      const emailField=node('div',{ className:'v13-field' });
      const emailLabel=node('label',{ className:'v13-field-label', text:'이메일', attrs:{ for:'v13-account-email' } });
      const email=node('input',{
        id:'v13-account-email',
        className:'input filled v13-input',
        attrs:{ type:'email', autocomplete:'email', inputmode:'email', placeholder:'name@example.com', 'data-autofocus':'true' }
      });
      emailField.append(emailLabel,email);

      const passwordField=node('div',{ className:'v13-field' });
      const passwordLabel=node('label',{ className:'v13-field-label', text:'비밀번호', attrs:{ for:'v13-account-password' } });
      const password=node('input',{
        id:'v13-account-password',
        className:'input filled v13-input',
        attrs:{ type:'password', autocomplete:'current-password', placeholder:'8자 이상 입력' }
      });
      passwordField.append(passwordLabel,password);
      sheet.append(emailField,passwordField);

      const actions=node('div',{ className:'v13-login-actions' });
      const login=node('button',{ className:'btn primary', text:'로그인', type:'button' });
      const register=node('button',{ className:'btn secondary', text:'계정 만들기', type:'button' });

      async function run(mode){
        const emailValue=email.value.trim();
        const passwordValue=password.value;
        setBusy(login,true,mode==='login'?'로그인 중':'처리 중');
        register.disabled=true;
        register.setAttribute('aria-busy','true');
        try{
          const result=mode==='register'
            ? await account.register(emailValue,passwordValue)
            : await account.login(emailValue,passwordValue);
          if(result){
            password.value='';
            try{ await account.listBookings(); }catch(error){}
            close('modal-v13-account');
            show(mode==='register'?'계정을 만들고 로그인했습니다':'로그인했습니다');
            renderAccountCard();
            renderBookingsModal();
          }else{
            show(state().error||'계정 요청을 처리하지 못했습니다');
          }
        }finally{
          setBusy(login,false);
          register.disabled=false;
          register.removeAttribute('aria-busy');
        }
      }

      login.addEventListener('click',()=>run('login'));
      register.addEventListener('click',()=>run('register'));
      password.addEventListener('keydown',(event)=>{ if(event.key==='Enter') run('login'); });
      actions.append(login,register);
      sheet.appendChild(actions);
      sheet.appendChild(node('div',{
        className:'v13-security-note',
        text:'계정 세션은 브라우저 저장소가 아닌 보안 쿠키로 유지됩니다.'
      }));
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
        card=node('div',{ id:'v13-account-card', className:'sec v13-account-card' });
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

      const top=node('div',{ className:'v13-account-top' });
      top.appendChild(node('div',{ className:'v13-account-mark', text:s.authenticated?'✓':'M', attrs:{ 'aria-hidden':'true' } }));
      const copy=node('div',{ className:'v13-account-copy' });
      copy.appendChild(node('div',{ className:'v13-account-title', text:'계정으로 예약 이어보기' }));
      copy.appendChild(node('div',{
        className:'v13-account-desc',
        text:s.authenticated
          ? `이 계정에 연결된 예약 ${s.bookings?.length||0}건을 다른 기기에서도 이어볼 수 있어요.`
          : '로그인하면 다른 기기에서도 내 예약을 계정으로 불러올 수 있어요.'
      }));
      if(s.authenticated && s.account?.email){
        copy.appendChild(node('div',{ className:'v13-account-email', text:s.account.email, attrs:{ title:s.account.email } }));
      }
      top.appendChild(copy);
      card.appendChild(top);

      const row=node('div',{ className:`v13-account-actions${s.authenticated?'':' single'}` });
      if(s.authenticated){
        const list=node('button',{ className:'btn primary', text:'내 예약 보기', type:'button', attrs:{ 'aria-haspopup':'dialog', 'aria-controls':'modal-v13-bookings' } });
        const logout=node('button',{ className:'btn ghost v13-logout', text:'로그아웃', type:'button' });
        list.addEventListener('click',async()=>{
          setBusy(list,true,'불러오는 중');
          try{
            await account.listBookings();
            renderBookingsModal();
            open('modal-v13-bookings',list);
          }finally{
            setBusy(list,false);
          }
        });
        logout.addEventListener('click',async()=>{
          setBusy(logout,true,'로그아웃 중');
          try{
            const ok=await account.logout();
            if(ok) show('로그아웃했습니다');
            renderAccountCard();
            renderBookingsModal();
          }finally{
            if(logout.isConnected) setBusy(logout,false);
          }
        });
        row.append(list,logout);
      }else{
        const login=node('button',{ className:'btn primary', text:'로그인 / 계정 만들기', type:'button', attrs:{ 'aria-haspopup':'dialog', 'aria-controls':'modal-v13-account' } });
        login.addEventListener('click',()=>open('modal-v13-account',login));
        row.appendChild(login);
      }
      card.appendChild(row);

      const claim=currentClaimable();
      if(claim.claimable){
        const callout=node('div',{ className:'v13-claim-callout' });
        callout.appendChild(node('div',{ className:'v13-claim-title', text:'현재 예약을 계정에 연결할 수 있어요' }));
        callout.appendChild(node('div',{
          className:'v13-claim-desc',
          text:'이 기기에 저장된 복구 정보로 현재 예약을 내 예약 목록에 추가합니다.'
        }));
        const claimButton=node('button',{ className:'btn secondary', text:'현재 예약을 내 계정에 연결', type:'button' });
        claimButton.addEventListener('click',async()=>{
          setBusy(claimButton,true,'연결 중');
          try{
            const result=await account.claimCurrentBooking();
            if(result){
              show('현재 예약을 내 계정에 연결했습니다');
              try{ await account.listBookings(); }catch(error){}
              renderAccountCard();
              renderBookingsModal();
            }else{
              show(state().error||'예약을 계정에 연결하지 못했습니다');
            }
          }finally{
            if(claimButton.isConnected) setBusy(claimButton,false);
          }
        });
        callout.appendChild(claimButton);
        card.appendChild(callout);
      }
    }

    function ensureBookingsModal(){
      if(document.getElementById('modal-v13-bookings')) return;
      const overlay=node('div',{
        id:'modal-v13-bookings',
        className:'overlay v13-modal',
        attrs:{ 'aria-hidden':'true' }
      });
      const sheet=node('div',{
        className:'modal-sheet v13-modal-sheet v13-bookings-sheet',
        attrs:{ role:'dialog', 'aria-modal':'true', 'aria-labelledby':'v13-bookings-title', tabindex:'-1' }
      });
      overlay.addEventListener('click',(event)=>{ if(event.target===overlay) close('modal-v13-bookings'); });
      sheet.appendChild(node('div',{ className:'modal-handle', attrs:{ 'aria-hidden':'true' } }));

      const head=node('div',{ className:'v13-bookings-head' });
      const headCopy=node('div',{ className:'v13-bookings-head-copy' });
      headCopy.appendChild(node('div',{ className:'v13-modal-eyebrow', text:'My bookings' }));
      headCopy.appendChild(node('div',{ id:'v13-bookings-title', className:'v13-modal-title', text:'내 예약' }));
      const tools=node('div',{ className:'v13-bookings-tools' });
      const refresh=node('button',{ className:'v13-refresh-btn', text:'새로고침', type:'button' });
      refresh.addEventListener('click',async()=>{
        setBusy(refresh,true,'갱신 중');
        try{ await account.listBookings(); renderBookingsModal(); }
        finally{ if(refresh.isConnected) setBusy(refresh,false); }
      });
      const closeButton=node('button',{ className:'v13-icon-btn', text:'×', type:'button', attrs:{ 'aria-label':'내 예약 창 닫기' } });
      closeButton.addEventListener('click',()=>close('modal-v13-bookings'));
      tools.append(refresh,closeButton);
      head.append(headCopy,tools);
      sheet.appendChild(head);

      const list=node('div',{ id:'v13-booking-list', className:'v13-booking-list', attrs:{ 'aria-live':'polite' } });
      sheet.appendChild(list);
      overlay.appendChild(sheet);
      (document.getElementById('phone')||document.body).appendChild(overlay);
    }

    function bookingLabel(booking){
      const hospital=String(booking?.hospitalName||'병원동행 예약');
      const date=[booking?.date,booking?.time].filter(Boolean).join(' ');
      return { hospital, date };
    }

    function appendEmpty(list,title,desc){
      const empty=node('div',{ className:'v13-empty' });
      empty.appendChild(node('div',{ className:'v13-empty-title', text:title }));
      empty.appendChild(node('div',{ className:'v13-empty-desc', text:desc }));
      list.appendChild(empty);
    }

    function renderBookingsModal(){
      const list=document.getElementById('v13-booking-list');
      if(!list) return;
      list.replaceChildren();
      const s=state();
      if(!s.authenticated){
        appendEmpty(list,'로그인이 필요합니다','계정으로 로그인하면 연결된 예약을 여기에서 확인할 수 있어요.');
        return;
      }
      if(!s.bookings?.length){
        appendEmpty(list,'연결된 예약이 아직 없어요','현재 기기의 예약을 계정에 연결하면 다른 기기에서도 이어볼 수 있어요.');
        return;
      }

      s.bookings.forEach((booking)=>{
        const labels=bookingLabel(booking);
        const card=node('article',{ className:'v13-booking-card' });
        const head=node('div',{ className:'v13-booking-card-head' });
        head.appendChild(node('div',{ className:'v13-booking-hospital', text:labels.hospital, attrs:{ title:labels.hospital } }));
        if(booking?.phase){ head.appendChild(node('span',{ className:'v13-phase', text:String(booking.phase) })); }
        card.appendChild(head);

        const meta=node('div',{ className:'v13-booking-meta' });
        [labels.date,booking?.targetName].filter(Boolean).forEach((value)=>{
          meta.appendChild(node('span',{ text:String(value) }));
        });
        if(meta.childNodes.length) card.appendChild(meta);

        const bookingId=String(booking?.bookingId||'');
        if(bookingId){
          card.appendChild(node('div',{ className:'v13-booking-id', text:bookingId, attrs:{ title:bookingId } }));
        }

        const actions=node('div',{ className:'v13-booking-actions' });
        const openButton=node('button',{ className:'btn v13-open-booking', text:'열기', type:'button' });
        const shareButton=node('button',{ className:'btn secondary', text:'1시간 공유', type:'button' });
        const revokeButton=node('button',{ className:'btn v13-revoke-share', text:'공유 폐기', type:'button' });

        openButton.addEventListener('click',async()=>{
          setBusy(openButton,true,'여는 중');
          try{
            const opened=await account.openBooking(booking.bookingId);
            if(opened){ close('modal-v13-bookings'); show('내 예약을 불러왔습니다'); }
            else show(state().error||'예약을 불러오지 못했습니다');
          }finally{
            if(openButton.isConnected) setBusy(openButton,false);
          }
        });
        shareButton.addEventListener('click',async()=>{
          setBusy(shareButton,true,'만드는 중');
          try{
            const result=await account.copyShareLink(booking.bookingId,60);
            if(result?.link) show('1시간 공유 링크를 복사했습니다');
            else show(state().error||'공유 링크를 만들지 못했습니다');
          }finally{ if(shareButton.isConnected) setBusy(shareButton,false); }
        });
        revokeButton.addEventListener('click',async()=>{
          setBusy(revokeButton,true,'폐기 중');
          try{
            const result=await account.revokeShare(booking.bookingId);
            if(result) show('공유 링크를 폐기했습니다');
            else show(state().error||'공유 링크를 폐기하지 못했습니다');
          }finally{ if(revokeButton.isConnected) setBusy(revokeButton,false); }
        });
        actions.append(openButton,shareButton,revokeButton);
        card.appendChild(actions);
        list.appendChild(card);
      });
    }

    ensureStyles();
    ensureLandingEntry();
    ensureAccountModal();
    ensureBookingsModal();
    renderAccountCard();
    renderBookingsModal();

    try{
      window.addEventListener('mosigo:account',()=>{
        renderAccountCard();
        renderBookingsModal();
      });
      window.addEventListener('mosigo:booking-sync',()=>renderAccountCard());
      document.addEventListener('keydown',(event)=>{
        if(event.key!=='Escape') return;
        const shown=document.querySelector('.v13-modal.show');
        if(shown?.id) close(shown.id);
      });
    }catch(error){}

    globalThis.MosigoV13AccountOwnershipUi={
      openAccount:()=>open('modal-v13-account'),
      openBookings:async()=>{
        await account.listBookings();
        renderBookingsModal();
        open('modal-v13-bookings');
      },
      refresh:()=>{ renderAccountCard(); renderBookingsModal(); }
    };
  }

  initV13AccountOwnershipUi();
})();
