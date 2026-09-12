// v4 Functional Prototype — runtime booking lifecycle backed by MosigoBookingState.
(function initV4BookingRuntime(){
  const Booking=globalThis.MosigoBookingState;
  if(!Booking) return;

  const STORAGE_KEY='mosigo-v4-booking';
  let bookingState=Booking.createBookingState();

  function readPersisted(){
    try{return Booking.restoreBookingState(sessionStorage.getItem(STORAGE_KEY));}
    catch(error){return Booking.createBookingState();}
  }

  function persist(){
    try{sessionStorage.setItem(STORAGE_KEY,Booking.serializeBookingState(bookingState));}
    catch(error){}
    globalThis.v4BookingState=bookingState;
  }

  function clearPersisted(){
    bookingState=Booking.createBookingState();
    try{sessionStorage.removeItem(STORAGE_KEY);}catch(error){}
    globalThis.v4BookingState=bookingState;
  }

  function bookingSnapshot(){
    const hospital=selectedHospital||{};
    const manager=selectedMgr>=0 ? MGRS[selectedMgr] : null;
    const target=TARGETS[selectedTargetIdx]||{};
    const mode=TRANSPORT_MODES[selectedModeIdx]||{};
    return {
      bookingId:Booking.createBookingId(),
      hospitalId:hospital.id||'',
      hospitalName:hospital.name||'',
      managerIndex:selectedMgr,
      managerName:manager?.nm||'',
      targetName:target.nm||'',
      date:dsSelectedDate,
      time:dsSelectedTime,
      durationHours:dsSelectedDuration,
      mode:mode.nm||'',
      amount:mode.price||0
    };
  }

  function transition(nextPhase, patch={}){
    try{
      bookingState=Booking.transitionBookingState(bookingState,nextPhase,patch);
      persist();
      syncBookingUi();
      return true;
    }catch(error){
      console.warn('[Mosigo v4 booking]',error.message);
      return false;
    }
  }

  function syncBookingUi(){
    const phase=bookingState.phase;
    const title=document.getElementById('order-status-title');
    const sub=document.getElementById('order-status-sub');
    const cancel=document.getElementById('order-cancel-btn');
    const no=document.getElementById('order-no');
    if(no && bookingState.bookingId) no.textContent=bookingState.bookingId;

    if(phase===Booking.PHASES.REQUESTING){
      if(title) title.textContent='예약을 확인하고 있어요';
      if(sub) sub.textContent='매니저가 일정을 확인 중입니다.';
      if(cancel) cancel.style.display='';
    }else if(phase===Booking.PHASES.CONFIRMED){
      if(title) title.textContent='예약이 확정됐어요!';
      if(sub) sub.textContent=(bookingState.date||'예약일')+' '+(bookingState.time||'')+' · '+(bookingState.mode||'동행');
      if(cancel) cancel.style.display='none';
    }else if(phase===Booking.PHASES.IN_PROGRESS){
      if(title) title.textContent='동행이 진행 중이에요';
      if(sub) sub.textContent='실시간 동행 화면에서 진행 상황을 확인할 수 있어요.';
      if(cancel) cancel.style.display='none';
    }
  }

  function restoreRuntime(){
    bookingState=readPersisted();
    globalThis.v4BookingState=bookingState;
    if(!Booking.isActiveBooking(bookingState)) return;

    const managerIndex=Number.isInteger(bookingState.managerIndex)?bookingState.managerIndex:-1;
    if(managerIndex>=0 && MGRS[managerIndex]){
      selectedMgr=managerIndex;
      pickMgr(managerIndex);
    }

    const candidates=[...(hospitalCache||[]),...(FALLBACK_HOSPITALS||[])];
    const restoredHospital=candidates.find(h=>
      (bookingState.hospitalId && h.id===bookingState.hospitalId) ||
      (bookingState.hospitalName && h.name===bookingState.hospitalName)
    );
    if(restoredHospital) selectedHospital=restoredHospital;

    if(bookingState.date) dsSelectedDate=bookingState.date;
    if(bookingState.time) dsSelectedTime=bookingState.time;
    if(bookingState.durationHours) dsSelectedDuration=bookingState.durationHours;
    const modeIndex=TRANSPORT_MODES.findIndex(m=>m.nm===bookingState.mode);
    if(modeIndex>=0) selectedModeIdx=modeIndex;

    hasActiveBooking=true;
    renderOrder();
    syncBookingUi();
    updateHomeState();
    updateLiveState();
  }

  const originalUpdateSearchMgrList=updateSearchMgrList;
  updateSearchMgrList=function(hospital){
    const visible=originalUpdateSearchMgrList(hospital);
    const next=document.getElementById('search-next-btn');
    if(next){
      next.disabled=visible.length===0;
      next.setAttribute('aria-disabled',visible.length===0?'true':'false');
    }
    return visible;
  };

  const originalStartBooking=startBooking;
  startBooking=function(){
    if(!selectedHospital){ showToast('병원을 먼저 선택해주세요'); return; }
    if(selectedMgr<0 || !MGRS[selectedMgr]){ showToast('동행 가능한 매니저를 먼저 선택해주세요'); return; }
    originalStartBooking();
  };

  const originalDoPay=doPay;
  doPay=function(){
    if(!selectedHospital){ showToast('병원 선택 정보를 확인해주세요'); return; }
    if(selectedMgr<0 || !MGRS[selectedMgr]){ showToast('매니저 선택 정보를 확인해주세요'); return; }

    bookingState=Booking.createBookingState();
    bookingState=Booking.transitionBookingState(bookingState,Booking.PHASES.REQUESTING,bookingSnapshot());
    persist();
    originalDoPay();
    syncBookingUi();

    setTimeout(()=>{
      if(bookingState.phase===Booking.PHASES.REQUESTING) transition(Booking.PHASES.CONFIRMED);
    },1600);
    setTimeout(()=>{
      if(bookingState.phase===Booking.PHASES.CONFIRMED) transition(Booking.PHASES.IN_PROGRESS);
    },3200);
  };

  const originalConfirmBkCancel=confirmBkCancel;
  confirmBkCancel=function(){
    if(bookingState.phase===Booking.PHASES.REQUESTING || bookingState.phase===Booking.PHASES.CONFIRMED){
      transition(Booking.PHASES.CANCELLED);
    }
    originalConfirmBkCancel();
  };

  const originalCompleteReturn=completeReturn;
  completeReturn=function(){
    if(bookingState.phase===Booking.PHASES.CONFIRMED) transition(Booking.PHASES.IN_PROGRESS);
    if(bookingState.phase===Booking.PHASES.IN_PROGRESS) transition(Booking.PHASES.COMPLETED);
    originalCompleteReturn();
  };

  const originalRenderDemoOrderSnapshot=renderDemoOrderSnapshot;
  renderDemoOrderSnapshot=function(){
    originalRenderDemoOrderSnapshot();
    bookingState=Booking.createBookingState();
    bookingState=Booking.transitionBookingState(bookingState,Booking.PHASES.REQUESTING,{
      bookingId:'M4DEMO0001',
      hospitalName:'똑똑연세내과의원',
      managerIndex:0,
      managerName:MGRS[0]?.nm||'김민준',
      targetName:'아버지',
      date:'8월 13일',
      time:'10:00',
      durationHours:2,
      mode:'차량 동행',
      amount:45000
    });
    bookingState=Booking.transitionBookingState(bookingState,Booking.PHASES.CONFIRMED);
    persist();
    syncBookingUi();
  };

  const originalResetDemoState=resetDemoState;
  resetDemoState=function(){
    clearPersisted();
    originalResetDemoState();
  };

  restoreRuntime();

  // v6 extends the stable booking runtime after v4 has restored and published its local state.
  if(!document.querySelector('script[data-mosigo-v6-booking]')){
    const v6=document.createElement('script');
    v6.src='v6-booking.js';
    v6.async=false;
    v6.dataset.mosigoV6Booking='1';
    document.head.appendChild(v6);
  }
})();
