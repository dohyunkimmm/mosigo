// ── 실제 큰글 모드 ──
const MOSIGO_LARGE_TEXT_KEY='mosigo-large-text';
function getLargeTextState(){
  try{return localStorage.getItem(MOSIGO_LARGE_TEXT_KEY)==='1';}catch(e){return false;}
}
function setLargeTextState(enabled, announce=true){
  try{localStorage.setItem(MOSIGO_LARGE_TEXT_KEY,enabled?'1':'0');}catch(e){}
  const phone=document.getElementById('phone');
  if(phone) phone.classList.toggle('mosigo-large-text',enabled);
  document.querySelectorAll('.big-toggle').forEach(el=>{
    el.classList.toggle('mosigo-large-on',enabled);
    el.setAttribute('aria-pressed',enabled?'true':'false');
  });
  const menu=document.getElementById('mp-large-text');
  if(menu) menu.textContent=enabled?'큰글 모드 끄기':'큰글 모드 켜기';
  if(announce && typeof showToast==='function') showToast(enabled?'큰글 모드를 켰어요':'큰글 모드를 껐어요');
}
function toggleLargeText(){ const phone=document.getElementById('phone'); const current=!!(phone&&phone.classList.contains('mosigo-large-text')); setLargeTextState(!current,true); }
setLargeTextState(getLargeTextState(),false);

// ── 3차 고도화: 5단계 가이드 데모 · 데이터 출처 · 접근성 보정 ──
let demoGuideReturnFocus=null;
let demoCompleteReturnFocus=null;
let guidedDemoActive=false;
let guidedDemoIndex=0;
const GUIDED_DEMO_STEPS=[
  {kind:'hospital', title:'병원 찾기', sub:'진료과 탐색 → 병원 선택까지 한 흐름'},
  {kind:'manager', title:'매니저 매칭', sub:'선택 병원 기준 동행 가능 매니저 탐색'},
  {kind:'booking', title:'예약 현황', sub:'확정 일정·예약번호·전달사항 확인'},
  {kind:'live', title:'동행 진행', sub:'실시간 위치와 단계별 동행 상태 확인'},
  {kind:'report', title:'건강 리포트', sub:'진료 기록과 건강 정보를 한 번에 확인'},
];

