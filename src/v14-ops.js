// v14 Operational SaaS workspace — uses the existing v13 account, booking ownership, and v12 secure-sharing contracts.
(function bootMosigoV14Operations(){
  if(typeof document==='undefined' || globalThis.MosigoV14Operations) return;

  const state={
    authenticated:false,
    account:null,
    bookings:[],
    sessionExpiresAt:'',
    shares:new Map(),
    activeView:'overview',
    filter:'all',
    query:'',
    busy:false,
    lastSync:0
  };
  const $=(id)=>document.getElementById(id);
  const q=(selector,root=document)=>root.querySelector(selector);
  const qa=(selector,root=document)=>[...root.querySelectorAll(selector)];
  let toastTimer=null;
  let drawerReturnFocus=null;

  function showToast(message){
    const toast=$('ops-toast');
    if(!toast) return;
    toast.textContent=String(message||'');
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>toast.classList.remove('show'),2200);
  }

  async function requestJson(path,options={}){
    const response=await fetch(path,{ credentials:'same-origin', ...options });
    const data=await response.json().catch(()=>null);
    if(!response.ok || !data?.success){
      const error=new Error(data?.message||data?.error||('HTTP '+response.status));
      error.status=response.status;
      error.code=data?.error||'';
      throw error;
    }
    return data;
  }

  function text(value,fallback='-'){
    const normalized=String(value??'').trim();
    return normalized||fallback;
  }

  function bookingId(booking){ return text(booking?.bookingId,''); }
  function bookingHospital(booking){ return text(booking?.hospitalName||booking?.hospital||booking?.clinicName,'병원동행 예약'); }
  function bookingPhase(booking){ return text(booking?.phase||booking?.status||booking?.bookingStatus,'예약'); }
  function bookingDateText(booking){ return [booking?.date,booking?.time].filter(Boolean).join(' ').trim()||'일정 미정'; }

  function parseBookingDate(booking){
    const raw=String(booking?.date||'').trim();
    if(!raw) return null;
    const iso=raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if(iso){
      const date=new Date(Number(iso[1]),Number(iso[2])-1,Number(iso[3]));
      return Number.isNaN(date.getTime())?null:date;
    }
    const kr=raw.match(/(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일/);
    if(kr){
      const now=new Date();
      const date=new Date(Number(kr[1]||now.getFullYear()),Number(kr[2])-1,Number(kr[3]));
      return Number.isNaN(date.getTime())?null:date;
    }
    const date=new Date(raw);
    return Number.isNaN(date.getTime())?null:date;
  }

  function dayKey(date){
    if(!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  }

  function scheduleKind(booking){
    const date=parseBookingDate(booking);
    if(!date) return 'unknown';
    const today=new Date();
    today.setHours(0,0,0,0);
    const target=new Date(date); target.setHours(0,0,0,0);
    if(target.getTime()===today.getTime()) return 'today';
    return target>today?'upcoming':'past';
  }

  function formatSessionExpiry(value){
    if(!value) return '-';
    const time=Date.parse(String(value));
    if(!Number.isFinite(time)) return text(value);
    try{return new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(time));}
    catch(error){return new Date(time).toLocaleString();}
  }

  function setBusy(button,busy,label='처리 중'){
    if(!button) return;
    if(busy){
      button.dataset.idle=button.textContent||'';
      button.textContent=label;
      button.disabled=true;
      button.setAttribute('aria-busy','true');
    }else{
      button.textContent=button.dataset.idle||button.textContent||'';
      delete button.dataset.idle;
      button.disabled=false;
      button.removeAttribute('aria-busy');
    }
  }

  async function loadAccount({announce=false}={}){
    const refresh=$('ops-refresh');
    setBusy(refresh,true,'…');
    try{
      const data=await requestJson('/api/account');
      state.authenticated=Boolean(data.authenticated&&data.account);
      state.account=state.authenticated?data.account:null;
      state.sessionExpiresAt=data.sessionExpiresAt||'';
      state.bookings=[];
      state.shares.clear();
      if(state.authenticated){
        const owned=await requestJson('/api/account?resource=bookings');
        state.bookings=Array.isArray(owned.bookings)?owned.bookings:[];
        if(owned.account) state.account=owned.account;
        await loadShareStates();
      }
      state.lastSync=Date.now();
      render();
      if(announce) showToast('최신 상태로 동기화했습니다');
      return true;
    }catch(error){
      if(error?.status===401){
        state.authenticated=false; state.account=null; state.bookings=[]; state.shares.clear(); render();
        return false;
      }
      showToast(error?.message||'데이터를 불러오지 못했습니다');
      render();
      return false;
    }finally{
      setBusy(refresh,false);
    }
  }

  async function loadShareStates(){
    const owned=[...state.bookings];
    await Promise.all(owned.map(async(booking)=>{
      const id=bookingId(booking);
      if(!id) return;
      try{
        const data=await requestJson('/api/booking-shares?bookingId='+encodeURIComponent(id));
        state.shares.set(id,data.share||null);
      }catch(error){
        state.shares.set(id,null);
      }
    }));
  }

  async function auth(mode){
    const email=$('ops-email')?.value.trim()||'';
    const password=$('ops-password')?.value||'';
    const primary=$('ops-login');
    const secondary=$('ops-register');
    setBusy(primary,true,mode==='register'?'계정 생성 중':'로그인 중');
    if(secondary){ secondary.disabled=true; secondary.setAttribute('aria-busy','true'); }
    try{
      await requestJson('/api/account',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:mode,email,password})
      });
      if($('ops-password')) $('ops-password').value='';
      await loadAccount();
      showToast(mode==='register'?'계정을 만들고 로그인했습니다':'로그인했습니다');
    }catch(error){
      showToast(error?.message||'계정 요청을 처리하지 못했습니다');
    }finally{
      setBusy(primary,false);
      if(secondary){ secondary.disabled=false; secondary.removeAttribute('aria-busy'); }
    }
  }

  async function logout(){
    const button=$('ops-logout');
    setBusy(button,true,'로그아웃 중');
    try{
      await requestJson('/api/account',{method:'DELETE'});
      state.authenticated=false; state.account=null; state.bookings=[]; state.shares.clear(); state.sessionExpiresAt='';
      closeDrawer(false);
      setView('overview');
      render();
      showToast('Operations에서 로그아웃했습니다');
    }catch(error){
      showToast(error?.message||'로그아웃하지 못했습니다');
    }finally{
      if(button?.isConnected) setBusy(button,false);
    }
  }

  function setView(view){
    const next=['overview','bookings','security'].includes(view)?view:'overview';
    state.activeView=next;
    qa('[data-view-panel]').forEach(panel=>{
      const active=panel.dataset.viewPanel===next;
      panel.hidden=!active;
      panel.classList.toggle('is-active',active);
    });
    qa('[data-view]').forEach(button=>{
      const active=button.dataset.view===next;
      button.classList.toggle('is-active',active);
      if(active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
    const copy={
      overview:['운영 개요','내 계정 소유 예약의 상태와 다음 액션을 한 화면에서 확인합니다.'],
      bookings:['예약 운영','검색·일정 필터·공유 상태를 기준으로 소유 예약을 관리합니다.'],
      security:['계정 · 보안','세션과 공유 권한 모델을 확인하고 계정 접근을 제어합니다.']
    }[next];
    if($('ops-page-title')) $('ops-page-title').textContent=copy[0];
    if($('ops-page-subtitle')) $('ops-page-subtitle').textContent=copy[1];
  }

  function filteredBookings(){
    const query=state.query.toLowerCase();
    return state.bookings.filter(booking=>{
      const kind=scheduleKind(booking);
      const matchesFilter=state.filter==='all'||kind===state.filter;
      const haystack=[bookingHospital(booking),bookingId(booking),bookingPhase(booking)].join(' ').toLowerCase();
      return matchesFilter && (!query||haystack.includes(query));
    }).sort((a,b)=>{
      const ad=parseBookingDate(a)?.getTime()||Number.MAX_SAFE_INTEGER;
      const bd=parseBookingDate(b)?.getTime()||Number.MAX_SAFE_INTEGER;
      return ad-bd;
    });
  }

  function shareIsActive(id){ return Boolean(state.shares.get(id)?.active); }

  function metricCounts(){
    return state.bookings.reduce((acc,booking)=>{
      const kind=scheduleKind(booking);
      if(kind==='upcoming') acc.upcoming++;
      if(kind==='today') acc.today++;
      if(shareIsActive(bookingId(booking))) acc.shares++;
      return acc;
    },{upcoming:0,today:0,shares:0});
  }

  function renderOverview(){
    const counts=metricCounts();
    if($('metric-total')) $('metric-total').textContent=String(state.bookings.length);
    if($('metric-upcoming')) $('metric-upcoming').textContent=String(counts.upcoming);
    if($('metric-shares')) $('metric-shares').textContent=String(counts.shares);
    if($('metric-today')) $('metric-today').textContent=String(counts.today);
    if($('health-session')) $('health-session').textContent=state.authenticated?'활성':'로그인 필요';
    if($('health-bookings')) $('health-bookings').textContent=state.authenticated?`${state.bookings.length}건 확인`:'대기';
    if($('health-sharing')) $('health-sharing').textContent=state.authenticated?'서버 확인 완료':'대기';

    const list=$('ops-action-list');
    if(!list) return;
    list.replaceChildren();
    const candidates=[...state.bookings].sort((a,b)=>{
      const rank={today:0,upcoming:1,unknown:2,past:3};
      const ak=scheduleKind(a),bk=scheduleKind(b);
      if(rank[ak]!==rank[bk]) return rank[ak]-rank[bk];
      return (parseBookingDate(a)?.getTime()||0)-(parseBookingDate(b)?.getTime()||0);
    }).slice(0,4);
    if(!candidates.length){
      const empty=document.createElement('div'); empty.className='ops-empty'; empty.innerHTML='<span aria-hidden="true">◇</span><b>계정에 연결된 예약이 없습니다.</b><p>사용자 앱에서 예약을 만들거나 기존 예약을 계정에 연결하면 여기에 표시됩니다.</p>'; list.appendChild(empty); return;
    }
    candidates.forEach((booking,index)=>{
      const row=document.createElement('div'); row.className='ops-action-row';
      const id=bookingId(booking); const kind=scheduleKind(booking);
      row.innerHTML=`<div class="ops-action-mark" aria-hidden="true">${kind==='today'?'!':index+1}</div><div class="ops-action-copy"><b>${escapeHtml(bookingHospital(booking))}</b><small>${escapeHtml(bookingDateText(booking))} · ${escapeHtml(bookingPhase(booking))}</small></div><button class="ops-row-action" type="button">상세</button>`;
      q('button',row).addEventListener('click',(event)=>openDrawer(id,event.currentTarget));
      list.appendChild(row);
    });
  }

  function renderBookings(){
    const bookings=filteredBookings();
    if($('ops-result-count')) $('ops-result-count').textContent=`${bookings.length}건`;
    if($('ops-last-sync')) $('ops-last-sync').textContent=state.lastSync?`최근 동기화 ${new Date(state.lastSync).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`:'동기화 전';
    const tbody=$('ops-booking-body'); const cards=$('ops-booking-cards'); const empty=$('ops-booking-empty');
    tbody?.replaceChildren(); cards?.replaceChildren();
    if(empty) empty.hidden=bookings.length>0;
    bookings.forEach(booking=>{
      const id=bookingId(booking); const kind=scheduleKind(booking); const active=shareIsActive(id);
      const row=document.createElement('tr');
      row.innerHTML=`<td><div class="ops-booking-name"><b>${escapeHtml(bookingHospital(booking))}</b><small>${escapeHtml(id)}</small></div></td><td><span class="ops-date-main">${escapeHtml(bookingDateText(booking))}</span><span class="ops-date-sub">${escapeHtml(kindLabel(kind))}</span></td><td><span class="ops-status ${kind}">${escapeHtml(bookingPhase(booking))}</span></td><td><span class="ops-share-state ${active?'active':''}">${active?'활성':'없음'}</span></td><td><div class="ops-table-actions"><button class="ops-table-action" type="button" data-action="detail">상세</button><button class="ops-table-action primary" type="button" data-action="share">${active?'공유 관리':'공유'}</button></div></td>`;
      q('[data-action="detail"]',row).addEventListener('click',(event)=>openDrawer(id,event.currentTarget));
      q('[data-action="share"]',row).addEventListener('click',(event)=>openDrawer(id,event.currentTarget,true));
      tbody?.appendChild(row);

      const card=document.createElement('article'); card.className='ops-booking-mobile';
      card.innerHTML=`<div class="ops-mobile-head"><div><b>${escapeHtml(bookingHospital(booking))}</b><div class="ops-mobile-meta">${escapeHtml(bookingDateText(booking))} · ${escapeHtml(id)}</div></div><span class="ops-status ${kind}">${escapeHtml(bookingPhase(booking))}</span></div><div class="ops-mobile-actions"><button class="ops-table-action" type="button" data-action="detail">상세</button><button class="ops-table-action primary" type="button" data-action="share">${active?'공유 관리':'공유'}</button></div>`;
      q('[data-action="detail"]',card).addEventListener('click',(event)=>openDrawer(id,event.currentTarget));
      q('[data-action="share"]',card).addEventListener('click',(event)=>openDrawer(id,event.currentTarget,true));
      cards?.appendChild(card);
    });
  }

  function renderSecurity(){
    if($('security-email')) $('security-email').textContent=text(state.account?.email);
    if($('security-expiry')) $('security-expiry').textContent=formatSessionExpiry(state.sessionExpiresAt);
    if($('security-count')) $('security-count').textContent=`${state.bookings.length}건`;
  }

  function render(){
    const gate=$('ops-auth-gate'); const workspace=$('ops-workspace');
    if(gate) gate.hidden=state.authenticated;
    if(workspace) workspace.hidden=!state.authenticated;
    if($('ops-account-name')) $('ops-account-name').textContent=state.authenticated?text(state.account?.email,'계정'):'로그인 필요';
    if($('ops-account-meta')) $('ops-account-meta').textContent=state.authenticated?'Account owner':'Operations';
    if($('nav-booking-count')) $('nav-booking-count').textContent=String(state.bookings.length);
    renderOverview(); renderBookings(); renderSecurity(); setView(state.activeView);
  }

  function kindLabel(kind){ return ({today:'오늘 일정',upcoming:'예정',past:'지난 예약',unknown:'일정 미정'})[kind]||'일정'; }
  function escapeHtml(value){ return String(value??'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }

  async function fetchBooking(id){
    const data=await requestJson('/api/bookings?bookingId='+encodeURIComponent(id));
    return data.booking||null;
  }

  async function issueShare(id){
    const data=await requestJson('/api/booking-shares',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId:id,ttlMinutes:60})
    });
    const token=String(data.shareToken||'').trim();
    if(!token) throw new Error('공유 토큰을 받지 못했습니다.');
    const link=location.origin+'/'+('#mosigo-share='+encodeURIComponent(id+'.'+token));
    let copied=false;
    try{ await navigator.clipboard.writeText(link); copied=true; }catch(error){}
    if(!copied){
      try{
        await requestJson('/api/booking-shares',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId:id})});
      }catch(error){}
      throw new Error('링크를 복사하지 못해 새 공유 링크를 폐기했습니다.');
    }
    state.shares.set(id,data.share||{active:true});
    render();
    return data;
  }

  async function revokeShare(id){
    const data=await requestJson('/api/booking-shares',{
      method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId:id})
    });
    state.shares.set(id,data.share||{active:false});
    render();
    return data;
  }

  async function openDrawer(id,trigger,focusShare=false){
    if(!id) return;
    drawerReturnFocus=trigger||document.activeElement;
    const drawer=$('ops-drawer'); const backdrop=$('ops-drawer-backdrop'); const body=$('ops-drawer-body');
    if(!drawer||!backdrop||!body) return;
    backdrop.hidden=false; drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden','false');
    body.innerHTML='<div class="ops-detail-card"><h3>예약 정보를 불러오는 중입니다…</h3></div>';
    requestAnimationFrame(()=>$('ops-drawer-close')?.focus?.({preventScroll:true}));
    try{
      const booking=await fetchBooking(id);
      if(!booking) throw new Error('예약을 찾지 못했습니다.');
      const active=shareIsActive(id);
      const fields=[
        ['예약번호',id],['병원',bookingHospital(booking)],['일정',bookingDateText(booking)],['상태',bookingPhase(booking)],
        ['환자',booking.patientName||booking.name||'-'],['연락처',booking.phone||booking.patientPhone||'-'],['주소',booking.address||booking.pickupAddress||'-']
      ];
      const card=document.createElement('section'); card.className='ops-detail-card';
      card.innerHTML='<h3>예약 정보</h3>'+fields.map(([label,value])=>`<div class="ops-detail-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(text(value))}</b></div>`).join('');
      const shareCard=document.createElement('section'); shareCard.className='ops-detail-card';
      shareCard.innerHTML=`<h3>Secure sharing</h3><div class="ops-detail-row"><span>현재 상태</span><b>${active?'활성 공유 링크':'활성 링크 없음'}</b></div><div class="ops-detail-actions"><button class="ops-button primary ${active?'':'wide'}" type="button" data-share="issue">${active?'새 링크로 교체':'1시간 공유 링크 복사'}</button>${active?'<button class="ops-button danger" type="button" data-share="revoke">기존 링크 폐기</button>':''}</div>`;
      q('[data-share="issue"]',shareCard)?.addEventListener('click',async(event)=>{
        const button=event.currentTarget; setBusy(button,true,'링크 생성 중');
        try{ await issueShare(id); showToast('1시간 공유 링크를 복사했습니다'); await openDrawer(id,drawerReturnFocus,true); }
        catch(error){ showToast(error?.message||'공유 링크를 만들지 못했습니다'); }
        finally{ if(button.isConnected) setBusy(button,false); }
      });
      q('[data-share="revoke"]',shareCard)?.addEventListener('click',async(event)=>{
        const button=event.currentTarget; setBusy(button,true,'폐기 중');
        try{ await revokeShare(id); showToast('공유 링크를 폐기했습니다'); await openDrawer(id,drawerReturnFocus,true); }
        catch(error){ showToast(error?.message||'공유 링크를 폐기하지 못했습니다'); }
        finally{ if(button.isConnected) setBusy(button,false); }
      });
      body.replaceChildren(card,shareCard);
      if(focusShare) requestAnimationFrame(()=>q('[data-share]',shareCard)?.focus?.({preventScroll:true}));
    }catch(error){
      body.innerHTML=`<div class="ops-detail-card"><h3>예약 정보를 표시하지 못했습니다.</h3><div class="ops-detail-row"><span>오류</span><b>${escapeHtml(error?.message||'Unknown error')}</b></div></div>`;
    }
  }

  function closeDrawer(restore=true){
    const drawer=$('ops-drawer'); const backdrop=$('ops-drawer-backdrop');
    drawer?.classList.remove('is-open'); drawer?.setAttribute('aria-hidden','true');
    if(backdrop) backdrop.hidden=true;
    if(restore&&drawerReturnFocus?.isConnected) requestAnimationFrame(()=>drawerReturnFocus.focus?.({preventScroll:true}));
    drawerReturnFocus=null;
  }

  function bind(){
    qa('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
    qa('[data-view-jump]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.viewJump)));
    $('ops-refresh')?.addEventListener('click',()=>loadAccount({announce:true}));
    $('ops-auth-form')?.addEventListener('submit',(event)=>{ event.preventDefault(); auth('login'); });
    $('ops-register')?.addEventListener('click',()=>auth('register'));
    $('ops-logout')?.addEventListener('click',logout);
    $('ops-booking-search')?.addEventListener('input',(event)=>{ state.query=event.target.value.trim(); renderBookings(); });
    qa('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
      state.filter=button.dataset.filter||'all';
      qa('[data-filter]').forEach(item=>{ const active=item===button; item.classList.toggle('is-active',active); item.setAttribute('aria-pressed',active?'true':'false'); });
      renderBookings();
    }));
    $('ops-drawer-close')?.addEventListener('click',()=>closeDrawer());
    $('ops-drawer-backdrop')?.addEventListener('click',()=>closeDrawer());
    document.addEventListener('keydown',(event)=>{
      const drawer=$('ops-drawer');
      if(event.key==='Escape'&&drawer?.classList.contains('is-open')){ event.preventDefault(); closeDrawer(); }
      if(event.key==='Tab'&&drawer?.classList.contains('is-open')){
        const focusable=qa('button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])',drawer).filter(el=>el.offsetParent!==null);
        if(!focusable.length) return;
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    });
    window.addEventListener('online',()=>showToast('네트워크 연결이 복구됐습니다'));
    window.addEventListener('offline',()=>showToast('네트워크 연결을 확인해주세요'));
  }

  globalThis.MosigoV14Operations={
    refresh:()=>loadAccount({announce:false}),
    getState:()=>({
      authenticated:state.authenticated,
      account:state.account?{...state.account}:null,
      bookings:[...state.bookings],
      activeView:state.activeView,
      filter:state.filter,
      query:state.query
    }),
    setView,
    closeDrawer
  };

  bind();
  render();
  loadAccount();
})();