function openDemoGuide(){
  demoGuideReturnFocus=document.activeElement;
  const modal=document.getElementById('modal-demo-guide');
  if(!modal) return;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden','false');
  const sheet=modal.querySelector('.demo-guide-sheet');
  if(sheet) sheet.scrollTop=0;
  setTimeout(()=>{
    if(sheet) sheet.scrollTop=0;
    const target=modal.querySelector('.demo-guide-start');
    if(target){ try{ target.focus({preventScroll:true}); }catch(e){ target.focus(); } }
  },30);
}
function closeDemoGuide(restoreFocus=true){
  const modal=document.getElementById('modal-demo-guide');
  if(modal){ modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); }
  if(restoreFocus && demoGuideReturnFocus && typeof demoGuideReturnFocus.focus==='function') setTimeout(()=>{ try{ demoGuideReturnFocus.focus({preventScroll:true}); }catch(e){ demoGuideReturnFocus.focus(); } },0);
}
function openDemoComplete(){
  demoCompleteReturnFocus=document.activeElement;
  const modal=document.getElementById('modal-demo-complete');
  if(!modal) return;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden','false');
  const sheet=modal.querySelector('.demo-complete-sheet');
  if(sheet) sheet.scrollTop=0;
  setTimeout(()=>{
    if(sheet) sheet.scrollTop=0;
    const target=modal.querySelector('.demo-complete-btn.primary');
    if(target){ try{ target.focus({preventScroll:true}); }catch(e){ target.focus(); } }
  },30);
}
function closeDemoComplete(restoreFocus=true){
  const modal=document.getElementById('modal-demo-complete');
  if(modal){ modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); }
  if(restoreFocus && demoCompleteReturnFocus && typeof demoCompleteReturnFocus.focus==='function') setTimeout(()=>{ try{ demoCompleteReturnFocus.focus({preventScroll:true}); }catch(e){ demoCompleteReturnFocus.focus(); } },0);
}
function restartGuidedDemo(){
  closeDemoComplete(false);
  goGuidedDemoStep(0);
}
function returnDemoToStart(){
  closeDemoComplete(false);
  resetDemoState();
}
function renderDemoOrderSnapshot(){
  selectedHospital=FALLBACK_HOSPITALS[0];
  selectedMgr=0;
  hasActiveBooking=true;
  const b=(typeof BOOKINGS!=='undefined' && BOOKINGS[0]) ? BOOKINGS[0] : null;
  const setText=(id,v)=>{ const el=document.getElementById(id); if(el && v!=null) el.textContent=v; };
  const thumb=document.getElementById('order-mgr-thumb');
  if(thumb) thumb.innerHTML='<img src="'+MGRS[0].photo+'" alt="'+esc(MGRS[0].nm)+' 매니저">';
  setText('order-mgr',MGRS[0].nm+' 매니저 · ★'+MGRS[0].rating);
  setText('order-sub','똑똑연세내과의원 · 8월 13일 오전 10:00');
  setText('order-no',b?.no||'M26H13-KTQAS');
  setText('order-addr','화성 향남읍 자택');
  setText('order-note','기본 병력 및 약물 리스트 전달');
  setText('order-status-title','예약이 확정됐어요');
  setText('order-status-sub','8월 13일 오전 10:00 · 차량 동행');
  const cancel=document.getElementById('order-cancel-btn'); if(cancel) cancel.style.display='none';
  updateHomeState();
}
async function demoJump(kind,{fromTour=false}={}){
  closeDemoGuide(false);
  if(kind==='hospital'){
    lastHospitalDataSource='demo';
    const list=searchHospitalsFallback({qd:'D001',numOfRows:6});
    openHospMap(list,'내과','D001');
    if(!fromTour) showToast('병원 찾기 핵심 화면입니다');
    return;
  }
  if(kind==='manager'){
    lastHospitalDataSource='demo';
    enterMgrSearch(FALLBACK_HOSPITALS[0]);
    if(!fromTour) showToast('병원 기준 매니저 매칭 화면입니다');
    return;
  }
  if(kind==='booking'){
    renderDemoOrderSnapshot();
    tabTo('s-order');
    if(!fromTour) showToast('확정된 예약 현황 예시입니다');
    return;
  }
  if(kind==='live'){
    renderDemoOrderSnapshot();
    updateLiveState();
    tabTo('s-live');
    if(!fromTour) showToast('실시간 동행 진행 화면입니다');
    return;
  }
  if(kind==='report'){
    tabTo('s-report');
    pickHealthTab(0);
    if(!fromTour) showToast('건강 리포트 핵심 화면입니다');
  }
}
function updateGuidedDemoBar(){
  const bar=document.getElementById('demo-tour-bar');
  if(!bar) return;
  const step=GUIDED_DEMO_STEPS[guidedDemoIndex];
  bar.classList.toggle('show',guidedDemoActive);
  if(!guidedDemoActive) return;
  const progressEl=document.getElementById('demo-tour-progress');
  if(progressEl){ progressEl.textContent=(guidedDemoIndex+1)+'/'+GUIDED_DEMO_STEPS.length; progressEl.setAttribute('aria-label','데모 '+(guidedDemoIndex+1)+'단계 / 총 '+GUIDED_DEMO_STEPS.length+'단계'); }
  document.getElementById('demo-tour-title').textContent=step.title;
  document.getElementById('demo-tour-sub').textContent=step.sub;
  const prev=document.getElementById('demo-tour-prev');
  const next=document.getElementById('demo-tour-next');
  if(prev) prev.style.visibility=guidedDemoIndex===0?'hidden':'visible';
  if(next) next.textContent=guidedDemoIndex===GUIDED_DEMO_STEPS.length-1?'완료':'다음';
}
async function goGuidedDemoStep(index){
  guidedDemoIndex=Math.max(0,Math.min(GUIDED_DEMO_STEPS.length-1,index));
  guidedDemoActive=true;
  updateGuidedDemoBar();
  await demoJump(GUIDED_DEMO_STEPS[guidedDemoIndex].kind,{fromTour:true});
  updateGuidedDemoBar();
}
function startGuidedDemo(){
  closeDemoGuide(false);
  goGuidedDemoStep(0);
}
function guidedDemoPrev(){ if(guidedDemoIndex>0) goGuidedDemoStep(guidedDemoIndex-1); }
function guidedDemoNext(){
  if(guidedDemoIndex>=GUIDED_DEMO_STEPS.length-1){
    stopGuidedDemo(false);
    openDemoComplete();
    return;
  }
  goGuidedDemoStep(guidedDemoIndex+1);
}
function stopGuidedDemo(announce=true){
  guidedDemoActive=false;
  updateGuidedDemoBar();
  if(announce) showToast('핵심 데모를 종료했어요');
}
function resetDemoState(){
  closeDemoComplete(false);
  guidedDemoActive=false; guidedDemoIndex=0;
  hasActiveBooking=false; hasCheckupSync=false; activeIncidentReport=null;
  lastHospitalDataSource='unknown';
  updateGuidedDemoBar();
  updateHomeState(); updateLiveState();
  closeDemoGuide(false);
  tabTo('s-onboard');
  showToast('데모 상태를 초기화했어요');
}

function enhanceNonNativeButtons(root=document){
  const selector='.metric[onclick],.history-item[onclick],.mgr-card[onclick],.filter-pill[onclick],.chip[onclick],.agree-item[onclick],.si-row[onclick],.si-rk[onclick],.cat[onclick],.mp-ic[onclick],.sub-banner[onclick],.hosp-card[onclick],.hd-rev-sum[onclick],.dept-btn[onclick]';
  root.querySelectorAll?.(selector).forEach(el=>{
    if(!el.hasAttribute('role')) el.setAttribute('role','button');
    if(!el.hasAttribute('tabindex')) el.tabIndex=0;
    if(el.dataset.kbReady==='1') return;
    el.dataset.kbReady='1';
    el.addEventListener('keydown',e=>{
      if(e.key==='Enter' || e.key===' '){ e.preventDefault(); el.click(); }
    });
  });
}
function syncScreenA11y(activeId=stack[stack.length-1]){
  document.querySelectorAll('.screen').forEach(screen=>screen.setAttribute('aria-hidden',screen.id===activeId?'false':'true'));
}
function syncMainNavA11y(activeId=stack[stack.length-1]){
  syncScreenA11y(activeId);
  const targetLabel={'s-home':'홈','s-history':'예약내역','s-live':'동행','s-report':'리포트','s-settings':'설정'}[activeId]||'';
  document.querySelectorAll('.tab-bar').forEach(bar=>{
    bar.setAttribute('role','navigation');
    bar.setAttribute('aria-label','주요 메뉴');
    bar.querySelectorAll('.tab-item').forEach(btn=>{
      const isCurrent=!!targetLabel && btn.textContent.trim().includes(targetLabel);
      if(isCurrent) btn.setAttribute('aria-current','page'); else btn.removeAttribute('aria-current');
    });
  });
}

const _mosigoGoTo=goTo;
goTo=function(id){ _mosigoGoTo(id); syncMainNavA11y(id); setTimeout(()=>enhanceNonNativeButtons(document.getElementById(id)||document),0); };
const _mosigoTabTo=tabTo;
tabTo=function(id){ _mosigoTabTo(id); syncMainNavA11y(id); setTimeout(()=>enhanceNonNativeButtons(document.getElementById(id)||document),0); };

document.addEventListener('keydown',e=>{
  const guide=document.getElementById('modal-demo-guide');
  const complete=document.getElementById('modal-demo-complete');
  const modal=[complete,guide].find(el=>el?.classList.contains('show'));
  if(!modal) return;
  if(e.key==='Escape'){
    e.preventDefault();
    if(modal===complete) closeDemoComplete(); else closeDemoGuide();
    return;
  }
  if(e.key==='Tab'){
    const focusable=[...modal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
    if(!focusable.length) return;
    const first=focusable[0], last=focusable[focusable.length-1];
    if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  }
});
const mosigoA11yObserver=new MutationObserver(muts=>muts.forEach(m=>m.addedNodes.forEach(n=>{ if(n.nodeType===1) enhanceNonNativeButtons(n); })));
mosigoA11yObserver.observe(document.getElementById('screens'),{childList:true,subtree:true});
enhanceNonNativeButtons();
syncMainNavA11y();
syncHealthCounts();

window.addEventListener('offline',()=>showToast('네트워크 연결이 끊겼어요. 병원 검색은 예시 데이터로 전환될 수 있어요.'));
window.addEventListener('online',()=>showToast('네트워크 연결이 복구됐어요.'));
