// ── 지도 (Leaflet)
const MAP_HOME = [37.12383, 126.90745];
const MAP_HOSPITAL = [37.12540, 126.90910];
const MAP_MGR_LIVE = [37.12480, 126.90855];
// 동행 경로의 경유지(약국 들르기 등). 비우면 출발지→도착지 직행 경로가 된다.
let routeStops = [];
let searchMap, mgrMap, liveMap, addrMap, hospMap;
let hospMapPins=[];
let hospitalMarker = null;
let selectedHospital = null;

function createMap(elId, center){
  const map=L.map(elId,{ zoomControl:false, attributionControl:false, dragging:true, scrollWheelZoom:false });
  // CARTO Voyager: 기본 OSM 타일보다 채도가 낮고 도로/라벨이 정리된 스타일(네이버·카카오 지도 톤).
  // {r}은 고해상도 화면에서 @2x 타일을 받아 라벨이 또렷해진다. 키 불필요, 출처 표기 조건.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{
    maxZoom:20,
    subdomains:'abcd',
    attribution:'&copy; OpenStreetMap, &copy; CARTO'
  }).addTo(map);
  map.setView(center, 15);
  return map;
}

// 내 위치 마커. interactive:false라 매니저 핀 탭을 가로채지 않으므로 위에 그려도 안전하다.
// (아래로 깔면 매니저 핀에 가려 보이지 않는다)
function addMyLocationMarker(map){
  if(!map) return;
  L.marker(MAP_HOME, {
    interactive:false,
    zIndexOffset:1000,
    icon:L.divIcon({
      className:'',
      html:'<div class="map-me"><img src="Group 7385.png" alt="내 위치"></div>',
      iconSize:[60,60], iconAnchor:[30,30]
    })
  }).addTo(map);
}

function initMaps(){
  if(typeof L==='undefined') return;
  searchMap=createMap('map-search', MAP_HOME);
  mgrMap=createMap('map-mgr', MAP_HOME);
  liveMap=createMap('map-live', MAP_HOME);
  // searchMap은 showHospitalOnMap이 같은 아이콘으로 마커를 찍으므로 여기서 또 찍지 않는다(중복 방지)
  addMyLocationMarker(mgrMap);
  initLiveMapMarkers();
  initSearchMgrPins();
  searchMap.on('zoomend', updateSearchPinZoomMode);
}

// s-search: 매니저 위치 핀(더미 좌표) — 카드 ↔ 핀 동기화의 기준점
// MGRS 인덱스와 1:1로 대응하는 더미 좌표(향남읍 일대). 개수가 어긋나면 핀이 누락되므로
// MGRS를 늘릴 때 여기도 함께 늘린다.
const SEARCH_MGR_POS = [
  [37.12360, 126.90680],
  [37.12470, 126.90830],
  [37.12300, 126.90900],
  [37.12560, 126.90620],
  [37.12250, 126.90740],
  [37.12610, 126.90940],
  [37.12180, 126.90580],
  [37.12430, 126.91010],
  [37.12690, 126.90790],
  [37.12330, 126.91080],
  [37.12140, 126.90880]
];
let searchPinsReady = false;
let searchMgrPinMarkers = [];   // idx 기준 개별 핀 마커
let searchMergeMarkers = [];    // 현재 표시 중인 병합 배지 마커
let searchMergeGroups = [];     // 병합 배지 탭 시 확대할 그룹(좌표 idx 배열)
let hiddenSearchMgrIdx = new Set(); // 선택된 병원과 연결되지 않은 매니저 idx(지도 핀에서 제외)

// updateSearchMgrList가 계산한 숨김 idx를 지도 핀에도 반영한다
function setSearchMgrHidden(hiddenIdxArr){
  hiddenSearchMgrIdx = new Set(hiddenIdxArr || []);
  if(!searchMap || !searchPinsReady) return;
  searchMgrPinMarkers.forEach((m,i)=>{
    if(!m) return;
    if(hiddenSearchMgrIdx.has(i) && searchMap.hasLayer(m)) searchMap.removeLayer(m);
  });
  updateSearchPinZoomMode();
}

// zoom>=16(focusSearchMgr가 확대하는 값)이면 상세형, 그 미만(기본 15 포함)이면 축약형 — 새 임계값을 만들지 않고 기존 전환점을 재사용
function initSearchMgrPins(){
  if(!searchMap || searchPinsReady) return;
  SEARCH_MGR_POS.forEach((pos,i)=>{
    const m = MGRS[i] || {};
    const marker = L.marker(pos,{ icon:L.divIcon({
      className:'',
      html:'<div class="map-mgr" id="search-pin-'+i+'" onclick="tapSearchPin('+i+')">'
        +'<div class="mini-pill"></div>'
        +'<div class="pn"><img src="'+esc(m.photo||'')+'" alt="'+esc(m.nm||'')+' 매니저"></div>'
        +'</div>',
      iconSize:[44,50], iconAnchor:[22,47]
    })}).addTo(searchMap);
    searchMgrPinMarkers[i]=marker;
  });
  searchPinsReady=true;
  setSearchPinMode(searchMap.getZoom()>=16 ? 'detail' : 'mini'); // 진입 시 zoom 15 → 축약형으로 시작
}

// 핀 표시 모드(미니/상세) 전환 — 순수 시각적 클래스 토글. tapSearchCard/tapSearchPin/focusSearchMgr/pickMgr의 id 기반 카드↔핀 매칭 로직은 건드리지 않는다.
function setSearchPinMode(mode){
  document.querySelectorAll('#s-search .map-mgr').forEach(p=>p.classList.toggle('mini', mode==='mini'));
}

function updateSearchPinZoomMode(){
  if(!searchMap || !searchPinsReady) return;
  const zoom = searchMap.getZoom();
  if(zoom>=16){
    setSearchPinMode('detail');
    clearSearchPinMerge();
  } else {
    setSearchPinMode('mini');
    mergeSearchPinsIfOverlapping();
  }
}

// 축약형 겹침 회피(경량 훅): 화면 픽셀 거리가 가까운 핀을 합산 배지로 병합. 정식 클러스터링 라이브러리는 이번 범위 밖 —
// 더미 매니저 3명으로는 실제 병합이 거의 발생하지 않지만, 매니저 데이터가 늘어날 때를 대비해 구조만 미리 만들어둔다.
function clearSearchPinMerge(){
  searchMergeMarkers.forEach(m=>searchMap.removeLayer(m));
  searchMergeMarkers=[];
  searchMergeGroups=[];
  searchMgrPinMarkers.forEach((m,i)=>{ if(m && !hiddenSearchMgrIdx.has(i) && !searchMap.hasLayer(m)) m.addTo(searchMap); });
}
function mergeSearchPinsIfOverlapping(){
  if(!searchMap || !searchPinsReady) return;
  clearSearchPinMerge();
  const size = searchMap.getSize();
  if(!size.x || !size.y) return; // 지도가 아직 렌더링/사이즈 계산 전이면 스킵
  const MERGE_DIST_PX = 28;
  const visibleIdx = SEARCH_MGR_POS.map((_,i)=>i).filter(i=>!hiddenSearchMgrIdx.has(i));
  const pts = visibleIdx.map(i=>searchMap.latLngToContainerPoint(SEARCH_MGR_POS[i]));
  const used = new Array(pts.length).fill(false);
  const groups = [];
  pts.forEach((p,vi)=>{
    if(used[vi]) return;
    const group=[visibleIdx[vi]]; used[vi]=true;
    pts.forEach((q,vj)=>{
      if(vi===vj || used[vj]) return;
      if(p.distanceTo(q) < MERGE_DIST_PX){ group.push(visibleIdx[vj]); used[vj]=true; }
    });
    groups.push(group);
  });
  const mergeGroups = groups.filter(g=>g.length>1);
  mergeGroups.forEach(group=>{
    const gi = searchMergeGroups.length;
    searchMergeGroups.push(group);
    group.forEach(i=>{ if(searchMgrPinMarkers[i]) searchMap.removeLayer(searchMgrPinMarkers[i]); });
    const centroid = group.reduce((acc,i)=>[acc[0]+SEARCH_MGR_POS[i][0], acc[1]+SEARCH_MGR_POS[i][1]], [0,0]).map(v=>v/group.length);
    const badge = L.marker(centroid, { icon:L.divIcon({
      className:'',
      html:'<div class="map-mgr-merge" onclick="focusSearchMergeGroup('+gi+')">+'+group.length+'</div>',
      iconSize:[30,30], iconAnchor:[15,15]
    })}).addTo(searchMap);
    searchMergeMarkers.push(badge);
  });
}
function focusSearchMergeGroup(gi){
  const group = searchMergeGroups[gi];
  if(!group || !searchMap) return;
  const centroid = group.reduce((acc,i)=>[acc[0]+SEARCH_MGR_POS[i][0], acc[1]+SEARCH_MGR_POS[i][1]], [0,0]).map(v=>v/group.length);
  searchMap.setView(centroid, 16); // 그룹 확대 → zoomend가 상세형 전환을 자동으로 처리
}

// s-live 지도: 부모님 집 → 매니저 이동중 → 병원 마커 + 경로선
let liveRouteLayers = [];

// 출발지 → 경유지들 → 도착지 순서로 경로를 구간별로 나눠 그린다.
// 경유지를 추가·삭제하면 다시 호출해 전체 경로를 새로 그린다.
function drawLiveRoute(){
  if(!liveMap) return;
  liveRouteLayers.forEach(l=>liveMap.removeLayer(l));
  liveRouteLayers=[];

  const path = [MAP_HOME, ...routeStops.map(s=>s.pos), MAP_HOSPITAL];

  // 구간마다 선을 따로 그려 경유지에서 끊기는 느낌을 준다
  for(let i=0;i<path.length-1;i++){
    liveRouteLayers.push(
      L.polyline([path[i], path[i+1]], { color:'#1FB24A', weight:3, dashArray:'6,7', opacity:.8 }).addTo(liveMap)
    );
  }

  // w/h를 따로 받는다. 핀 모양(finish)은 뾰족한 끝이 좌표에 닿아야 해서 anchorY를 바닥으로 준다.
  const pin = (pos, html, w, h, anchorBottom) => liveRouteLayers.push(
    L.marker(pos, { icon:L.divIcon({
      className:'', html:html,
      iconSize:[w,h], iconAnchor:[w/2, anchorBottom ? h : h/2]
    }) }).addTo(liveMap)
  );
  // 출발지·병원·매니저 차량은 전용 이미지를 쓴다(이모지 대체)
  pin(MAP_HOME, '<img class="pin-loc" src="location.png" alt="출발지">', 44, 44);
  routeStops.forEach((s,i)=>
    pin(s.pos, '<div class="stop-pin">'+(i+1)+'</div>', 26, 26)
  );
  pin(MAP_HOSPITAL, '<img class="pin-finish" src="finish.png" alt="병원">', 30, 40, true);
  // car.png는 세로로 긴 원본(약 430x700)이라 비율을 유지해 세로를 길게 잡는다
  pin(MAP_MGR_LIVE, '<img class="pin-car" src="car.png" alt="매니저 차량">', 26, 42);

  // 위쪽은 플로팅 버튼(닫기·문의하기)에 가리지 않도록 여유를 더 준다
  liveMap.fitBounds(L.latLngBounds(path), { paddingTopLeft:[40,78], paddingBottomRight:[40,52] });
}

function initLiveMapMarkers(){ drawLiveRoute(); }

// 지도를 지나 스크롤하면 상단 플로팅 버튼이 본문 위에 겹치므로 숨긴다
(function bindLiveScroll(){
  const sc=document.getElementById('live-active');
  const btns=document.getElementById('live-top-btns');
  if(!sc || !btns) return;
  sc.addEventListener('scroll', ()=>{
    const mapH=sc.querySelector('.map-area')?.offsetHeight || 300;
    btns.classList.toggle('hide', sc.scrollTop > mapH - 70);
  });
})();

function showHospitalOnMap(h){
  if(!h || !h.lat || !h.lng){
    if(searchMap) searchMap.setView(MAP_HOME, 15);
    return;
  }
  const pos=[parseFloat(h.lat), parseFloat(h.lng)];
  if(searchMap){
    if(hospitalMarker) searchMap.removeLayer(hospitalMarker);
    // Leaflet 기본 파란 핀 대신 Group 7385.png 사용
    hospitalMarker=L.marker(pos, {
      interactive:false,
      zIndexOffset:1000,
      icon:L.divIcon({
        className:'',
        html:'<div class="map-me"><img src="Group 7385.png" alt="'+esc(h.name||'선택한 병원')+'"></div>',
        iconSize:[60,60], iconAnchor:[30,30]
      })
    }).addTo(searchMap);
    searchMap.setView(pos, 16);
  }
  if(mgrMap) mgrMap.setView(pos, 15);
}

function refreshActiveMaps(){
  setTimeout(()=>{
    const cur=stack[stack.length-1];
    const center=selectedHospital?.lat ? [parseFloat(selectedHospital.lat), parseFloat(selectedHospital.lng)] : MAP_HOME;
    const zoom=selectedHospital?.lat ? 16 : 15;
    if(cur==='s-search' && searchMap){ searchMap.invalidateSize(); searchMap.setView(center, zoom); updateSearchPinZoomMode(); }
    if(cur==='s-hospmap' && hospMap){ hospMap.invalidateSize(); }
    if(cur==='s-map' && mgrMap){ mgrMap.invalidateSize(); mgrMap.setView(center, zoom); }
    if(cur==='s-live' && liveMap){ liveMap.invalidateSize(); liveMap.fitBounds(L.latLngBounds([MAP_HOME, ...routeStops.map(s=>s.pos), MAP_HOSPITAL]), { paddingTopLeft:[40,78], paddingBottomRight:[40,52] }); }
  }, 320);
}

function recenterSearchMap(){
  if(!searchMap){ showToast('지도를 불러오는 중입니다'); return; }
  searchMap.setView(MAP_HOME, 15);
  showToast('출발지로 이동했습니다');
}

function updateHospitalMarkers(hospital){
  if(hospital && typeof hospital==='object') selectedHospital=hospital;
  showHospitalOnMap(selectedHospital);
}

// 우대 성별 필터 ('무관' | '여' | '남')
let prefSex='무관';
function openPrefSexSheet(){ openModal('modal-prefsex'); }
function pickPrefSex(el){
  document.querySelectorAll('#modal-prefsex .target-row').forEach(r=>r.classList.remove('on'));
  el.classList.add('on');
  prefSex = el.dataset.sex==='무관' ? '무관' : el.dataset.sex.charAt(0);  // '여성'→'여'
  const pill=document.getElementById('pref-sex-pill');
  const val=document.getElementById('pref-sex-val');
  if(val) val.textContent = el.dataset.sex;
  if(pill) pill.classList.toggle('set', prefSex!=='무관');
  // 선택이 바뀌면 목록·지도 핀을 즉시 다시 계산한다
  const visible=updateSearchMgrList(selectedHospital);
  pickMgr(visible.length ? visible[0] : -1);
  setTimeout(()=>closeModal('modal-prefsex'),200);
}

// 선택한 병원과 연결된 매니저만 s-search 목록·지도 핀에 남기고 나머지는 숨긴다.
// 병원에 mgrIds가 없으면(API 연동 등 매핑 정보가 없는 경우) 기존처럼 전체 노출로 안전하게 폴백한다.
function updateSearchMgrList(hospital){
  const allIdx=MGRS.map((_,i)=>i);
  const mgrIds = (hospital && Array.isArray(hospital.mgrIds)) ? hospital.mgrIds : allIdx;
  // 병원 제휴 + 우대 성별을 모두 만족하는 매니저만 남긴다
  const match = i => mgrIds.includes(i) && (prefSex==='무관' || MGRS[i].sex===prefSex);
  const visible = allIdx.filter(match);
  const hidden = allIdx.filter(i=>!match(i));

  allIdx.forEach(i=>{
    const card=document.getElementById('hc'+i);
    if(!card) return;
    card.style.display = visible.includes(i) ? '' : 'none';
  });
  const scroll=document.querySelector('#search-sheet .search-sheet-scroll');
  let emptyEl=document.getElementById('search-mgr-empty');
  if(visible.length===0){
    if(!emptyEl && scroll){
      emptyEl=document.createElement('div');
      emptyEl.id='search-mgr-empty';
      emptyEl.className='si-empty';
      emptyEl.style.padding='48px 20px';
      scroll.appendChild(emptyEl);
    }
    if(emptyEl){
      emptyEl.style.display='';
      // 성별 필터 때문에 비었으면 필터를 풀라고 안내해야 사용자가 막히지 않는다
      emptyEl.innerHTML = prefSex==='무관'
        ? '이 병원과 연결된 동행 매니저가 아직 없어요.<br>다른 병원을 검색하거나 잠시 후 다시 확인해 주세요.'
        : prefSex+' 매니저가 이 병원에는 아직 없어요.<br>우대 성별을 «무관»으로 바꾸면 다른 매니저를 볼 수 있어요.';
    }
  }else if(emptyEl){
    emptyEl.style.display='none';
  }

  const cnt=document.getElementById('search-sheet-count');
  if(cnt) cnt.textContent = visible.length;

  setSearchMgrHidden(hidden);
  return visible;
}

function updateMgrMapMarkers(){}

// initMaps()는 MGRS(매니저 사진·가격)를 읽으므로 MGRS 선언 이후에 호출한다 — 스크립트 맨 아래 참조

const IDS = ['s-onboard','s-kakao','s-checkup','s-landing','s-phone','s-otp','s-signup','s-home','s-settings','s-qr','s-addr-search','s-addr-confirm','s-addr-detail','s-searchinput','s-hospmap','s-hosp','s-search','s-mgr','s-history','s-map','s-notice','s-confirm','s-terms-sensitive','s-terms-third','s-order','s-live','s-timeline','s-report','s-report-detail','s-rebook'];
const LABELS = ['권한안내','카카오동의','검진연동','랜딩','전화번호','인증번호','회원가입','홈','설정','QR스캔','주소검색','위치확인','주소상세','병원검색','병원지도','병원상세','매니저검색','매니저프로필','예약내역','매니저선택','신청전안내','접수확인','민감정보동의','제3자동의','예약현황','동행중','타임라인','건강리포트','지표상세','재예약'];
let stack = ['s-onboard'];
let selectedMgr = 0;

// ── 전역 상태 (예약/동행/검진연동/신고) ──
let hasActiveBooking = false;
let hasCheckupSync = false;
let activeIncidentReport = null;

// ── 온보딩 ──
function go(id){                 // 온보딩 단계 전환 (오버레이 닫고 이동)
  document.querySelectorAll('.ob-ov').forEach(o=>o.classList.remove('show'));
  goTo(id);
}
function openNoti(){ document.getElementById('ov-noti').classList.add('show'); }
function openLoc(){ document.getElementById('ov-loc').classList.add('show'); }
function closeLoc(){
  document.getElementById('ov-loc').classList.remove('show');
  if(!hasHomeAddress) openAddrSearch();
}
// ── 홈 검색바 QR: 카메라 권한 → QR 스캔 화면 ──
function openCamPerm(){ document.getElementById('ov-cam').classList.add('show'); }
function allowCam(){
  document.getElementById('ov-cam').classList.remove('show');
  goTo('s-qr');
}
function denyCam(){
  document.getElementById('ov-cam').classList.remove('show');
  showToast('카메라 권한이 없어 QR 스캔을 사용할 수 없어요');
}

function enterApp(){             // 랜딩 → 홈 진입 후 위치 권한 표시
  tabTo('s-home');
  setTimeout(openLoc,450);
}

// ── 전화번호 로그인/회원가입 (s-phone → s-otp → [신규가입만] s-signup → s-checkup) ──
const EXISTING_PHONE_DIGITS='01011112222';      // 데모용: 이 번호만 "기존 회원"으로 처리
let signupPhone='';
let otpTimer=null, otpSeconds=59;

function maskPhone(v){
  const digits=String(v).replace(/\D/g,'');
  if(digits.length>=8) return digits.slice(0,3)+'-****-'+digits.slice(-4);
  return v;
}
function goPhoneOtp(){
  const val=document.getElementById('phone-input').value.trim();
  if(!val){ showToast('전화번호를 입력해주세요'); return; }
  signupPhone=val;
  const sub=document.getElementById('otp-sub');
  if(sub) sub.textContent=maskPhone(val)+'로 6자리 번호를 보냈어요';
  goTo('s-otp');
  startOtpTimer();
}
function startOtpTimer(){
  clearInterval(otpTimer);
  otpSeconds=59;
  updateOtpTimerText();
  otpTimer=setInterval(()=>{
    otpSeconds--;
    if(otpSeconds<=0){ otpSeconds=0; clearInterval(otpTimer); }
    updateOtpTimerText();
  },1000);
}
function updateOtpTimerText(){
  const el=document.getElementById('otp-resend');
  if(!el) return;
  if(otpSeconds>0){
    el.textContent='인증번호 재전송 (0:'+(otpSeconds<10?'0':'')+otpSeconds+')';
    el.style.color='var(--g400)';
  }else{
    el.textContent='인증번호 재전송';
    el.style.color='var(--teal)';
  }
}
function resendOtp(){
  if(otpSeconds>0) return;
  showToast('인증번호를 다시 보냈어요');
  startOtpTimer();
}
function verifyOtp(){
  const code=document.getElementById('otp-input').value.trim();
  if(code.length<6){ showToast('6자리 인증번호를 입력해주세요'); return; }
  clearInterval(otpTimer);
  const digits=signupPhone.replace(/\D/g,'');
  if(digits===EXISTING_PHONE_DIGITS){
    showToast('인증되었습니다. 기존 계정으로 로그인합니다');
    enterApp();
  }else{
    showToast('인증되었습니다');
    goTo('s-signup');
  }
}

// ── s-signup 단계 폼: 이름 → 생년월일 → 통신사 → 휴대폰 → 인증번호 → 약관 ──
// 각 단계는 앞 단계가 채워질 때 .show가 붙으면서 슬라이드업으로 나타난다(토스풍).
let suCarrier='';
let suVerified=false;
let suCodeTimer=null, suCodeLeft=180;

function suShow(id){
  const el=document.getElementById(id);
  if(el && !el.classList.contains('show')){
    el.classList.add('show');
    // 새로 열린 입력이 화면 밖이면 자연스럽게 따라 내려간다
    setTimeout(()=>el.scrollIntoView({behavior:'smooth',block:'nearest'}),80);
  }
}
function suOnName(){
  const v=document.getElementById('su-name').value.trim();
  if(v.length>=2) suShow('su-step-birth');
  syncSuSubmit();
}
// 생년월일: 숫자만 입력해도 1985-03-12 형태로 자동 하이픈
function suOnBirth(inp){
  const d=inp.value.replace(/\D/g,'').slice(0,8);
  inp.value = d.length>6 ? d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6)
            : d.length>4 ? d.slice(0,4)+'-'+d.slice(4)
            : d;
  if(d.length===8) suShow('su-step-carrier');
  syncSuSubmit();
}
function suPickCarrier(el,nm){
  el.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));
  el.classList.add('on');
  suCarrier=nm;
  suShow('su-step-phone');
  syncSuSubmit();
}
function suOnPhone(inp){
  const d=inp.value.replace(/\D/g,'').slice(0,11);
  inp.value = d.length>7 ? d.slice(0,3)+'-'+d.slice(3,7)+'-'+d.slice(7)
            : d.length>3 ? d.slice(0,3)+'-'+d.slice(3)
            : d;
  document.getElementById('su-send-btn').disabled = d.length<10;
  syncSuSubmit();
}
function suSendCode(){
  const btn=document.getElementById('su-send-btn');
  btn.textContent='재전송'; btn.classList.add('done');
  suShow('su-step-code');
  showToast(suCarrier+'로 인증번호를 보냈어요');
  startSuCodeTimer();
  setTimeout(()=>document.getElementById('su-code')?.focus(),420);
}
function startSuCodeTimer(){
  clearInterval(suCodeTimer);
  suCodeLeft=180;
  const paint=()=>{
    const el=document.getElementById('su-timer');
    if(el) el.textContent=Math.floor(suCodeLeft/60)+':'+String(suCodeLeft%60).padStart(2,'0');
  };
  paint();
  suCodeTimer=setInterval(()=>{
    suCodeLeft--;
    if(suCodeLeft<=0){ suCodeLeft=0; clearInterval(suCodeTimer); }
    paint();
  },1000);
}
function suOnCode(inp){
  inp.value=inp.value.replace(/\D/g,'').slice(0,6);
  document.getElementById('su-verify-btn').disabled = inp.value.length<6;
}
function suVerifyCode(){
  clearInterval(suCodeTimer);
  suVerified=true;
  const btn=document.getElementById('su-verify-btn');
  btn.textContent='인증완료'; btn.classList.add('done'); btn.disabled=true;
  document.getElementById('su-code').disabled=true;
  const timer=document.getElementById('su-timer'); if(timer) timer.style.display='none';
  const hint=document.getElementById('su-code-hint');
  hint.textContent='✓ 본인인증이 완료됐어요'; hint.classList.add('ok');
  document.getElementById('su-step-code').classList.add('done');
  suShow('su-step-agree');
  syncSuSubmit();
}
// 모든 단계가 끝나야 [가입 완료]가 켜진다
function syncSuSubmit(){
  const btn=document.getElementById('su-submit');
  if(!btn) return;
  const name=document.getElementById('su-name').value.trim();
  const birth=document.getElementById('su-birth').value.trim();
  const reqOk=SU_REQUIRED.every(id=>document.getElementById(id).classList.contains('checked'));
  btn.disabled = !(name && birth.length===10 && suCarrier && suVerified && reqOk);
}

// s-signup: 이름·생년월일 + 약관동의(agree-all/agree-item 패턴 재사용)
const SU_ALL=['su1','su2','su3'];
const SU_REQUIRED=['su1','su2'];
function toggleSu(id){
  document.getElementById(id).classList.toggle('checked');
  syncSuState();
}
function toggleSuAll(){
  const willCheck=!document.getElementById('su-all').classList.contains('checked');
  SU_ALL.forEach(id=>document.getElementById(id).classList.toggle('checked',willCheck));
  syncSuState();
}
function syncSuState(){
  SU_ALL.forEach(id=>{
    const row=document.getElementById(id);
    row.querySelector('.agree-item-check').textContent=row.classList.contains('checked')?'✓':'';
  });
  const allChecked=SU_ALL.every(id=>document.getElementById(id).classList.contains('checked'));
  document.getElementById('su-all').classList.toggle('checked',allChecked);
  document.getElementById('su-chk-all').textContent=allChecked?'✓':'';
  syncSuSubmit();
}
SU_ALL.forEach(id=>document.getElementById(id)?.classList.remove('checked'));
syncSuState();
function completeSignup(){
  const name=document.getElementById('su-name').value.trim();
  const birth=document.getElementById('su-birth').value.trim();
  if(!name || !birth){ showToast('이름과 생년월일을 입력해주세요'); return; }
  if(!suCarrier){ showToast('통신사를 선택해주세요'); return; }
  if(!suVerified){ showToast('휴대폰 본인인증을 완료해주세요'); return; }
  const reqOk=SU_REQUIRED.every(id=>document.getElementById(id).classList.contains('checked'));
  if(!reqOk){ showToast('⚠ 필수 약관에 동의해주세요'); return; }
  showToast('가입이 완료됐습니다');
  // 가입 직후 건강검진결과 연동 단계는 건너뛰고 바로 홈으로 보낸다.
  // (연동 화면 s-checkup은 리포트 탭에서 따로 진입한다)
  skipCheckup();
}

// 시계
// 상태바를 bar.png 이미지로 대체하면서 시계 표시가 사라졌다.
// 나중에 텍스트 상태바로 되돌릴 수 있게 함수는 남겨두고 대상이 없으면 건너뛴다.
function updateClock(){
  const el=document.getElementById('clock');
  if(!el) return;
  const d=new Date();
  el.textContent=d.getHours()+':'+(d.getMinutes()<10?'0':'')+d.getMinutes();
}
updateClock(); setInterval(updateClock,30000);

// 화면 컨테이너가 어떤 이유로든 밀려 있으면 되돌린다(앱바·탭바가 제자리를 벗어나는 것 방지)
function resetScreenScroll(el){ if(el){ el.scrollTop=0; el.scrollLeft=0; } }

// 화면 전환
function goTo(id){
  const cur=stack[stack.length-1];
  document.querySelectorAll('.screen').forEach(s=>{
    if(s.id===cur){s.classList.remove('active');s.classList.add('prev');}
    else{s.classList.remove('active','prev');}
  });
  const next=document.getElementById(id);
  if(next){next.classList.remove('prev');void next.offsetWidth;next.classList.add('active');resetScreenScroll(next);stack.push(id);}
  updateDots();
  refreshActiveMaps();
}
function goBack(){
  if(stack.length<=1)return;
  stack.pop();
  const prev=stack[stack.length-1];
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active','prev'));
  const el=document.getElementById(prev);
  if(el){el.classList.add('active');resetScreenScroll(el);}
  updateDots();
  refreshActiveMaps();
}
function tabTo(id){
  stack=[id];
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active','prev'));
  const el=document.getElementById(id);
  if(el){el.classList.add('active');resetScreenScroll(el);}
  if(id==='s-home') updateHomeState();
  if(id==='s-live') updateLiveState();
  if(id==='s-history') renderBookings();
  if(id==='s-report') renderDoctorReport();
  updateDots();
  refreshActiveMaps();
}

// ── s-report: 내 기록 / 건강 조회 탭 ──
// 건강 조회는 검진 항목을 위험/주의/정상 판정과 함께 단순 나열한다(건강검진 결과 화면 참고).
const HEALTH_GROUPS=[
  // 국민건강보험공단 검진표 예시값 — 아래 "검진표 → 이번 진료" 비교의 기준 시점과 동일하게 맞춘다.
  { nm:'비만도', st:'주의',  rows:[['몸무게','63 kg'],['체질량지수','24.5 kg/m²']] },
  { nm:'혈압',   st:'주의',  rows:[['혈압(수축/이완)','138/88 mmHg']] },
  { nm:'혈당',   st:'위험',  rows:[['공복혈당','112 mg/dL'],['당화혈색소','7.3 %']] },
  { nm:'이상지질', st:'주의', rows:[['총콜레스테롤','188 mg/dL'],['LDL 콜레스테롤','130 mg/dL']] },
  { nm:'신장',   st:'정상',  rows:[['eGFR','88 mL/min'],['혈청 크레아티닌','0.8 mg/dL']] },
  { nm:'간장',   st:'정상',  rows:[['AST','24 IU/L'],['ALT','21 IU/L']] },
];
const HL_ST_CLS={ '위험':'danger', '주의':'warn', '정상':'ok' };
// 병원동행 보고서 — 진단명·검사는 매니저가 동행 중 칩으로 고른 항목만 실린다.
// (선택 후보 전체를 두고, picked에 든 것만 보고서에 노출)
const DR_DX_OPTIONS   = ['피부 건조증','제2형 당뇨병','고혈압','골관절염','백내장'];
const DR_TEST_OPTIONS = ['혈액검사','소변검사','흉부 X-ray','심전도','초음파'];
let drPickedDx   = ['제2형 당뇨병'];
let drPickedTest = ['혈액검사','소변검사'];
function renderDoctorReport(){
  const put=(id,list)=>{
    const el=document.getElementById(id);
    if(!el) return;
    el.innerHTML = list.length
      ? list.map(v=>`<span class="dr-chip">${esc(v)}</span>`).join('')
      : '<span class="dr-chip none">매니저가 선택한 항목이 없어요</span>';
  };
  put('dr-dx', drPickedDx);
  put('dr-test', drPickedTest);
}

function pickHealthTab(i){
  document.querySelectorAll('#s-report .hl-tab').forEach((t,n)=>{
    const active=n===i;
    t.classList.toggle('on',active);
    t.setAttribute('aria-selected',active?'true':'false');
    t.tabIndex=active?0:-1;
  });
  const rec=document.getElementById('rp-tab-record');
  const chk=document.getElementById('rp-tab-checkup');
  if(rec){ rec.style.display = i===0 ? '' : 'none'; rec.hidden = i!==0; }
  if(chk){ chk.style.display = i===1 ? '' : 'none'; chk.hidden = i!==1; }
  if(i===0) renderDoctorReport(); else renderHealthGroups();
  syncHealthCounts();
}
function syncHealthCounts(){
  // 현재 진료 지표: 표시된 배지에서 직접 계산해 카피/숫자 변경 시에도 요약이 어긋나지 않게 한다.
  const cur={danger:0,warn:0,ok:0};
  document.querySelectorAll('#current-health-metrics .m-badge').forEach(b=>{
    if(b.classList.contains('bad')) cur.danger++;
    else if(b.classList.contains('warn')) cur.warn++;
    else if(b.classList.contains('ok') || b.classList.contains('goal')) cur.ok++;
  });
  const putNum=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=String(v); };
  putNum('rp-danger-count',cur.danger); putNum('rp-warn-count',cur.warn); putNum('rp-ok-count',cur.ok);

  // 건강검진 결과: HEALTH_GROUPS를 단일 진실원천으로 사용한다.
  const chk={'위험':0,'주의':0,'정상':0};
  HEALTH_GROUPS.forEach(g=>{ if(Object.prototype.hasOwnProperty.call(chk,g.st)) chk[g.st]++; });
  const putLabel=(id,label,v)=>{ const el=document.getElementById(id); if(el) el.textContent=label+' '+v; };
  putLabel('hl-danger-count','위험',chk['위험']);
  putLabel('hl-warn-count','주의',chk['주의']);
  putLabel('hl-ok-count','정상',chk['정상']);
}

function renderHealthGroups(){
  const el=document.getElementById('hl-groups');
  if(!el) return;
  el.innerHTML=HEALTH_GROUPS.map(g=>`
    <div class="hl-grp">
      <div class="hl-grp-h">
        <div class="hl-grp-nm">${esc(g.nm)}<em class="${HL_ST_CLS[g.st]}">${g.st}</em></div>
        <button class="hl-more" onclick="showToast('${esc(g.nm)} 상세를 확인하세요')">더보기</button>
      </div>
      ${g.rows.map(([k,v])=>`<div class="hl-row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('')}
    </div>`).join('');
  syncHealthCounts();
}

// ── s-history: 예정 / 완료 / 취소 탭 ──
// no: 예약번호, amt: 결제(예정) 금액, mode/hours: 영수증형 상세에 쓰는 항목
const BOOKINGS=[
  { st:0, hosp:'똑똑연세내과의원', mgr:'김민준 매니저', memo:'당뇨 추적 검사',
    start:'8.13 (목) 10:00', end:'8.13 (목) 12:00', left:'오늘 10:00 동행 시작',
    no:'M26H13-KTQAS', amt:45000, mode:'차량 동행', hours:2, target:'아버지 (이순자, 74세)' },
  { st:1, hosp:'똑똑연세내과의원', mgr:'김민준 매니저', memo:'당뇨 정기검진',
    start:'6.18 (목) 10:00', end:'6.18 (목) 12:00',
    no:'M26F18-JHW2P', amt:45000, mode:'차량 동행', hours:2, target:'아버지 (이순자, 74세)' },
  { st:1, hosp:'똑똑연세내과의원', mgr:'김민준 매니저', memo:'혈압 검진',
    start:'5.21 (목) 11:00', end:'5.21 (목) 13:00',
    no:'M26E21-BX9RM', amt:30000, mode:'알뜰 동행', hours:2, target:'아버지 (이순자, 74세)' },
  { st:1, hosp:'똑똑연세내과의원', mgr:'이수연 매니저', memo:'정기검진',
    start:'4.09 (목) 10:30', end:'4.09 (목) 12:30',
    no:'M26D09-NC4TU', amt:30000, mode:'알뜰 동행', hours:2, target:'어머니 (박말순, 71세)' },
  { st:2, hosp:'향남서울내과의원', mgr:'박성호 매니저', memo:'감기 진료',
    start:'3.02 (월) 14:00', end:'3.02 (월) 16:00',
    no:'M26C02-YR7LE', amt:30000, mode:'알뜰 동행', hours:2, target:'아버지 (이순자, 74세)' },
];
let bkTabIdx=0;
function pickBkTab(i){
  bkTabIdx=i;
  document.querySelectorAll('#bk-tabs .bk-tab').forEach((t,n)=>t.classList.toggle('on',n===i));
  renderBookings();
}
function renderBookings(){
  const el=document.getElementById('bk-list');
  if(!el) return;
  const list=BOOKINGS.filter(b=>b.st===bkTabIdx);
  if(!list.length){
    el.innerHTML='<div class="bk-empty"><span class="e">🗓️</span>해당하는 예약이 없어요</div>';
    return;
  }
  el.innerHTML=list.map((b,i)=>{
    const idx=BOOKINGS.indexOf(b);
    const stateNm=['예약확정','동행완료','예약취소'][b.st];
    const stateCls=['','done','cancel'][b.st];
    const foot = b.st===0 ? `<button class="bk-cancel" onclick="openBkCancel(${idx})">예약취소</button>`
              : b.st===1 ? `<button class="bk-report" onclick="goTo('s-report')">리포트 보기</button>`
              : '';
    // 이미 취소된 예약은 볼 상세 내역이 없으므로 '예약 상세'를 노출하지 않는다
    const detail = b.st===2 ? ''
      : `<button class="bk-detail" onclick="openBkDetail(${idx})">예약 상세 <i class="fi fi-rr-angle-small-right"></i></button>`;
    return `<div class="bk-card">
      <div class="bk-card-h">
        <span class="bk-state ${stateCls}">${stateNm}</span>
        ${detail}
      </div>
      ${b.left?`<div class="bk-countdown">${esc(b.left)}</div>`:''}
      <div class="bk-div"></div>
      <div class="bk-body">
        <div class="bk-thumb"><img src="clinic-logo.png" loading="lazy" decoding="async" alt="${esc(b.hosp)}"></div>
        <div style="flex:1;min-width:0">
          <div class="bk-nm">${esc(b.hosp)}</div>
          <div class="bk-sub">${esc(b.mgr)} · ${esc(b.memo)}</div>
        </div>
      </div>
      <div class="bk-times">
        <div class="bk-time"><div class="bk-time-lb">동행 시작</div><div class="bk-time-vl">${esc(b.start)}</div></div>
        <div class="bk-time"><div class="bk-time-lb">동행 종료</div><div class="bk-time-vl">${esc(b.end)}</div></div>
      </div>
      ${foot}
    </div>`;
  }).join('');
}

// ── 예약 취소 ──
// 동행 시작이 임박할수록 수수료가 커진다. 데모라 '3일 이내 = 50%' 한 가지 규칙만 둔다.
let bkCancelIdx=-1;
function openBkCancel(idx){
  bkCancelIdx=idx;
  const b=BOOKINGS[idx];
  if(!b) return;
  const fee=Math.round(b.amt*0.5);
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  set('bkc-hosp', b.hosp);
  set('bkc-when', b.start+' ~ '+b.end.split(') ')[1]);
  set('bkc-amt', money(b.amt));
  set('bkc-fee', '-'+money(fee));
  set('bkc-fee2', '-'+money(fee));
  set('bkc-refund', money(b.amt-fee));
  const reason=document.getElementById('bkc-reason'); if(reason) reason.value='';
  openModal('modal-bk-cancel');
}
function confirmBkCancel(){
  const b=BOOKINGS[bkCancelIdx];
  if(!b){ closeModal('modal-bk-cancel'); return; }
  b.st=2;                       // 취소 탭으로 이동
  b.left='';
  hasActiveBooking=false;
  updateHomeState();
  updateLiveState();
  closeModal('modal-bk-cancel');
  renderBookings();
  showToast('예약이 취소됐습니다. 환불은 즉시 처리됩니다');
}

// ── 예약 상세 (영수증형) ──
function openBkDetail(idx){
  const b=BOOKINGS[idx];
  if(!b) return;
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  set('bkd-hosp', b.hosp);
  set('bkd-state', ['예약확정','동행완료','예약취소'][b.st]);
  set('bkd-no', b.no);
  set('bkd-when', b.start+' ~ '+b.end.split(') ')[1]);
  set('bkd-mode', b.mode+' x '+b.hours+'시간');
  set('bkd-amt', money(b.amt));
  set('bkd-target', b.target);
  set('bkd-mgr', b.mgr);
  set('bkd-total', money(b.amt));
  openModal('modal-bk-detail');
}

// ── s-home: 예약 있음/없음 상태 분기 ──
function updateHomeState(){
  const active=document.getElementById('home-active-card');
  if(active) active.style.display = hasActiveBooking ? '' : 'none';
}

// ── s-live: 동행 있음/없음 상태 분기 ──
function updateLiveState(){
  const empty=document.getElementById('live-empty');
  const activeEl=document.getElementById('live-active');
  if(empty) empty.style.display = hasActiveBooking ? 'none' : 'flex';
  if(activeEl) activeEl.style.display = hasActiveBooking ? '' : 'none';
  // 상단 플로팅 버튼은 live-active 밖에 있으므로 따로 감춘다
  const topBtns=document.getElementById('live-top-btns');
  if(topBtns) topBtns.style.display = hasActiveBooking ? '' : 'none';
  const addr=document.getElementById('live-info-addr'); if(addr) addr.textContent=homeAddress;
  const hosp=document.getElementById('live-info-hosp'); if(hosp) hosp.textContent=selectedHospital?.name||'똑똑연세내과의원';
  updateSosVisibility();
  updateIncidentBadge();
}

function updateSosVisibility(){
  const liveBtn=document.getElementById('live-sos-btn');
  const tlBtn=document.getElementById('tl-sos-btn');
  if(liveBtn) liveBtn.style.display = hasActiveBooking ? '' : 'none';
  if(tlBtn) tlBtn.style.display = hasActiveBooking ? '' : 'none';
}

function updateIncidentBadge(){
  const b=document.getElementById('tl-incident-badge');
  if(b) b.style.display = (activeIncidentReport && hasActiveBooking) ? '' : 'none';
}

// ── 동행 중 위기 대응: 긴급 신고 ──
function openSosOption(type){
  closeModal('modal-sos');
  openModal(type==='A' ? 'modal-sos-a' : 'modal-sos-b');
}
function callSafetyTeam(){
  showToast('모시고 고객센터 안전지원팀에 연결합니다 📞');
}
function submitSos(type){
  if(type==='B'){
    const txt=document.getElementById('sos-b-text').value.trim();
    if(!txt){ showToast('상황 설명을 입력해주세요'); return; }
  }
  const id=Math.floor(10000+Math.random()*90000);
  activeIncidentReport={ id, type, time:new Date() };
  closeModal(type==='A' ? 'modal-sos-a' : 'modal-sos-b');
  showToast('신고가 접수되었습니다 (접수번호 #'+id+'). 상담사가 10분 내 연락드립니다.');
  updateIncidentBadge();
}

// ── s-timeline: 귀가완료 도달 시 hasActiveBooking 해제 (데모 시뮬레이션) ──
function completeReturn(){
  hasActiveBooking=false;
  activeIncidentReport=null;
  updateHomeState();
  updateLiveState();
  showToast('귀가가 완료되었습니다. 오늘 동행이 종료됐어요 🏠');
  setTimeout(()=>tabTo('s-home'),900);
}

// ── s-checkup: 건강검진결과 연동 (리포트에서 진입) ──
const CKU_ALL=['cku1','cku2','cku3','cku4','cku5','cku6'];
const CKU_REQUIRED=['cku1','cku2','cku3','cku4','cku5'];
function toggleCku(id){
  document.getElementById(id).classList.toggle('checked');
  syncCkuState();
}
function toggleCkuAll(){
  const willCheck=!document.getElementById('cku-all').classList.contains('checked');
  CKU_ALL.forEach(id=>document.getElementById(id).classList.toggle('checked',willCheck));
  syncCkuState();
}
function syncCkuState(){
  CKU_ALL.forEach(id=>{
    const row=document.getElementById(id);
    row.querySelector('.agree-item-check').textContent=row.classList.contains('checked')?'✓':'';
  });
  const allChecked=CKU_ALL.every(id=>document.getElementById(id).classList.contains('checked'));
  document.getElementById('cku-all').classList.toggle('checked',allChecked);
  document.getElementById('cku-chk-all').textContent=allChecked?'✓':'';
}
CKU_ALL.forEach(id=>document.getElementById(id)?.classList.remove('checked'));
syncCkuState();

function openCheckupTerms(){
  openModal('modal-checkup-terms');
}
function confirmCheckupTerms(){
  const reqOk=CKU_REQUIRED.every(id=>document.getElementById(id).classList.contains('checked'));
  if(!reqOk){ showToast('⚠ 필수 항목에 동의해주세요'); return; }
  closeModal('modal-checkup-terms');
  openModal('modal-checkup-auth');
}
function pickAuthMethod(method){
  closeModal('modal-checkup-auth');
  if(method==='pass'){ openModal('modal-checkup-carrier'); }
  else { startCheckupLoading(); }
}
let passAttempt=0;
function pickCarrier(){
  closeModal('modal-checkup-carrier');
  passAttempt=0;
  document.getElementById('ov-pass-wait').classList.add('show');
}
function closePassWait(){
  document.getElementById('ov-pass-wait').classList.remove('show');
}
function confirmPassAuth(){
  passAttempt++;
  document.getElementById('ov-pass-wait').classList.remove('show');
  if(passAttempt<2){ document.getElementById('ov-checkup-error').classList.add('show'); }
  else { startCheckupLoading(); }
}
function retryPassAuth(){
  document.getElementById('ov-checkup-error').classList.remove('show');
  document.getElementById('ov-pass-wait').classList.add('show');
}
function resendPassAuth(){
  closeModal('modal-pass-resend');
  showToast('인증 알림을 다시 보냈어요');
}
function startCheckupLoading(){
  document.getElementById('cku-loading').classList.add('show');
  setTimeout(()=>{
    document.getElementById('cku-loading').classList.remove('show');
    document.getElementById('cku-done').classList.add('show');
  },1400);
}
function finishCheckup(){
  document.getElementById('cku-done').classList.remove('show');
  hasCheckupSync=true;
  updateReportCompare();
  goBack();
}
function skipCheckup(){
  hasCheckupSync=false;
  updateReportCompare();
  enterApp();
}

// ── s-report: 검진결과 대비 변화 섹션 노출 ──
function updateReportCompare(){
  const yes=document.getElementById('checkup-compare-yes');
  const no=document.getElementById('checkup-compare-no');
  if(yes) yes.style.display = hasCheckupSync ? '' : 'none';
  if(no) no.style.display = hasCheckupSync ? 'none' : '';
  const legend=document.getElementById('rd-checkup-legend');
  const point=document.getElementById('rd-checkup-point');
  if(legend) legend.style.display = hasCheckupSync ? '' : 'none';
  if(point) point.style.display = hasCheckupSync ? '' : 'none';
}
updateReportCompare();

// 인디케이터
function updateDots(){
  const cur=stack[stack.length-1];
  const idx=IDS.indexOf(cur);
  document.getElementById('nav-dots').innerHTML=IDS.map((id,i)=>
    `<div class="proto-nav-dot${i===idx?' on':''}" onclick="tabTo('${id}')" title="${LABELS[i]}"></div>`
  ).join('');
}
updateDots();

// 토스트
let tt;
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(tt); tt=setTimeout(()=>t.classList.remove('show'),2200);
}

// 모달
function openModal(id){document.getElementById(id)?.classList.add('show');}
function closeModal(id){document.getElementById(id)?.classList.remove('show');}

// 칩 토글 (복수)
function toggleChip(el){el.classList.toggle('on');}

// 칩 단일선택 (매니저 정렬) — 실제 .mgr-card DOM 순서를 재배열한다
function sortMgrCards(label){
  const cards=[...document.querySelectorAll('#s-map .mgr-card')];
  if(!cards.length) return;
  let sorted;
  if(label==='거리순')        sorted=cards.slice().sort((a,b)=>(+a.dataset.walk)-(+b.dataset.walk));
  else if(label==='평점순')   sorted=cards.slice().sort((a,b)=>(+b.dataset.rating)-(+a.dataset.rating));
  else if(label==='재이용률') sorted=cards.slice().sort((a,b)=>(+b.dataset.count)-(+a.dataset.count));
  else                        sorted=['mgr0','mgr1','mgr2'].map(id=>document.getElementById(id)).filter(Boolean); // AI 추천순 = 기본 순서
  const parent=cards[0].parentNode;
  sorted.forEach(c=>parent.appendChild(c));
}
function sortChip(el, label){
  el.closest('.chip-single').querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('map-sort-badge').textContent='✦ '+label;
  sortMgrCards(label);
  showToast(label+'으로 정렬했습니다');
}
// 화면 재진입 시 정렬 기준 초기화(AI 추천순)
function resetMgrSortOrder(){
  if(!document.getElementById('mgr0')) return;
  sortMgrCards('AI 추천순');
  const badge=document.getElementById('map-sort-badge');
  if(badge) badge.textContent='✦ AI 추천순';
}

// 부모 선택
function selectParent(el){
  document.querySelectorAll('.parent-btn').forEach(b=>b.classList.remove('on'));
  el.classList.add('on');
}

// 홈 프로모 카드("곧 진료예요!") 닫기 — 세션 동안만 숨김(새로고침하면 다시 보임)
function closeRepPromo(){
  const el=document.getElementById('rep-recent');
  if(el) el.style.display='none';
}

// 홈 세그먼트 칩 (진료 내역: 최신순 / 예정진료)
function segReport(el,which){
  el.closest('.seg-chips').querySelectorAll('.seg-chip').forEach(c=>c.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('rep-recent').style.display   = which==='recent'   ? '' : 'none';
  document.getElementById('rep-upcoming').style.display = which==='upcoming' ? '' : 'none';
}

function openAgreeSheet(){ openModal('modal-agree'); }

// ── 동의 체크박스 (시안 바텀시트) ──
const ALL_AGREES=['agree1','agree2','agree3'];
const REQUIRED_AGREES=['agree1','agree2'];

function toggleAgree(id){
  document.getElementById(id).classList.toggle('checked');
  syncAgreeState();
}

function toggleAgreeAll(){
  const master=document.getElementById('agree-all');
  const willCheck=!master.classList.contains('checked');
  ALL_AGREES.forEach(aid=>document.getElementById(aid).classList.toggle('checked',willCheck));
  syncAgreeState();
}

// 개별 체크 아이콘 · 마스터 동기화 · 확인 버튼 상태 갱신
function syncAgreeState(){
  ALL_AGREES.forEach(aid=>{
    const row=document.getElementById(aid);
    row.querySelector('.agree-item-check').textContent=row.classList.contains('checked')?'✓':'';
  });
  const allChecked=ALL_AGREES.every(aid=>document.getElementById(aid).classList.contains('checked'));
  document.getElementById('agree-all').classList.toggle('checked',allChecked);
  document.getElementById('chk-all').textContent=allChecked?'✓':'';

  const reqOk=REQUIRED_AGREES.every(aid=>document.getElementById(aid).classList.contains('checked'));
  const btn=document.getElementById('agree-confirm-btn');
  if(reqOk){
    btn.classList.remove('disabled'); btn.classList.add('primary');
    btn.textContent='동의하고 매니저 선택하기';
  }else{
    btn.classList.add('disabled'); btn.classList.remove('primary');
    btn.textContent='필수 약관에 동의해주세요';
  }
}
// 초기 상태: 모두 미체크 → 버튼 비활성
ALL_AGREES.forEach(aid=>document.getElementById(aid).classList.remove('checked'));
syncAgreeState();

// 동의 확인 후 다음
function confirmAgree(){
  const reqOk=REQUIRED_AGREES.every(aid=>document.getElementById(aid).classList.contains('checked'));
  if(!reqOk){
    showToast('⚠ 필수 약관에 동의해주세요');
    REQUIRED_AGREES.forEach(aid=>{
      const el=document.getElementById(aid);
      el.style.outline='2px solid var(--coral)';
      setTimeout(()=>el.style.outline='',2000);
    });
    return;
  }
  closeModal('modal-agree');

  // ── 매니저 선택 초기화 ── (pickMgr가 confirm-mgr 텍스트·썸네일을 함께 갱신한다)
  pickMgr(0);

  // ── 정렬 칩 + 매니저 카드 DOM 순서 초기화 ──
  const sortGroup=document.getElementById('sort-chips');
  if(sortGroup){
    sortGroup.querySelectorAll('.chip').forEach((c,i)=>c.classList.toggle('on',i===0));
  }
  resetMgrSortOrder();

  // ── 진단명·간병시간 → 동행 경로 카드에 반영 ──
  updateConfirmRouteMeta();

  doPay();
}

// 매니저 선택
function selectManager(idx){
  pickMgr(idx);
  document.querySelectorAll('.mgr-card').forEach((c,i)=>c.classList.toggle('on',i===idx));
  document.getElementById('map-next-btn').textContent=MGRS[idx].nm+' 매니저로 접수하기';
}

// ── 병원 검색 (/api/hospitals · 실패 시 로컬 예시 데이터로 안전하게 전환)
const HOSPITAL_API_BASE = (location.protocol==='http:' || location.protocol==='https:') ? '/api/hospitals' : null;
const DEPT_KEYWORDS = { '내과':'D001','소아':'D002','신경':'D003','정신':'D004','외과':'D005','정형외과':'D006','안과':'D008','이비인후과':'D013','피부':'D014','비뇨':'D015','산부인과':'D016' };
// mgrIds: MGRS(및 nv-card hc0/hc1/hc2) 인덱스 배열. 병원과 제휴/소속된 매니저만 매칭한다.
// 빈 배열([])인 병원은 아직 동행 가능한 매니저가 없는 경우를 의도적으로 시연한다.
const FALLBACK_HOSPITALS = [
  { name:'똑똑연세내과의원', addr:'경기도 화성시 향남읍', dept:'내과', type:'의원', lat:'37.12540', lng:'126.90910', tel:'', mgrIds:[0,1,4,8,10] },
  { name:'향남서울내과의원', addr:'경기도 화성시 향남읍', dept:'내과', type:'의원', lat:'37.12480', lng:'126.90820', tel:'', mgrIds:[0,2,4,7,9] },
  { name:'튼튼정형외과', addr:'경기도 화성시 향남읍', dept:'정형외과', type:'의원', lat:'37.12410', lng:'126.90700', tel:'', mgrIds:[2,3,7] },
  { name:'향남연세이비인후과', addr:'경기도 화성시 향남읍', dept:'이비인후과', type:'의원', lat:'37.12500', lng:'126.90880', tel:'', mgrIds:[1,6,10] },
  { name:'향남밝은안과의원', addr:'경기도 화성시 향남읍', dept:'안과', type:'의원', lat:'37.12350', lng:'126.90680', tel:'', mgrIds:[] },
  { name:'화성시향남보건지소', addr:'경기도 화성시 향남읍', dept:'보건', type:'보건소', lat:'37.12320', lng:'126.90780', tel:'', mgrIds:[] }
];
let hospitalCache = [];
let siTimer = null;
let lastHospitalDataSource = 'unknown';

function hospitalSourceMeta(source=lastHospitalDataSource){
  if(source==='prototype') return { label:'병원 검색 · 프로토타입 API 데이터', detail:'현재 배포본의 API가 제공하는 데모 데이터셋입니다.' };
  if(source==='demo') return { label:'병원 검색 · 가이드 예시 데이터', detail:'핵심 데모의 안정적인 진행을 위한 예시 데이터입니다.' };
  if(source==='fallback') return { label:'병원 검색 · 오프라인 예시 데이터', detail:'API 응답이 없을 때 로컬 예시 데이터로 전환했습니다.' };
  if(source==='api') return { label:'병원 검색 · API 응답 데이터', detail:'병원 검색 API 응답을 표시합니다.' };
  return { label:'병원 검색 · 데이터 출처 확인 중', detail:'진료시간·접수 가능 여부 등 일부 상태는 화면 검증용 예시입니다.' };
}
function syncHospitalSourceUI(){
  const meta=hospitalSourceMeta();
  const note=document.getElementById('hospmap-source-note');
  if(note) note.innerHTML='<span class="dot" aria-hidden="true"></span><span><strong>'+esc(meta.label)+'</strong><br>'+esc(meta.detail)+' 진료시간·접수 가능 여부 등 일부 상태는 화면 검증용 예시입니다.</span>';
  const detail=document.getElementById('hd-data-note');
  if(detail) detail.textContent=meta.label+'입니다. 운영시간·의료진·후기 등 일부 상세 정보는 프로토타입용 예시 데이터입니다.';
}

function esc(s){
  return String(s??'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// 증상으로 검색하는 경우("당뇨","무릎","이명"…)에도 진료과가 잡히도록 매핑해 둔다.
// 이 매핑이 없으면 증상 검색이 0건이 되어 병원 목록으로 넘어가지 못한다.
const SYMPTOM_DEPT = {
  '내과':['당뇨','혈압','고혈압','혈당','감기','복통','소화','속쓰림','설사','콜레스테롤','건강검진','내시경'],
  '정형외과':['무릎','허리','어깨','관절','디스크','골절','통증','목디스크','손목'],
  '안과':['눈','시력','백내장','녹내장','노안','안구건조'],
  '이비인후과':['귀','코','목','이명','비염','어지럼','인후통','청력'],
  '피부':['피부','두드러기','습진','가려움','발진','탈모'],
  '신경':['치매','기억','두통','저림','마비','파킨슨'],
  '정신':['불면','우울','불안'],
  '비뇨':['소변','전립선','방광'],
  '산부인과':['생리','폐경','자궁'],
};
function detectDeptCode(q){
  for(const [kw,code] of Object.entries(DEPT_KEYWORDS)){
    if(q.includes(kw)) return code;
  }
  for(const [dept,words] of Object.entries(SYMPTOM_DEPT)){
    if(words.some(w=>q.includes(w))) return DEPT_KEYWORDS[dept] || '';
  }
  return '';
}

function searchHospitalsFallback({ qn='', qd='', numOfRows=10 }={}){
  let list=[...FALLBACK_HOSPITALS];
  if(qd){
    const kw=Object.entries(DEPT_KEYWORDS).find(([,c])=>c===qd)?.[0]||'';
    list=list.filter(h=>(h.dept||'').includes(kw));
  }else if(qn){
    list=list.filter(h=>h.name.includes(qn) || (h.dept||'').includes(qn) || qn.includes(h.dept||''));
  }
  return list.slice(0, numOfRows);
}

async function searchHospitals({ qn='', qd='', numOfRows=10 }={}){
  if(!HOSPITAL_API_BASE){
    lastHospitalDataSource='fallback';
    return searchHospitalsFallback({ qn, qd, numOfRows });
  }

  const params=new URLSearchParams({ numOfRows:String(numOfRows) });
  if(qn) params.set('qn', qn);
  if(qd) params.set('qd', qd);

  const controller=typeof AbortController!=='undefined' ? new AbortController() : null;
  const timeout=controller ? setTimeout(()=>controller.abort(),3500) : null;
  try{
    const res=await fetch(HOSPITAL_API_BASE+'?'+params.toString(), controller ? {signal:controller.signal} : undefined);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data=await res.json();
    if(!data || !Array.isArray(data.items)) throw new Error('invalid payload');
    lastHospitalDataSource=(data.source==='prototype') ? 'prototype' : 'api';
    return data.items;
  }catch(e){
    lastHospitalDataSource='fallback';
    return searchHospitalsFallback({ qn, qd, numOfRows });
  }finally{
    if(timeout) clearTimeout(timeout);
  }
}

function hospitalSub(h){
  const shortAddr=h.addr ? h.addr.split(' ').slice(0,3).join(' ') : '';
  return [h.dept||h.type, shortAddr].filter(Boolean).join(' · ') || h.addr || '주소 정보 없음';
}

// 진료과별 데모 태그 — 실제 병원 상세 데이터가 없으므로 진료과에서 파생시킨다(토큰 절약)
const DEPT_TAGS = {
  '내과':['당뇨관리','고혈압관리','정기검진','내시경'],
  '정형외과':['디스크','통증치료','도수치료','주사치료'],
  '이비인후과':['알레르기','이석증','청력검사'],
  '안과':['백내장','노안','정밀검진'],
  '피부':['피부질환','레이저','알레르기'],
  '정신':['상담치료','약물관리'],
  '산부인과':['정기검진','초음파'],
  '보건':['건강검진','예방접종'],
};
function hospitalTags(h){
  const dept=h.dept||h.type||'';
  for(const [kw,tags] of Object.entries(DEPT_TAGS)){
    if(dept.includes(kw)) return tags;
  }
  return ['전문의','주차장'];
}
function hospitalDistance(h){
  if(!h.lat || !h.lng) return '';
  const R=6371, lat1=MAP_HOME[0]*Math.PI/180, lat2=parseFloat(h.lat)*Math.PI/180;
  const dLat=(parseFloat(h.lat)-MAP_HOME[0])*Math.PI/180, dLng=(parseFloat(h.lng)-MAP_HOME[1])*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  const km=2*R*Math.asin(Math.sqrt(Math.max(0,a)));
  return km<1 ? Math.round(km*1000)+'m' : km.toFixed(1)+'km';
}

function renderSiItem(h, idx, highlight){
  // 치환문자열을 함수로 넘긴다. 문자열로 넘기면 검색어에 든 $&, $` 같은 패턴이
  // 특수 치환으로 해석돼 병원명이 깨진다.
  const nm=highlight && h.name.includes(highlight)
    ? esc(h.name).replace(esc(highlight), () => '<b>'+esc(highlight)+'</b>')
    : esc(h.name);
  const dist=hospitalDistance(h);
  const shortAddr=h.addr ? h.addr.split(' ').slice(0,3).join(' ') : '';
  const fastest = idx===0 ? '<div class="hosp-fast"><span>가장 빠른 진료실</span><b>바로 진료 가능</b></div>' : '';
  return `<div class="hosp-card" onclick="openHospDetail(${idx})">
    <div class="hosp-badges"><span class="hosp-badge">＋ 접수</span><span class="hosp-badge">＋ 예약</span></div>
    <div class="hosp-nm">${nm}</div>
    <div class="hosp-status"><span class="on">진료중</span> 09:00 ~ 18:00 <span class="dot">|</span> ${esc(h.dept||h.type||'')}</div>
    <div class="hosp-loc"><i class="fi fi-rr-marker"></i> ${dist?esc(dist)+' · ':''}${esc(shortAddr)}</div>
    <div class="hosp-tags">${esc(hospitalTags(h).join(' · '))}</div>
    ${fastest}
  </div>`;
}

async function loadNearbyHospitals(){
  const el=document.getElementById('si-nearby');
  if(!el) return;
  el.innerHTML='<div class="si-loading">불러오는 중…</div>';
  try{
    const list=await searchHospitals({ numOfRows:8 });
    hospitalCache=list;
    el.innerHTML=list.length
      ? list.map((h,i)=>renderSiItem(h,i)).join('')
      : '<div class="si-empty">주변 병원 정보가 없습니다</div>';
  }catch(e){
    el.innerHTML='<div class="si-empty">'+esc(e.message)+'</div>';
  }
}

// 최근 검색어 / 인기 검색어 (프로토타입이라 로컬 배열로만 관리)
let siRecents=['똑똑연세내과의원','당뇨','향남서울내과의원','정형외과'];
const SI_RANKS=[
  ['내과',0],['정형외과',1],['당뇨',-1],['건강검진',0],['향남연세내과',1],
  ['이비인후과',-1],['무릎',1],['안과',0],['치매',1],['혈압',-1],
];
function renderRecents(){
  const el=document.getElementById('si-recents');
  if(!el) return;
  el.innerHTML = siRecents.length ? siRecents.map((v,i)=>
    `<div class="si-row" onclick="doSearchDirect('${esc(v)}')">
      <span class="ic"><i class="fi fi-rr-clock"></i></span>
      <span class="tx">${esc(v)}</span>
      <span class="x" onclick="event.stopPropagation();removeRecent(${i})"><i class="fi fi-rr-cross-small"></i></span>
    </div>`).join('') : '<div class="si-empty">최근 검색어가 없습니다</div>';
}
function removeRecent(i){ siRecents.splice(i,1); renderRecents(); }
function clearRecents(){ siRecents=[]; renderRecents(); showToast('최근 검색어를 삭제했습니다'); }
function renderRanks(){
  const el=document.getElementById('si-rank');
  if(el) el.innerHTML=SI_RANKS.map(([nm,mv],i)=>
    `<div class="si-rk" onclick="doSearchDirect('${esc(nm)}')">
      <span class="n">${i+1}</span><span class="tx">${esc(nm)}</span>
      <span class="mv ${mv>0?'up':mv<0?'dn':''}">${mv>0?'▲':mv<0?'▼':'—'}</span>
    </div>`).join('');
  const t=document.getElementById('si-rank-time');
  if(t){
    const d=new Date();
    t.textContent=String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':00 기준';
  }
}

function openSearch(){
  goTo('s-searchinput');
  clearSi();
  renderRecents();
  renderRanks();
  // 타이핑→탭 전환: 텍스트 입력은 보조 수단이므로 자동 포커스를 주지 않는다
}

function clearSi(){
  const inp=document.getElementById('si-input');
  if(inp) inp.value='';
  siType();
}

function siType(){
  clearTimeout(siTimer);
  siTimer=setTimeout(siTypeFetch, 350);
}

async function siTypeFetch(){
  const v=document.getElementById('si-input').value.trim();
  const def=document.getElementById('si-default');
  const sug=document.getElementById('si-suggest');
  if(!v){ def.style.display=''; sug.style.display='none'; return; }
  def.style.display='none'; sug.style.display='';
  sug.innerHTML='<div class="si-loading">검색 중…</div>';
  try{
    const qd=detectDeptCode(v);
    const list=await searchHospitals({ qn:qd ? '' : v, qd, numOfRows:12 });
    hospitalCache=list;
    sug.innerHTML=list.length
      ? list.map((h,i)=>renderSiItem(h,i,v)).join('')
      : '<div class="si-empty">검색 결과가 없습니다</div>';
  }catch(e){
    sug.innerHTML='<div class="si-empty">'+esc(e.message)+'</div>';
  }
}

// "○○의원/○○병원"처럼 기관명으로 끝나면 병원 한 곳이 특정된 검색으로 본다.
// 반대로 "당뇨", "정형외과"처럼 진료과·증상이면 병원 목록(s-hospmap)을 먼저 보여준다.
const HOSP_NAME_SUFFIX=/(의원|병원|치과|한의원|보건소|보건지소|의료원|클리닉|메디컬센터)$/;
function looksLikeHospitalName(q){ return HOSP_NAME_SUFFIX.test(String(q).trim()); }

// 병원이 정해진 뒤의 공통 경로 — 해당 병원과 매칭되는 매니저 목록(s-search)으로 이동
function enterMgrSearch(hospital){
  if(!hospital) return;
  selectedHospital=hospital;
  renderStopList();                      // 검색바 도착지에 선택한 병원 반영
  updateHospitalMarkers(hospital);
  const visibleMgrIdx=updateSearchMgrList(hospital);
  pickMgr(visibleMgrIdx.length ? visibleMgrIdx[0] : -1);
  goTo('s-search');
}

async function doSearch(queryOrIdx){
  if(typeof queryOrIdx==='number'){       // 목록/핀에서 인덱스로 들어온 경우
    enterMgrSearch(hospitalCache[queryOrIdx]);
    return;
  }
  const q=queryOrIdx || document.getElementById('si-input')?.value.trim();
  if(!q) return;
  showToast('병원을 검색 중입니다…');
  try{
    // 병원명 검색은 이름으로, 그 외에는 진료과 코드로 조회한다
    const isName=looksLikeHospitalName(q);
    const qd=isName ? '' : detectDeptCode(q);
    const list=await searchHospitals({ qn:qd ? '' : q, qd, numOfRows:12 });
    hospitalCache=list;
    if(!list.length){ showToast('검색 결과가 없습니다'); return; }

    // 병원명이 정확히 일치하거나, 기관명 형태로 입력해 후보가 한 곳뿐이면 → 매니저 목록
    const exact=list.find(h=>h.name===q) || (isName && list.length===1 ? list[0] : null);
    if(exact){ enterMgrSearch(exact); return; }

    // 진료과·증상 검색이거나 병원이 특정되지 않으면 → 병원 목록
    openHospMap(list, q, qd);
  }catch(e){
    showToast(e.message);
  }
}
// 최근 검색 칩 전용 별칭 — 동작은 doSearch와 동일(모호한 검색은 항상 지도로 바로 이동한다)
function doSearchDirect(query){
  return doSearch(query);
}

// ── 병원 상세 (s-hosp) — 병원 카드 탭 시 진입 ──
// 프로토타입이라 상세 데이터가 없으므로 병원명·진료과에서 결정론적으로 파생시킨다
// (같은 병원은 항상 같은 값이 나오도록 이름 해시를 쓴다).
let detailHospital=null, hospDetailMap=null;
const HD_DAYS=['일','월','화','수','목','금','토'];
const HD_DOC_SURNAMES=['김','이','박','최','정','강'];
const HD_REVIEW_TEXTS=[
  '어르신 모시고 갔는데 설명을 천천히, 알아듣기 쉽게 해주셔서 좋았습니다.',
  '대기 시간이 짧고 접수도 금방 됐어요. 다음 진료 일정도 바로 잡아주셨습니다.',
  '검사 결과를 그림으로 보여주면서 설명해주셔서 이해가 잘 됐어요. 감사합니다.',
  '간호사분들도 친절하시고 병원이 깨끗합니다. 부모님 모시고 오기 좋아요.',
];
function hashStr(s){
  let h=0;
  for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0;
  return h;
}
function openHospDetail(idx){
  const h=hospitalCache[idx];
  if(!h) return;
  detailHospital=h;
  renderHospDetail(h);
  goTo('s-hosp');
  setTimeout(()=>{
    if(!hospDetailMap && typeof L!=='undefined'){ hospDetailMap=createMap('map-hosp', MAP_HOME); }
    if(hospDetailMap){
      hospDetailMap.invalidateSize();
      const pos=(h.lat&&h.lng) ? [parseFloat(h.lat), parseFloat(h.lng)] : MAP_HOME;
      hospDetailMap.setView(pos, 16);
    }
  },340);
}
function pickHdTab(el){
  el.parentElement.querySelectorAll('.hd-tab').forEach(t=>t.classList.remove('on'));
  el.classList.add('on');
  showToast(el.textContent+' 탭은 준비 중입니다');
}
function renderHospDetail(h){
  syncHospitalSourceUI();
  const seed=hashStr(h.name);
  const dept=h.dept||h.type||'의료기관';
  const rating=(4.4+(seed%6)/10).toFixed(1);
  const revCnt=60+(seed%240);
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.innerHTML=v; };

  set('hd-bar-nm', esc(h.name));
  set('hd-dept', esc(dept));
  set('hd-nm', esc(h.name));
  set('hd-loc', '<i class="fi fi-rr-marker"></i> '+[hospitalDistance(h), esc(h.addr||'')].filter(Boolean).join(' · '));
  set('hd-addr', esc(h.addr||'주소 정보 없음'));
  set('hd-rating', rating);
  set('hd-revcnt', '진료후기 '+revCnt+'개');
  set('hd-revcnt2', revCnt);
  set('hd-notice', esc(h.name.slice(0,10))+' 8월 진료 안내 — 8/15(광복절) 휴진, 토요일은 오후 1시까지 진료합니다.');

  // 외부 병원 사진을 임의로 꾸며 쓰지 않고, 실제 데이터 기반의 정보형 비주얼로 구성한다.
  set('hd-gallery', `
    <div class="g hd-visual hd-visual--main">
      <span class="hd-vicon" aria-hidden="true">🏥</span>
      <strong>${esc(h.name)}</strong>
      <span>${esc(dept)} · ${hospitalDistance(h)}</span>
      <span class="gc">병원 정보</span>
    </div>
    <div class="g hd-visual hd-visual--loc">
      <span class="hd-vicon" aria-hidden="true">📍</span>
      <strong>위치 안내</strong>
      <span>${esc(h.addr||'주소 정보 없음')}</span>
    </div>`);

  // 진료시간: 평일 09:00~18:00, 토 09:00~13:00, 일·공휴일 휴진 (오늘 강조)
  const today=new Date().getDay();
  const hours=[
    {d:'월~금', t:'09:00 ~ 18:00 (점심 13:00~14:00)', match:[1,2,3,4,5]},
    {d:'토요일', t:'09:00 ~ 13:00', match:[6]},
    {d:'일요일·공휴일', t:'휴진', match:[0], off:true},
  ];
  set('hd-hours', hours.map(r=>
    `<div class="hd-hr${r.match.includes(today)?' today':''}${r.off?' off':''}"><span class="d">${r.d}</span><span class="t">${r.t}</span></div>`
  ).join(''));
  const open = today>=1 && today<=6;
  set('hd-open', open?'진료중':'진료 종료');
  set('hd-lunch', open?'13:00 부터 점심시간':'다음 진료 '+HD_DAYS[(today+1)%7]+'요일 09:00');

  // 의료진 2~3명
  const docN=2+(seed%2);
  let docs='';
  for(let i=0;i<docN;i++){
    const sur=HD_DOC_SURNAMES[(seed+i)%HD_DOC_SURNAMES.length];
    docs+=`<div class="hd-doc">
      <div class="hd-doc-av">🧑‍⚕️</div>
      <div><div class="hd-doc-nm">${sur}○○ 원장</div>
      <div class="hd-doc-sub">${esc(dept)} 전문의 · ${8+((seed+i*3)%15)}년차</div></div>
    </div>`;
  }
  set('hd-docs', docs);

  // 진료후기 3개
  set('hd-revs', [0,1,2].map(i=>{
    const t=HD_REVIEW_TEXTS[(seed+i)%HD_REVIEW_TEXTS.length];
    return `<div class="hd-rev">
      <div class="hd-rev-top">${starIcons(5-(i%2)*0.5)}<span style="margin-left:4px">2026.0${6-i}.1${i+2} · 보호자</span></div>
      <div class="hd-rev-tx">${esc(t)}</div>
    </div>`;
  }).join(''));

  const sc=document.getElementById('hd-scroll'); if(sc) sc.scrollTop=0;
}
// 상세에서 접수/예약 → 이 병원에 동행 가능한 매니저 목록으로
function bookHospital(kind){
  if(!detailHospital) return;
  showToast(detailHospital.name+' '+kind+'을 진행합니다');
  enterMgrSearch(detailHospital);
}

// ── 진료과 검색: 병원 지도+리스트 (s-hospmap) ──
const DEPT_GRID_LIST = ['전체','소아청소년과','내과','이비인후과','정형외과','가정의학과','외과','피부과','산부인과'];
function openHospMap(list, query, deptCode){
  hospitalCache=list;
  const q=document.getElementById('hospmap-query'); if(q) q.textContent=query||'검색결과';
  const deptLabel=Object.entries(DEPT_KEYWORDS).find(([,c])=>c===deptCode)?.[0] || (query||'전체');
  const dt=document.getElementById('hospmap-dept-txt'); if(dt) dt.textContent=deptLabel;
  renderHospMapList(list);
  syncHospitalSourceUI();
  goTo('s-hospmap');
  setTimeout(()=>{
    if(!hospMap && typeof L!=='undefined'){ hospMap=createMap('map-hospmap', MAP_HOME); }
    if(hospMap){ hospMap.invalidateSize(); renderHospMapPins(list); }
  },320);
}
function renderHospMapList(list){
  const el=document.getElementById('hospmap-list');
  if(el) el.innerHTML = list.length ? list.map((h,i)=>renderSiItem(h,i,'')).join('') : '<div class="si-empty">검색 결과가 없습니다</div>';
}
function renderHospMapPins(list){
  if(!hospMap) return;
  hospMapPins.forEach(m=>hospMap.removeLayer(m));
  hospMapPins=[];
  const bounds=[];
  list.forEach((h,i)=>{
    if(!h.lat || !h.lng) return;
    const pos=[parseFloat(h.lat), parseFloat(h.lng)];
    bounds.push(pos);
    const m=L.marker(pos,{ icon:L.divIcon({ className:'', html:'<div class="hosp-map-pin"><i class="fi fi-rr-plus"></i></div>', iconSize:[28,28], iconAnchor:[14,14] }) })
      .addTo(hospMap).on('click', ()=>openHospDetail(i));
    hospMapPins.push(m);
  });
  if(bounds.length) hospMap.fitBounds(L.latLngBounds(bounds), { padding:[50,90] });
  else hospMap.setView(MAP_HOME, 14);
}
function toggleHospmapSheet(){
  const sheet=document.getElementById('hospmap-sheet');
  if(!sheet) return;
  sheet.classList.toggle('expanded');
  if(hospMap) setTimeout(()=>hospMap.invalidateSize(), 300);
}
function openDeptSheet(){ renderDeptGrid(); openModal('modal-dept'); }
function renderDeptGrid(){
  const el=document.getElementById('dept-grid');
  if(!el) return;
  const cur=document.getElementById('hospmap-dept-txt')?.textContent;
  el.innerHTML = DEPT_GRID_LIST.map(d=>'<div class="dept-btn'+(d===cur?' on':'')+'" onclick="pickDept(\''+d+'\')">'+d+'</div>').join('');
}
async function pickDept(label){
  const dt=document.getElementById('hospmap-dept-txt'); if(dt) dt.textContent=label;
  closeModal('modal-dept');
  showToast(label+'로 필터링합니다');
  try{
    const qd = label==='전체' ? '' : detectDeptCode(label);
    const list=await searchHospitals({ qd, numOfRows:12 });
    hospitalCache=list;
    renderHospMapList(list);
    renderHospMapPins(list);
    syncHospitalSourceUI();
  }catch(e){ showToast(e.message); }
}

// ── 검색 (레거시 칩 — API 검색으로 연결)
// ── 매니저 프로필 (이미지2) ──
// 동행 매니저 마스터 데이터.
// 인덱스는 병원 mgrIds·카드 id(hc*/mgr*)·지도 핀 id(search-pin-*)의 공통 키이므로 순서를 바꾸지 않는다.
// photo는 mgr/ 폴더의 128px 썸네일(원본 1~11.jpg를 정사각 크롭·축소한 것).
const MGRS=[
  {nm:'김민준',sex:'남',emoji:'🧑‍⚕️',photo:'mgr/1.webp',lv:'요양보호사 1급',cred:'요양보호사 1급 · 동행 5년차',
   rating:4.9,count:127,walk:8,price:30000,
   hashtags:['#당뇨고혈압동행','#휠체어보행보조','#처방약수령'],
   intro:'어르신을 편안하게 모시는 따뜻한 동행 매니저입니다.',
   cardIntro:'어르신을 편안하게 모시는 따뜻한 동행, 5년째 한결같이 함께합니다.',
   certs:['요양보호사 1급','심폐소생술(CPR)','모시고 기본교육','신원조회·범죄경력조회 완료'],
   exp:['당뇨·고혈압 어르신 정기 병원 동행','휠체어 이동 및 보행 보조','처방약 수령 및 복약 안내'],
   para:'부모님을 대신 모시는 마음으로 시작했습니다. 진료 내용을 꼼꼼히 기록해 보호자님께 안심을 드리고 싶습니다.'},
  {nm:'이수연',sex:'여',emoji:'👩‍⚕️',photo:'mgr/4.webp',lv:'사회복지사 자격',cred:'사회복지사 2급 · 동행 3년차',
   rating:4.7,count:84,walk:12,price:30000,
   hashtags:['#정기검진재활동행','#치매케어','#정서케어'],
   intro:'세심하게 마음까지 살피는 동행 매니저입니다.',
   cardIntro:'세심하게 마음까지 살피는 동행, 정서적 안정까지 함께 챙깁니다.',
   certs:['사회복지사 2급','심폐소생술(CPR)','모시고 기본교육','신원조회·범죄경력조회 완료'],
   exp:['정기검진·재활 병원 동행','접수·수납 대행','진료 상담 동석 및 메모'],
   para:'어르신의 이야기를 잘 들어드리는 것이 가장 중요하다고 생각합니다. 편안한 하루를 만들어 드릴게요.'},
  {nm:'박성호',sex:'남',emoji:'🧑‍⚕️',photo:'mgr/2.webp',lv:'간호조무사 자격',cred:'간호조무사 · 동행 2년차',
   rating:4.6,count:51,walk:6,price:30000,
   hashtags:['#이동보조','#응급대응교육','#대중교통동행'],
   intro:'든든하게 곁을 지키는 동행 매니저입니다.',
   cardIntro:'든든하게 곁을 지키는 동행, 이동이 불편하신 분도 안심하고 맡겨주세요.',
   certs:['간호조무사','심폐소생술(CPR)','모시고 기본교육','신원조회·범죄경력조회 완료'],
   exp:['거동 불편 어르신 이동 보조','응급 상황 대응 교육 이수','병원 예약·접수 대행'],
   para:'안전한 이동을 최우선으로 생각합니다. 작은 부분까지 살피며 동행하겠습니다.'},
  {nm:'정우진',sex:'남',emoji:'🧑‍⚕️',photo:'mgr/3.webp',lv:'요양보호사 1급',cred:'요양보호사 1급 · 동행 4년차',
   rating:4.8,count:96,walk:9,price:32000,
   hashtags:['#정형외과동행','#재활치료동행','#차량보유'],
   intro:'재활·정형외과 동행 경험이 많은 매니저입니다.',
   cardIntro:'재활 치료 동행에 익숙합니다, 치료 일정까지 함께 챙겨드려요.',
   certs:['요양보호사 1급','심폐소생술(CPR)','모시고 기본교육','신원조회·범죄경력조회 완료'],
   exp:['정형외과·재활의학과 정기 동행','보조기 착용 보조','물리치료 일정 관리'],
   para:'재활은 꾸준함이 가장 중요합니다. 어르신이 지치지 않게 곁에서 힘이 되어드리겠습니다.'},
  {nm:'한지민',sex:'여',emoji:'👩‍⚕️',photo:'mgr/5.webp',lv:'간호조무사 자격',cred:'간호조무사 · 동행 3년차',
   rating:4.9,count:112,walk:5,price:31000,
   hashtags:['#내과정기검진','#복약관리','#혈당관리'],
   intro:'만성질환 관리 동행에 강한 매니저입니다.',
   cardIntro:'만성질환 정기 진료 동행, 복약과 수치까지 기록해 드립니다.',
   certs:['간호조무사','심폐소생술(CPR)','모시고 기본교육','신원조회·범죄경력조회 완료'],
   exp:['당뇨·고혈압 정기 검진 동행','혈당·혈압 기록 관리','처방 변경 사항 보호자 공유'],
   para:'수치 하나하나가 어르신의 하루입니다. 빠짐없이 기록해 보호자님께 전해드립니다.'},
  {nm:'최유나',sex:'여',emoji:'👩‍⚕️',photo:'mgr/6.webp',lv:'사회복지사 자격',cred:'사회복지사 1급 · 동행 6년차',
   rating:5.0,count:203,walk:14,price:35000,
   hashtags:['#치매케어','#장기요양상담','#보호자상담'],
   intro:'치매 어르신 동행 경험이 가장 많은 매니저입니다.',
   cardIntro:'치매 어르신 동행 6년, 보호자 상담까지 함께 도와드립니다.',
   certs:['사회복지사 1급','치매전문교육 수료','심폐소생술(CPR)','신원조회·범죄경력조회 완료'],
   exp:['치매안심센터·신경과 동행','장기요양등급 신청 상담','보호자 면담 동석'],
   para:'어르신의 속도에 맞추는 것이 제 일입니다. 서두르지 않고 끝까지 함께하겠습니다.'},
  {nm:'서예린',sex:'여',emoji:'👩‍⚕️',photo:'mgr/7.webp',lv:'요양보호사 1급',cred:'요양보호사 1급 · 동행 2년차',
   rating:4.7,count:63,walk:11,price:29000,
   hashtags:['#안과이비인후과','#검사동행','#수납대행'],
   intro:'검사 많은 진료과 동행에 익숙한 매니저입니다.',
   cardIntro:'검사가 많은 날도 순서대로 차분히 안내해 드립니다.',
   certs:['요양보호사 1급','심폐소생술(CPR)','모시고 기본교육','신원조회·범죄경력조회 완료'],
   exp:['안과·이비인후과 검사 동행','검사 순서 안내 및 대기 동행','수납·서류 발급 대행'],
   para:'낯선 검사실 앞에서 혼자 기다리시지 않도록, 끝까지 옆에 있겠습니다.'},
  {nm:'강소희',sex:'여',emoji:'👩‍⚕️',photo:'mgr/8.webp',lv:'간호조무사 자격',cred:'간호조무사 · 동행 4년차',
   rating:4.8,count:141,walk:7,price:33000,
   hashtags:['#휠체어보행보조','#차량보유','#거동불편'],
   intro:'거동이 불편한 어르신 이동을 전담하는 매니저입니다.',
   cardIntro:'휠체어 이동 전담, 차량 보유로 문 앞까지 모십니다.',
   certs:['간호조무사','휠체어 이동 보조 교육','심폐소생술(CPR)','신원조회·범죄경력조회 완료'],
   exp:['휠체어·보행기 이동 보조','차량 승하차 보조','장애인 콜택시 예약 대행'],
   para:'이동이 어려워 진료를 미루지 않으셨으면 합니다. 문 앞부터 진료실까지 책임지겠습니다.'},
  {nm:'임하늘',sex:'여',emoji:'👩‍⚕️',photo:'mgr/9.webp',lv:'사회복지사 자격',cred:'사회복지사 2급 · 동행 1년차',
   rating:4.6,count:28,walk:16,price:28000,
   hashtags:['#첫동행할인','#정서케어','#말벗동행'],
   intro:'차분하게 말벗이 되어드리는 신입 매니저입니다.',
   cardIntro:'첫 동행 할인 중, 천천히 말벗이 되어드립니다.',
   certs:['사회복지사 2급','심폐소생술(CPR)','모시고 기본교육','신원조회·범죄경력조회 완료'],
   exp:['내과 정기 진료 동행','대기 시간 말벗','진료 내용 메모 전달'],
   para:'아직 경력은 짧지만, 어르신 이야기를 가장 오래 들어드리는 매니저가 되고 싶습니다.'},
  {nm:'윤채원',sex:'여',emoji:'👩‍⚕️',photo:'mgr/10.webp',lv:'요양보호사 1급',cred:'요양보호사 1급 · 동행 7년차',
   rating:4.9,count:256,walk:10,price:36000,
   hashtags:['#재방문多','#산부인과','#여성어르신전담'],
   intro:'재방문 요청이 가장 많은 베테랑 매니저입니다.',
   cardIntro:'재방문 요청 1위, 한 번 만난 어르신을 오래 모십니다.',
   certs:['요양보호사 1급','노인심리상담 수료','심폐소생술(CPR)','신원조회·범죄경력조회 완료'],
   exp:['여성 어르신 전담 동행','산부인과·내과 정기 검진','장기 정기 동행 관리'],
   para:'같은 어르신을 오래 모시다 보면 작은 변화가 보입니다. 그 변화를 놓치지 않겠습니다.'},
  {nm:'오다은',sex:'여',emoji:'👩‍⚕️',photo:'mgr/11.webp',lv:'간호조무사 자격',cred:'간호조무사 · 동행 3년차',
   rating:4.8,count:88,walk:13,price:31000,
   hashtags:['#피부과','#처방약수령','#당일예약'],
   intro:'당일 예약도 유연하게 받는 매니저입니다.',
   cardIntro:'당일 예약 가능, 급하게 병원 가셔야 할 때 찾아주세요.',
   certs:['간호조무사','심폐소생술(CPR)','모시고 기본교육','신원조회·범죄경력조회 완료'],
   exp:['피부과·내과 당일 진료 동행','처방약 수령 대행','응급 외래 동행'],
   para:'갑자기 아프신 날이 가장 막막합니다. 그런 날 바로 달려가는 매니저이고 싶습니다.'}
];
// ★ 5개를 평점만큼 채워서 렌더 (4.7 → 꽉 찬 별 4 + 반별 1)
function starIcons(rating){
  let out='';
  for(let i=1;i<=5;i++){
    const cls = rating >= i-0.25 ? 'fi-sr-star' : (rating >= i-0.75 ? 'fi-rr-star-sharp-half-stroke' : 'fi-rr-star');
    out += '<i class="fi '+cls+'"></i>';
  }
  return out;
}
function starText(rating){
  const full=Math.floor(rating+0.25);
  return '★'.repeat(full)+'☆'.repeat(5-full);
}

// s-search 매니저 카드 — 배지는 updateSearchMgrList가 병원별로 다시 붙인다
function renderSearchMgrCards(){
  const el=document.getElementById('nv-card-list');
  if(!el) return;
  el.innerHTML=MGRS.map((m,i)=>`
    <div class="nv-card" id="hc${i}" onclick="tapSearchCard(${i})">
      <button class="nv-heart" onclick="event.stopPropagation();this.classList.toggle('on');this.querySelector('i').className='fi '+(this.classList.contains('on')?'fi-sr-heart':'fi-rr-heart');showToast(this.classList.contains('on')?'찜했습니다':'찜을 취소했습니다')"><i class="fi fi-rr-heart"></i></button>
      <div class="nv-card-row">
        <div class="nv-ava"><img src="${esc(m.photo)}" alt="${esc(m.nm)} 매니저">${i<2?'<span class="dot"></span>':''}</div>
        <div class="nv-card-info">
          <div class="nv-card-nm">${esc(m.nm)} 매니저 <span class="nv-card-dist">도보 ${m.walk}분</span></div>
          <div class="nv-card-stars">${starIcons(m.rating)}<span class="nv-card-rt">${m.rating}</span><span class="nv-card-cnt">동행 ${m.count}회</span></div>
        </div>
      </div>
      <div class="nv-price-row">
        <span class="nv-price-label"><i class="fi fi-rr-comment-alt"></i> 기본 동행</span>
        <span class="nv-price">${m.price.toLocaleString()}원~</span>
      </div>
      <button class="nv-book-btn" onclick="event.stopPropagation();bookMgrFromCard(${i})">예약하기</button>
    </div>`).join('');
}

// s-map 매니저 카드 — data-* 속성은 sortMgrCards의 정렬 키
function renderMapMgrCards(){
  const el=document.getElementById('mgr-card-list');
  if(!el) return;
  el.innerHTML=MGRS.map((m,i)=>`
    <div class="mgr-card${i===0?' on':''}" id="mgr${i}" onclick="openMgr(${i})" data-walk="${m.walk}" data-rating="${m.rating}" data-count="${m.count}">
      <div class="mgr-avatar"><img src="${esc(m.photo)}" alt="${esc(m.nm)} 매니저"></div>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="mgr-name">${esc(m.nm)} 매니저</div>
          ${i===0?'<span class="badge teal">★ AI 추천</span>':`<span class="badge gray">도보 ${m.walk}분</span>`}
        </div>
        <div class="mgr-meta">${i===0?`도보 ${m.walk}분 · `:''}${esc(m.cred.split(' · ')[0])}</div>
        <div class="mgr-star">${starText(m.rating)} ${m.rating} · 동행 ${m.count}회</div>
      </div>
    </div>`).join('');
}

// ── 매니저 프로필: 아래 파생 데이터는 전부 MGRS의 기존 필드(rating·count·exp·hashtags·cred)에서
// 계산해서 만든다. 매니저 11명 각각에 새 필드를 손으로 채우는 대신, 있는 데이터로 그럴듯한
// 프로필 섹션(레이더차트·환자상태 태그·한줄평)을 구성한다.
function mgrAge(m){
  const y=parseInt((m.cred.match(/(\d+)년차/)||[])[1]||'3',10);
  return 24 + y*2;
}
function mgrTraits(m, idx){
  const cl=(v,a,b)=>Math.max(a,Math.min(b,Math.round(v)));
  return [
    cl(60+m.rating*7, 60, 99),
    cl(58+m.rating*8, 55, 99),
    cl(50+Math.min(m.count/3,40), 50, 98),
    cl(65+((idx*7)%22), 60, 95),
    cl(45+Math.min(m.count/2.2,50), 45, 99),
  ];
}
const PATIENT_TAGS=[
  {label:'치매·인지저하', kw:['치매','인지']},
  {label:'거동 불편',     kw:['거동','휠체어','부축','이동 보조']},
  {label:'편마비',        kw:['마비']},
  {label:'만성질환 관리', kw:['당뇨','혈압','만성']},
  {label:'정서 불안',     kw:['정서','불안']},
  {label:'시청각 저하',   kw:['시각','청각','안과','이비인후과']},
  {label:'낙상 위험',     kw:['낙상','보행','휠체어']},
  {label:'처방약 관리',   kw:['처방','복약']},
];
function mgrPatientTags(m){
  const text=m.hashtags.join(' ')+' '+m.exp.join(' ')+' '+m.cred+' '+m.intro;
  return PATIENT_TAGS.map(t=>{
    const has=t.kw.some(k=>text.includes(k));
    return { label:t.label, count: has ? Math.max(1, Math.round(m.count*0.12)) : 0 };
  });
}
const REVIEW_DATES=['2026.06.18','2026.05.21','2026.04.09'];
function mgrReviews(m){
  return m.exp.slice(0,2).map((e,i)=>({
    date:REVIEW_DATES[i%REVIEW_DATES.length],
    text:'어르신 '+e+' 부분을 정말 꼼꼼히 챙겨주셨어요. 다음에도 꼭 다시 부탁드리고 싶습니다. 감사합니다!'
  }));
}
// 레이더차트: CSS 변수를 SVG 속성에 그대로 써서(fill="var(--coral)") 라이트/다크 대응까지 재사용한다
function radarSvg(values, labels){
  const cx=100, cy=92, R=64;
  const pt=(r,i)=>{ const a=(-90+i*72)*Math.PI/180; return [cx+r*Math.cos(a), cy+r*Math.sin(a)]; };
  let svg='<svg viewBox="0 0 200 190" style="width:100%;max-width:260px;display:block;margin:4px auto">';
  [0.33,0.66,1].forEach(lv=>{
    svg+='<polygon points="'+[0,1,2,3,4].map(i=>pt(R*lv,i).join(',')).join(' ')+'" fill="none" stroke="var(--border)" stroke-width="1"/>';
  });
  [0,1,2,3,4].forEach(i=>{
    const [x,y]=pt(R,i);
    svg+='<line x1="'+cx+'" y1="'+cy+'" x2="'+x+'" y2="'+y+'" stroke="var(--border)" stroke-width="1"/>';
  });
  const dataPts=[0,1,2,3,4].map(i=>pt(R*Math.max(0.1,values[i]/100),i).join(',')).join(' ');
  svg+='<polygon points="'+dataPts+'" fill="var(--coral-l)" stroke="var(--coral)" stroke-width="2" opacity=".9"/>';
  [0,1,2,3,4].forEach(i=>{
    const [x,y]=pt(R+20,i);
    svg+='<text x="'+x+'" y="'+y+'" font-size="10" fill="var(--g600)" text-anchor="middle" dominant-baseline="middle">'+esc(labels[i])+'</text>';
  });
  return svg+'</svg>';
}

// 화면 진입(goTo) 없이 프로필 DOM만 채운다. 초기 로드 시 미리 채워두지 않으면
// 카드를 탭하지 않고 화면 점(dots)으로 바로 s-mgr에 들어갔을 때 내용이 텅 비어 보인다.
function renderMgrProfile(idx){
  const m=MGRS[idx];
  const photo=document.getElementById('mgr-p-photo');
  if(photo){ photo.src=m.photo; photo.alt=m.nm+' 매니저 사진'; }
  document.getElementById('mgr-p-name').textContent=m.nm;
  document.getElementById('mgr-p-age').textContent=mgrAge(m)+'세';
  document.getElementById('mgr-p-sex').textContent=m.sex+'성';
  document.getElementById('mgr-p-lv').textContent=m.lv;

  const cancel=Math.max(0, Math.round(m.count*0.03));
  document.getElementById('mgr-p-activity').innerHTML=
    '<div><span>완료</span><b style="color:var(--teal)">✓ '+m.count+'건</b></div>'
    +'<div><span>취소</span><b style="color:var(--coral)">✕ '+cancel+'건</b></div>'
    +'<div><span>사고</span><b style="color:var(--g900)">⚡ 없음</b></div>';

  document.getElementById('mgr-p-price').textContent=money(m.price);
  document.getElementById('mgr-p-msg').textContent='"'+m.intro+'"';
  document.getElementById('mgr-p-para').textContent=m.para;
  document.getElementById('mgr-p-certcount').innerHTML='총 자격증 수 <b style="color:var(--g900)">'+m.certs.length+'개</b>';
  document.getElementById('mgr-p-certs').innerHTML=m.certs.map(c=>'<div class="cert"><i class="fi fi-rr-check"></i>'+esc(c)+'</div>').join('');
  document.getElementById('mgr-p-exp').innerHTML=m.exp.map(e=>'<div class="exp-item">'+esc(e)+'</div>').join('');
  document.getElementById('mgr-p-radar').innerHTML=radarSvg(mgrTraits(m,idx), ['책임감','친절성','소통능력','위생의식','능숙도']);

  document.getElementById('mgr-p-track').innerHTML=
    '<div class="mgr-sec-lbl">모시고에서 완료한 총 동행 횟수</div>'
    +'<div style="font-size:22px;font-weight:600;color:var(--g900);margin:4px 0 12px">'+m.count+'건</div>'
    +'<div class="mgr-activity3"><div><span>완료</span><b style="color:var(--teal)">✓ '+m.count+'건</b></div><div><span>취소</span><b style="color:var(--coral)">✕ '+cancel+'건</b></div><div><span>사고</span><b>⚡ 없음</b></div></div>';

  const tags=mgrPatientTags(m);
  document.getElementById('mgr-p-patients').textContent='총 '+m.count+'명';
  document.getElementById('mgr-p-tags').innerHTML=tags.map(t=>
    '<div class="tag-circle'+(t.count>0?' has':'')+'"><div class="tag-circle-n">+'+t.count+'</div><div class="tag-circle-lbl">'+esc(t.label)+'</div></div>').join('');

  const reviews=mgrReviews(m);
  document.getElementById('mgr-p-revcount').textContent='총 한줄평 '+reviews.length+'개';
  document.getElementById('mgr-p-reviews').innerHTML=reviews.map(r=>
    '<div class="review-card"><div class="review-top"><span class="review-star">★ '+m.rating+'</span><span class="review-cat">동행</span><span class="review-date">'+r.date+'</span></div><div class="review-txt">'+esc(r.text)+'</div></div>').join('');

  document.getElementById('mgr-p-btn').textContent=m.nm+' 매니저로 접수하기';
}
function openMgr(idx){
  renderMgrProfile(idx);
  pickMgr(idx);
  goTo('s-mgr');
}

// 진료대상 선택 (이미지1)
// 진료대상 목록 — modal-target(접수 화면)과 s-target(1단계 전체화면)이 같은 데이터를 쓴다
// photo는 나중에 실제 프로필 이미지 경로로 채운다. 비어 있으면 회색 라운드 플레이스홀더만 보인다.
const TARGETS = [
  { photo:'', nm:'아버지', sub:'이순자 · 74세', badge:'' },
  { photo:'', nm:'어머니', sub:'박말순 · 71세', badge:'' },
  { photo:'', nm:'본인',   sub:'김현수 · 46세', badge:'가족' },
];
let selectedTargetIdx = 0;

function targetRowHtml(t,i){
  return '<div class="target-row'+(i===selectedTargetIdx?' on':'')+'" onclick="pickTargetIdx('+i+')">'
    +'<div class="target-av ph">'+(t.photo?'<img src="'+esc(t.photo)+'" alt="'+esc(t.nm)+'">':'')+'</div>'
    +'<div class="target-nm">'+esc(t.nm)+' <span class="target-sub">'+esc(t.sub)+'</span>'+(t.badge?'<span class="target-fam-badge">'+esc(t.badge)+'</span>':'')+'</div>'
    +'<span class="target-ck"><i class="fi fi-rr-check"></i></span>'
    +'</div>';
}
function renderTargetLists(){
  const html = TARGETS.map(targetRowHtml).join('');
  const a=document.getElementById('modal-target-list'); if(a) a.innerHTML=html;
  const c=document.getElementById('date-target-list'); if(c) c.innerHTML=html;
}
function pickTargetIdx(i){
  selectedTargetIdx=i;
  renderTargetLists();
  const t=TARGETS[i];
  const val=t.nm+' ('+t.sub.replace(' · ',', ')+')';
  const cm=document.getElementById('confirm-target');
  if(cm) cm.innerHTML=val+' <span style="font-size:11px">›</span>';
  setTimeout(()=>closeModal('modal-target'),200);
}

// 접수하기 진입점 — 0단계(신청 전 안내)부터 시작한다
function startBooking(){
  renderTargetLists();
  updateConfirmRouteMeta();
  goTo('s-notice');
}
// 결제수단 — 배민 결제 화면처럼 시트가 아니라 인라인 라디오 목록으로 보여준다.
const PAY_METHODS = [
  { emoji:'💛', nm:'카카오페이' },
  { emoji:'🔵', nm:'토스' },
  { emoji:'💳', nm:'신용카드' },
];
let selectedPayIdx = 0;

function renderPayList(){
  const el=document.getElementById('pay-list');
  if(!el) return;
  el.innerHTML = PAY_METHODS.map((p,i)=>
    '<div class="pay-row'+(i===selectedPayIdx?' on':'')+'" onclick="pickPay('+i+')">'
    +'<span class="pay-radio"></span>'
    +'<span class="pay-emoji">'+p.emoji+'</span>'
    +'<span class="pay-nm">'+esc(p.nm)+'</span>'
    +'</div>').join('');
}
function pickPay(i){ selectedPayIdx=i; renderPayList(); }

// 매니저에게 앱으로 미리 공유하는 내용 — 전달 여부만 체크하면 되는 항목만 남긴다
// (증상 변화·질문 리스트는 아래 매니저 요청사항과 같은 방식의 입력창으로 옮겼다)
const SHARE_ITEMS = [
  { t:'기본 병력 및 약물 리스트', s:'병원 방문 전 진료 내역 및 건강검진표 전달 여부' },
];
let sharedChecked = [true];
function renderShareList(){
  const el=document.getElementById('share-list');
  if(!el) return;
  el.innerHTML = SHARE_ITEMS.map((it,i)=>
    '<div class="agree-item'+(sharedChecked[i]?' checked':'')+'" onclick="toggleShare('+i+')">'
    +'<div class="agree-item-check">'+(sharedChecked[i]?'✓':'')+'</div>'
    +'<div class="agree-item-body"><div class="agree-item-title">'+esc(it.t)+'</div><div class="agree-item-sub">'+esc(it.s)+'</div></div>'
    +'</div>').join('');
}
function toggleShare(i){
  sharedChecked[i]=!sharedChecked[i];
  renderShareList();
}

// 매니저 요청사항 — "요청사항 없음 ⌄" 박스를 탭하면 선택 시트가 열린다. "기타"를 고르면 직접 입력창이 열린다.
const REQUEST_OPTS = ['이동 시 부축이 필요해요','천천히 이동해주세요','친절하게 설명해주세요','진료실까지 함께 들어가 주세요','기타'];
let requestChecked = [false,false,false,false,false];

function openReqSheet(){
  renderReqList();
  openModal('modal-req');
}
function renderReqList(){
  const el=document.getElementById('modal-req-list');
  if(el){
    el.innerHTML = REQUEST_OPTS.map((t,i)=>
      '<div class="agree-item'+(requestChecked[i]?' checked':'')+'" onclick="toggleRequest('+i+')">'
      +'<div class="agree-item-check">'+(requestChecked[i]?'✓':'')+'</div>'
      +'<div class="agree-item-body"><div class="agree-item-title">'+esc(t)+'</div></div>'
      +'</div>').join('');
  }
  const picked = REQUEST_OPTS.filter((t,i)=>requestChecked[i]);
  const txt=document.getElementById('req-select-text');
  if(txt){ txt.textContent = picked.length ? picked.join(', ') : '요청사항 없음'; txt.style.color = picked.length ? 'var(--g900)' : 'var(--g400)'; }
}
function toggleRequest(i){
  requestChecked[i]=!requestChecked[i];
  renderReqList();
  const etcInput=document.getElementById('confirm-note');
  if(etcInput) etcInput.style.display = requestChecked[REQUEST_OPTS.length-1] ? '' : 'none';
}

// 진단명 (선택) — 동행 경로 카드의 "진단명" 행에도 실시간으로 반영한다
let confirmDx = '';
function onConfirmDxInput(v){
  confirmDx=v;
  updateConfirmRouteMeta();
}
// 동행 경로 카드의 "간병시간"·"진단명" 행을 최신 값으로 갱신
function updateConfirmRouteMeta(){
  const dxEl=document.getElementById('confirm-dx-display');
  if(dxEl) dxEl.textContent = confirmDx.trim() || '진단명 없음';
  const durEl=document.getElementById('confirm-duration');
  if(durEl) durEl.textContent = dsSelectedDuration+'시간';
}

// 진료 내용 전달 방식 — 배민 "수저·포크 안 받기" 체크박스 쌍과 같은 자리·같은 디자인
const FEEDBACK_OPTS = ['통화로 진료 내용 받기','도착 후 연락 주기'];
let feedbackChecked = [true,false];
function renderFeedbackPair(){
  const el=document.getElementById('feedback-pair');
  if(!el) return;
  el.innerHTML = FEEDBACK_OPTS.map((t,i)=>
    '<label class="check-opt'+(feedbackChecked[i]?' on':'')+'" onclick="toggleFeedback('+i+')"><span class="chk-box"></span>'+esc(t)+'</label>').join('');
}
function toggleFeedback(i){
  feedbackChecked[i]=!feedbackChecked[i];
  renderFeedbackPair();
}

// 동행 방법 — 시간 단위 대신 이동 방식에 따른 정액 요금
const TRANSPORT_MODES = [
  { nm:'차량 동행', eta:'20~30분 후 도착', price:45000 },
  { nm:'알뜰 동행', eta:'40~50분 후 도착', price:30000 },
];
let selectedModeIdx = 0;
function renderModeList(){
  const el=document.getElementById('mode-list');
  if(!el) return;
  el.innerHTML = TRANSPORT_MODES.map((m,i)=>
    '<div class="mode-card'+(i===selectedModeIdx?' on':'')+'" onclick="pickMode('+i+')">'
    +'<div><div class="mode-nm">'+esc(m.nm)+'</div><div class="mode-eta">'+esc(m.eta)+'</div></div>'
    +'<div class="mode-price">'+money(m.price)+'</div>'
    +'</div>').join('');
}
function pickMode(i){
  selectedModeIdx=i;
  renderModeList();
  renderCost();
}

// ── s-search: 날짜·시간 바텀시트 (타이핑→탭/칩 전환) ──
let dsSelectedDate='오늘';
let dsSelectedTime='10:00';
// ── 전체 화면 시트 공통 ──
function openSheetFull(id){
  const el=document.getElementById(id);
  if(!el) return;
  el.classList.add('show');
  const body=el.querySelector('.sf-body'); if(body) body.scrollTop=0;   // 열 때마다 맨 위부터
}
function closeSheetFull(id){ document.getElementById(id)?.classList.remove('show'); }

// ── 전체 필터 시트 (캐치테이블 필터 참고) ──
// 탭 = 필터 카테고리, 각 탭 안에 그룹별 칩. 고른 값은 하단 바에 태그로 쌓인다.
const FILTER_TABS=[
  { nm:'매니저 조건', groups:[
    { h:'인기 조건', items:['동행 가능','예약 가능','평점 4.5+','재방문 많음','당일 예약'] },
    { h:'자격별',   items:['요양보호사 1급','간호조무사','사회복지사','심폐소생술(CPR)','치매전문교육'] },
    { h:'돌봄별',   items:['휠체어 보조','보행 보조','처방약 수령','수납 대행','말벗 동행','정서 케어'] },
  ]},
  { nm:'성별·연령', groups:[
    { h:'우대 성별', items:['무관','여성 매니저','남성 매니저'] },
    { h:'경력',     items:['1년 이상','3년 이상','5년 이상','7년 이상'] },
  ]},
  { nm:'가격', groups:[
    { h:'기본 동행료', items:['3만원 이하','3~3.5만원','3.5~4만원','4만원 이상'] },
  ]},
  { nm:'이동 수단', groups:[
    { h:'이동', items:['차량 보유','도보 동행','대중교통 동행','장애인 콜택시 대행'] },
    { h:'거리', items:['도보 5분 이내','도보 10분 이내','도보 15분 이내'] },
  ]},
];
let filterTabIdx=0;
let pickedFilters=[];

// tabIdx를 넘기면 해당 필터 탭이 선택된 채로 열린다(지도 위 pill과 1:1 대응)
function openFilterSheet(tabIdx){
  filterTabIdx = Number.isInteger(tabIdx) ? tabIdx : 0;
  renderFilterTabs();
  renderFilterGroups();
  renderPickedFilters();
  openSheetFull('sheet-filter');
}
function renderFilterTabs(){
  const el=document.getElementById('sf-tabs');
  if(el) el.innerHTML=FILTER_TABS.map((t,i)=>
    `<button class="sf-tab${i===filterTabIdx?' on':''}" onclick="pickFilterTab(${i})">${esc(t.nm)}</button>`).join('');
}
function pickFilterTab(i){
  filterTabIdx=i;
  renderFilterTabs();
  renderFilterGroups();
}
function renderFilterGroups(){
  const tab=FILTER_TABS[filterTabIdx];
  const t=document.getElementById('sf-title'); if(t) t.textContent=tab.nm;
  const el=document.getElementById('sf-groups');
  if(!el) return;
  el.innerHTML=tab.groups.map(g=>{
    const items=g.items;
    return `<div class="sf-grp">
      <div class="sf-grp-h">${esc(g.h)}<i class="fi fi-rr-angle-small-up"></i></div>
      <div class="sf-chips">${items.map(v=>
        `<button class="sf-chip${pickedFilters.includes(v)?' on':''}" onclick="toggleFilter('${esc(v)}')">${esc(v)}</button>`).join('')}</div>
    </div>`;
  }).join('');
}
function toggleFilter(v){
  const i=pickedFilters.indexOf(v);
  if(i>=0) pickedFilters.splice(i,1); else pickedFilters.push(v);
  renderFilterGroups();
  renderPickedFilters();
}
function renderPickedFilters(){
  const el=document.getElementById('sf-picked-list');
  if(el) el.innerHTML=pickedFilters.map(v=>
    `<span class="sf-tag" onclick="toggleFilter('${esc(v)}')">${esc(v)} <i class="fi fi-rr-cross-small"></i></span>`).join('');
}
function resetFilters(){
  pickedFilters=[];
  renderFilterGroups();
  renderPickedFilters();
}
function applyFilters(){
  closeSheetFull('sheet-filter');
  syncFilterPills();
  showToast(pickedFilters.length ? '필터 '+pickedFilters.length+'개를 적용했어요' : '필터를 해제했어요');
}
// 지도 위 필터 줄의 첫 번째 pill에 선택 개수를 반영한다
function syncFilterPills(){
  const num=document.getElementById('filter-count');
  if(num) num.textContent=pickedFilters.length;
  const pill=document.getElementById('filter-main-pill');
  if(pill) pill.classList.toggle('set', pickedFilters.length>0);
}

// ── 날짜·시간 시트 (캘린더 + 이용시간 + 시간) ──
const CAL_TIMES=['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
let calView=new Date();
let calPicked=new Date();
function openDateSheet(){
  calView=new Date(calPicked);
  renderCalendar();
  renderCalDurs();
  renderCalTimes();
  renderTargetLists();
  openSheetFull('sheet-date');
}
function calMove(d){ calView.setMonth(calView.getMonth()+d); renderCalendar(); }
function calGoToday(){ calView=new Date(); calPicked=new Date(); renderCalendar(); }
function calPick(y,m,d){ calPicked=new Date(y,m,d); renderCalendar(); }
function renderCalendar(){
  const y=calView.getFullYear(), m=calView.getMonth();
  const mon=document.getElementById('cal-mon');
  if(mon) mon.textContent=y+'년 '+(m+1)+'월';
  const first=new Date(y,m,1).getDay();
  const last=new Date(y,m+1,0).getDate();
  const prevLast=new Date(y,m,0).getDate();
  const today=new Date(); today.setHours(0,0,0,0);
  let html=HD_DAYS.map(d=>'<div class="cal-dow">'+d+'</div>').join('');
  for(let i=first-1;i>=0;i--) html+='<div class="cal-d off"><span>'+(prevLast-i)+'</span></div>';
  for(let d=1;d<=last;d++){
    const cur=new Date(y,m,d);
    const past=cur<today;
    const on=cur.toDateString()===calPicked.toDateString();
    html+=`<div class="cal-d${past?' off':''}${on?' on':''}" onclick="calPick(${y},${m},${d})"><span>${d}</span></div>`;
  }
  const tail=(7-((first+last)%7))%7;
  for(let d=1;d<=tail;d++) html+='<div class="cal-d off"><span>'+d+'</span></div>';
  const g=document.getElementById('cal-grid'); if(g) g.innerHTML=html;
}
function renderCalDurs(){
  const el=document.getElementById('cal-durs');
  if(el) el.innerHTML=[1,2,3,4,5,6,7,8].map(n=>
    `<button class="cal-circ${n===dsSelectedDuration?' on':''}" onclick="pickCalDur(${n})">${n}시간</button>`).join('');
}
function pickCalDur(n){ dsSelectedDuration=n; renderCalDurs(); }
function renderCalTimes(){
  const el=document.getElementById('cal-times');
  if(el) el.innerHTML=CAL_TIMES.map(t=>{
    const h=parseInt(t,10);
    const label=(h<12?'오전 ':'오후 ')+(h>12?h-12:h)+':00';
    return `<button class="cal-time${t===dsSelectedTime?' on':''}" onclick="pickCalTime('${t}')">${label}</button>`;
  }).join('');
}
function pickCalTime(t){ dsSelectedTime=t; renderCalTimes(); }
function applyDateSheet(){
  const today=new Date(); today.setHours(0,0,0,0);
  const pick=new Date(calPicked); pick.setHours(0,0,0,0);
  const diff=Math.round((pick-today)/86400000);
  dsSelectedDate = diff===0 ? '오늘' : diff===1 ? '내일'
    : (calPicked.getMonth()+1)+'.'+calPicked.getDate()+'('+HD_DAYS[calPicked.getDay()]+')';
  closeSheetFull('sheet-date');
  confirmDateSheet();
}
let dsSelectedDuration=2;
function confirmDateSheet(){
  const targetNm=TARGETS[selectedTargetIdx]?.nm || '아버지';
  const summary=dsSelectedDate+' · '+dsSelectedTime+' · '+dsSelectedDuration+'시간 · '+targetNm;
  const text=document.getElementById('nv-datebar-text');
  if(text) text.textContent=summary;
  // 목록 필터바의 날짜 pill도 같은 값을 보여준다
  const pill=document.getElementById('filter-date-txt');
  if(pill) pill.textContent=summary;
  updateConfirmRouteMeta();
  closeSheetFull('sheet-date');
  showToast(dsSelectedDate+' '+dsSelectedTime+'로 변경했습니다');
}

// ── 환자 정보 ──
// 마이페이지·리포트에 이미 키·몸무게가 있으므로, 동행 이력이 있는 사용자는 다시 묻지 않고
// 자동 기재해서 보여주기만 한다. 처음 이용하는 사용자만 직접 입력받는다.
let isReturningUser = true;                       // 데모 토글: 재이용자 ↔ 첫 이용자
let patientInfo = { walk:'스스로 가능', dx:'제2형 당뇨병', h:'162', w:'54' };
let dxNone = false;

function openPatientSheet(){
  renderPatientSec();
  openModal('modal-patient');
}

function renderPatientSec(){
  const el=document.getElementById('patient-sheet-body');
  if(!el) return;

  if(isReturningUser){
    const dxTxt = patientInfo.dx || '진단명 없음';
    el.innerHTML =
      '<div class="pt-head">'
      +'<div class="pt-title">아버지 <span class="pt-sub">이순자 · 74세</span></div>'
      +'<button class="pt-edit" onclick="startPatientEdit()">수정</button>'
      +'</div>'
      +'<div class="pt-auto">'
      +'<div class="pt-auto-tag"><i class="fi fi-rr-check"></i> 지난 동행 기록에서 자동 기재했어요</div>'
      +'<div class="pt-grid">'
      +'<div><span>보행 상태</span><b>'+esc(patientInfo.walk)+'</b></div>'
      +'<div><span>진단명</span><b>'+esc(dxTxt)+'</b></div>'
      +'<div><span>키</span><b>'+esc(patientInfo.h)+'cm</b></div>'
      +'<div><span>몸무게</span><b>'+esc(patientInfo.w)+'kg</b></div>'
      +'</div></div>'
      +'<button class="btn primary" style="margin-top:16px" onclick="closeModal(\'modal-patient\')">이대로 진행하기</button>';
    return;
  }

  // 첫 이용자 — 직접 입력
  el.innerHTML =
    '<div class="pt-head"><div class="pt-title">환자 정보</div></div>'
    +'<div class="pt-note">처음 이용하시네요. 매니저가 준비할 수 있도록 환자분 상태를 알려주세요.</div>'

    +'<div class="pt-label">환자 보행 상태</div>'
    +'<div class="chip-group chip-single" id="walk-chips">'
    +['스스로 가능','부축 필요','기타'].map(v=>
        '<div class="chip'+(patientInfo.walk===v?' on':'')+'" onclick="pickWalkState(this,\''+v+'\')">'+v+'</div>').join('')
    +'</div>'

    +'<div class="pt-label">진단명</div>'
    +'<input class="input filled" id="dx-input" style="cursor:text" placeholder="진단명을 입력해 주세요" value="'+esc(dxNone?'':patientInfo.dx)+'" oninput="patientInfo.dx=this.value">'
    +'<div class="check-row'+(dxNone?' on':'')+'" id="dx-none-row" onclick="toggleDxNone()">'
    +'<span class="agree-check" id="dx-none-chk">'+(dxNone?'✓':'')+'</span>'
    +'<span class="check-txt">현재 진단명이 없는 상태에요</span>'
    +'</div>'

    // 부축이 필요할 때만 키·몸무게를 받는다(그 외에는 불필요한 개인정보 수집)
    +'<div id="body-fields" style="display:'+(patientInfo.walk==='스스로 가능'?'none':'')+'">'
    +'<div class="body-note">부축이 필요한 경우, 매니저가 이동 보조가 가능한지 판단할 수 있도록 알려주세요.</div>'
    +'<div class="two-col">'
    +'<div><div class="pt-label">키</div><div class="unit-input"><input id="patient-h" inputmode="numeric" placeholder="예: 165" value="'+esc(patientInfo.h)+'" oninput="patientInfo.h=this.value"><span>cm</span></div></div>'
    +'<div><div class="pt-label">몸무게</div><div class="unit-input"><input id="patient-w" inputmode="numeric" placeholder="예: 58" value="'+esc(patientInfo.w)+'" oninput="patientInfo.w=this.value"><span>kg</span></div></div>'
    +'</div></div>';
}

function startPatientEdit(){
  isReturningUser=false;
  renderPatientSec();
  showToast('환자 정보를 수정할 수 있어요');
}

function pickWalkState(el,val){
  el.closest('.chip-group').querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));
  el.classList.add('on');
  patientInfo.walk=val;
  const box=document.getElementById('body-fields');
  if(box) box.style.display = (val==='스스로 가능') ? 'none' : '';
}

function toggleDxNone(){
  dxNone=!dxNone;
  if(dxNone) patientInfo.dx='';
  const row=document.getElementById('dx-none-row');
  const chk=document.getElementById('dx-none-chk');
  const inp=document.getElementById('dx-input');
  if(row) row.classList.toggle('on',dxNone);
  if(chk) chk.textContent = dxNone ? '✓' : '';
  if(inp){
    inp.disabled=dxNone;
    if(dxNone) inp.value='';
    inp.placeholder = dxNone ? '진단명 없음으로 접수됩니다' : '진단명을 입력해 주세요';
    inp.style.opacity = dxNone ? '.5' : '';
  }
}

// ── 경유지 ──
// 데모용 후보. 실제로는 장소 검색 결과가 들어갈 자리다.
const STOP_CANDIDATES = [
  { name:'향남 온누리약국', sub:'처방약 수령', pos:[37.12455, 126.90790] },
  { name:'향남농협 향남지점', sub:'은행 업무',   pos:[37.12300, 126.90680] },
  { name:'향남읍 행정복지센터', sub:'서류 발급', pos:[37.12610, 126.90840] },
];

// ── 동행 요금 ── 동행 방법(차량/알뜰)에 따른 정액 요금. TRANSPORT_MODES·pickMode는 위쪽 참조.
function money(n){ return n.toLocaleString('ko-KR')+'원'; }

function renderCost(){
  const mode=TRANSPORT_MODES[selectedModeIdx];
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.innerHTML=v; };
  set('cost-base-label', '동행료 ('+mode.nm+')');
  set('cost-base', money(mode.price));
  set('cost-total', money(mode.price));
  set('pay-bar-total', money(mode.price));
  // 후불 결제라 버튼에는 금액을 넣지 않는다. 금액은 옆의 '예상 금액'으로만 보여준다.
}

// 홈 상단에서 고른 장소가 곧 동행 출발지가 된다.
const HOME_PLACES = [
  { label:'할머니집', addr:'화성 향남읍 자택' },
  { label:'부모님댁', addr:'화성 봉담읍 아파트' },
  { label:'우리집',   addr:'수원 영통구 자택' },
];
let homePlaceIdx = 0;
let homeAddress = HOME_PLACES[0].addr;
// 첫 이용자는 주소가 없는 상태로 시작한다 — 위치 권한 이후 주소 검색 화면으로 안내한다
let hasHomeAddress = false;

// 장소를 바꾸면 검색바의 출발지도 함께 갱신된다. 첫 이용자(주소 미설정)는 순환 대신 주소 검색으로 보낸다.
function pickHomePlace(){
  if(!hasHomeAddress){ openAddrSearch(); return; }
  homePlaceIdx = (homePlaceIdx + 1) % HOME_PLACES.length;
  const p = HOME_PLACES[homePlaceIdx];
  homeAddress = p.addr;
  const btn = document.getElementById('home-place');
  if(btn) btn.innerHTML = esc(p.label)+' <span class="caret">▾</span>';
  renderStopList();
  showToast(p.label+'('+p.addr+')으로 출발지를 바꿨어요');
}

// ── 간병 장소 주소 검색 (배민 주소검색 참고) ──
// 실제 지오코딩 API 없이, 검색/현재위치 모두 화성 향남 인근의 데모 주소로 수렴시킨다.
let addrResolvedMain='';
let addrResolvedSub='';
let addrDetailTag='할머니집';
const ADDR_DEMO = { main:'화성 향남읍 행정중앙로 27', sub:'화성 향남읍 평리 123-4' };

function openAddrSearch(){
  const inp=document.getElementById('addr-input');
  if(inp) inp.value='';
  goTo('s-addr-search');
}
function searchAddrByCurrentLocation(){
  addrResolvedMain=ADDR_DEMO.main;
  addrResolvedSub=ADDR_DEMO.sub;
  goToAddrConfirm();
}
function searchAddrByText(){
  const v=document.getElementById('addr-input')?.value.trim();
  if(!v){ showToast('주소를 입력해주세요'); return; }
  // 데모: 입력한 검색어를 도로명 주소처럼, 데모 지번을 부주소로 보여준다
  addrResolvedMain=v;
  addrResolvedSub=ADDR_DEMO.sub;
  goToAddrConfirm();
}
function goToAddrConfirm(){
  goTo('s-addr-confirm');
  const main=document.getElementById('addr-result-main'), sub=document.getElementById('addr-result-sub');
  if(main) main.textContent=addrResolvedMain;
  if(sub) sub.textContent=addrResolvedSub;
  setTimeout(()=>{
    if(!addrMap && typeof L!=='undefined'){ addrMap=createMap('map-addr', MAP_HOME); }
    if(addrMap){ addrMap.invalidateSize(); addrMap.setView(MAP_HOME, 16); }
  },320);
}
function confirmAddrLocation(){
  goTo('s-addr-detail');
  const main=document.getElementById('addr-detail-main'), sub=document.getElementById('addr-detail-sub');
  if(main) main.textContent=addrResolvedMain;
  if(sub) sub.textContent=addrResolvedSub;
  const inp=document.getElementById('addr-detail-input'); if(inp) inp.value='';
  checkAddrDetailReady();
}
function pickAddrTag(el){
  document.querySelectorAll('.addr-tag-btn').forEach(b=>b.classList.remove('on'));
  el.classList.add('on');
  addrDetailTag=el.dataset.tag;
}
function checkAddrDetailReady(){
  const v=document.getElementById('addr-detail-input')?.value.trim();
  const btn=document.getElementById('addr-save-btn');
  if(btn) btn.disabled=!v;
}
function saveAddrDetail(){
  const detail=document.getElementById('addr-detail-input')?.value.trim();
  if(!detail) return;
  const label = addrDetailTag==='추가' ? '새 장소' : addrDetailTag;
  homeAddress = addrResolvedMain+' '+detail;
  HOME_PLACES[0] = { label, addr:homeAddress };
  homePlaceIdx = 0;
  hasHomeAddress = true;
  const btn=document.getElementById('home-place');
  if(btn) btn.innerHTML = esc(label)+' <span class="caret">▾</span>';
  renderStopList();
  tabTo('s-home');
  showToast('간병 장소를 등록했어요');
}

// 검색바 = 경로. 출발지·경유지·도착지가 한 줄씩 쌓이고, 각 줄 오른쪽 +/− 로 경유지를 조작한다.
function renderStopList(){
  const el=document.getElementById('route-bar');
  if(!el) return;
  const dest = selectedHospital ? selectedHospital.name : '똑똑연세내과의원';

  const row = (dotCls, dotTxt, txt, sub, btn) =>
    '<div class="rt-row">'
    +'<span class="rt-dot '+dotCls+'">'+(dotTxt||'')+'</span>'
    +'<span class="rt-txt">'+esc(txt)+(sub?'<em>'+esc(sub)+'</em>':'')+'</span>'
    +btn+'</div>';

  const delBtn = i => '<button class="rt-btn del" onclick="removeRouteStop('+i+')" aria-label="경유지 삭제"><i class="fi fi-rr-minus-small"></i></button>';
  // 경유지가 없을 땐 도착지 줄에 "+경유" 칩을 붙여 어디서 추가하는지 바로 보이게 한다
  const addChip = '<button class="rt-add-chip" onclick="addRouteStop()">＋경유</button>';

  el.innerHTML =
    '<span class="bk" onclick="goBack()"><i class="fi fi-rr-angle-left"></i></span>'
    +'<div class="rt-lines">'
      + row('start','', homeAddress, '', '')
      + routeStops.map((s,i)=>row('via', i+1, s.name, s.sub, delBtn(i))).join('')
      + row('end','', dest, '', routeStops.length ? '' : addChip)
    +'</div>';
}

function addRouteStop(){
  // 아직 담기지 않은 후보를 순서대로 추가한다
  const next = STOP_CANDIDATES.find(c=>!routeStops.some(s=>s.name===c.name));
  if(!next){ showToast('추가할 수 있는 경유지를 모두 담았어요'); return; }
  routeStops.push(next);
  renderStopList();
  drawLiveRoute();
  renderConfirmRoute();
  showToast(next.name+'을(를) 경유지로 추가했어요');
}

function removeRouteStop(i){
  const removed=routeStops.splice(i,1)[0];
  renderStopList();
  drawLiveRoute();
  renderConfirmRoute();
  if(removed) showToast(removed.name+'을(를) 경유지에서 뺐어요');
}

// 접수 화면의 경로 요약(출발지 · 경유지 · 도착지)
function renderConfirmRoute(){
  const el=document.getElementById('confirm-stops');
  if(!el) return;
  el.innerHTML = routeStops.map((s,i)=>
    '<div class="addr-row"><span class="addr-tag">경유'+(i+1)+'</span><span class="addr-txt">'+esc(s.name)+'</span></div>').join('');
}

// 검색결과 · 매니저선택 화면 공통 (지도 핀 + 카드)
function pickMgr(idx){
  selectedMgr=idx;
  const names=MGRS.map(m=>m.nm);
  const stars=MGRS.map(m=>'★'+m.rating);
  // id(hc0/hc1/hc2, search-pin-N) 기준으로 매칭 — 정렬로 DOM 순서가 바뀌어도 정확한 매니저를 선택 표시한다
  document.querySelectorAll('#s-search .nv-card').forEach(c=>c.classList.toggle('sel', c.id==='hc'+idx));
  document.querySelectorAll('#s-search .map-mgr').forEach(p=>p.classList.toggle('sel', p.id==='search-pin-'+idx));
  document.querySelectorAll('#s-map .mgr-card').forEach(c=>c.classList.toggle('on', c.id==='mgr'+idx));
  updateMgrMapMarkers(idx);
  if(idx<0 || !names[idx]){
    const snb=document.getElementById('search-next-btn'); if(snb) snb.textContent='동행 가능한 매니저가 없습니다';
    return;
  }
  const snb=document.getElementById('search-next-btn'); if(snb) snb.textContent=names[idx]+' 매니저로 접수하기';
  const mnb=document.getElementById('map-next-btn'); if(mnb) mnb.textContent=names[idx]+' 매니저로 접수하기';
  const cm=document.getElementById('confirm-mgr');
  if(cm) cm.textContent=names[idx]+' 매니저 · '+stars[idx];
  const thumb=document.getElementById('confirm-mgr-thumb');
  if(thumb && MGRS[idx]) thumb.innerHTML='<img src="'+esc(MGRS[idx].photo)+'" alt="'+esc(names[idx])+'">';
}

// s-search: 카드 ↔ 핀 동기화 — 선택 시 핀 강조 + 지도가 해당 위치로 이동
function focusSearchMgr(idx){
  pickMgr(idx);
  if(searchMap && SEARCH_MGR_POS[idx]) searchMap.setView(SEARCH_MGR_POS[idx], 16);
}
// 리스트 카드 탭 → 핀 강조·지도 이동을 먼저 보여준 뒤 매니저 프로필로 이동
// 카드의 예약하기 — 프로필을 거치지 않고 해당 매니저로 바로 접수 흐름에 들어간다
function bookMgrFromCard(idx){
  pickMgr(idx);
  startBooking();
}
function tapSearchCard(idx){
  focusSearchMgr(idx);
  setTimeout(()=>openMgr(idx), 260);
}
// 지도 핀 탭 → 리스트가 자동으로 펼쳐지고 해당 카드로 스크롤·강조
function tapSearchPin(idx){
  focusSearchMgr(idx);
  const sheet=document.getElementById('search-sheet');
  const wasExpanded = sheet && sheet.classList.contains('expanded');
  if(sheet && !wasExpanded) toggleSearchSheet();
  const card=document.getElementById('hc'+idx);
  if(card) setTimeout(()=>card.scrollIntoView({behavior:'smooth',block:'center'}), wasExpanded ? 60 : 300);
}
// 매니저 리스트 바텀시트 접힘/펼침 토글
function toggleSearchSheet(){
  const sheet=document.getElementById('search-sheet');
  if(!sheet) return;
  sheet.classList.toggle('expanded');
  const isExp=sheet.classList.contains('expanded');
  const btn=document.getElementById('search-recenter');
  if(btn) btn.classList.toggle('up', isExp);
  if(searchMap) setTimeout(()=>searchMap.invalidateSize(), 300);
}

// 결제
function doPay(){
  hasActiveBooking=true;
  updateHomeState();
  showToast('예약이 접수됐습니다! 매니저에게 알림을 보냈어요 🎉');
  renderOrder();
  goTo('s-order');
  setTimeout(()=>{
    const title=document.getElementById('order-status-title');
    const sub=document.getElementById('order-status-sub');
    const cancelBtn=document.getElementById('order-cancel-btn');
    if(title) title.textContent='매니저가 예약을 수락했어요!';
    if(sub) sub.textContent='곧 동행이 시작돼요.';
    if(cancelBtn) cancelBtn.style.display='none';
  },1600);
  setTimeout(()=>{ updateLiveState(); goTo('s-live'); },3200);
}
// 결제하고 접수하기 직후 보여줄 예약현황(배민 주문현황 참고) 데이터 채우기
function renderOrder(){
  const thumb=document.getElementById('order-mgr-thumb');
  const srcThumb=document.getElementById('confirm-mgr-thumb');
  if(thumb) thumb.innerHTML = srcThumb ? srcThumb.innerHTML : '';
  const mgr=document.getElementById('order-mgr');
  const srcMgr=document.getElementById('confirm-mgr');
  if(mgr) mgr.textContent = srcMgr ? srcMgr.textContent : '';
  const sub=document.getElementById('order-sub');
  if(sub) sub.textContent=(selectedHospital?.name||'똑똑연세내과의원')+' · '+dsSelectedDate+' '+dsSelectedTime;
  const no=document.getElementById('order-no');
  if(no) no.textContent='M'+Date.now().toString(36).toUpperCase().slice(-6);
  const addr=document.getElementById('order-addr');
  if(addr) addr.textContent=homeAddress;
  const note=document.getElementById('order-note');
  const reqTxt=document.getElementById('req-select-text');
  if(note) note.textContent = (reqTxt && reqTxt.textContent!=='요청사항 없음') ? reqTxt.textContent : '전달할 요청사항이 없어요';
  const title=document.getElementById('order-status-title');
  const subS=document.getElementById('order-status-sub');
  const cancelBtn=document.getElementById('order-cancel-btn');
  if(title) title.textContent='예약을 확인하고 있어요';
  if(subS) subS.textContent='매니저 배정 전까지 취소가 가능해요.';
  if(cancelBtn) cancelBtn.style.display='';
}

// 별점
function rateStar(v){
  document.querySelectorAll('.star').forEach((s,i)=>s.classList.toggle('on',i<v));
}

// 후기 제출
function submitReview(){
  closeModal('modal-review');
  showToast('후기가 등록됐습니다 ⭐ 감사합니다!');
  setTimeout(()=>tabTo('s-home'),900);
}

// ── 진료과 바로가기 아이콘 ────────────────────────────────
// 기존 3D 아이콘 자산을 경량 WebP로 잘라 사용하고, 원본에 없는 항목만 glyph로 보완한다.
const CAT_ITEMS = [
  { label:'안과',       icon:'eye'    },
  { label:'심장내과',   icon:'heart'  },
  { label:'이비인후과', icon:'ear'    },
  { label:'내과',       icon:'pill'   },
  { label:'정형외과',   icon:'bone'   },
  { label:'피부과',     icon:'lotion' },
  { label:'정신건강의학과', icon:'mind' },
  { label:'산부인과',   icon:'baby'   },
  { label:'치과',       glyph:'🦷'    },
  { label:'한의과',     glyph:'🌿'    },
];

function renderCatGrid(){
  const grid=document.getElementById('cat-grid');
  if(!grid) return;
  grid.innerHTML='';
  CAT_ITEMS.forEach((c)=>{
    const cell=document.createElement('div');
    cell.className='cat'+(c.badge?' is-badge':'');
    if(c.badge){
      // 배지 안에도 같은 문구가 있지만, 다른 셀과 줄 수를 맞춰 라벨을 한 번 더 넣는다(요청: 중복 허용)
      cell.innerHTML='<div class="ci badge '+c.cls+'">'+c.badge.map(esc).join('<br>')+'</div><div class="cl">'+c.badge.map(esc).join(' ')+'</div>';
      cell.setAttribute('aria-label', c.badge.join(' '));
    }else{
      const icon = c.icon
        ? '<img src="cat-icons/'+c.icon+'.webp" alt="" aria-hidden="true">'
        : '<span class="ci-glyph" aria-hidden="true">'+c.glyph+'</span>';
      cell.innerHTML='<div class="ci">'+icon+'</div><div class="cl">'+esc(c.label)+'</div>';
    }
    cell.onclick = c.action || (()=>showToast(c.label));
    grid.appendChild(cell);
  });
}

// ── 메인 슬라이드 배너 ────────────────────────────────────
// ★ 이미지 교체 지점: img에 파일 경로를 넣으면 된다(예: 'banner/1.jpg').
//   파일을 이 폴더 안에 두고 경로만 바꾸면 되고, 슬라이드는 원하는 만큼 추가·삭제해도 된다.
//   img가 비어 있거나 로드에 실패하면 label 문구가 대신 보인다.
const BANNER_SLIDES = [
  { img:'12.png', label:'배너 이미지 1', alt:'이벤트 배너 1' },
  { img:'13.png', label:'배너 이미지 2', alt:'이벤트 배너 2' },
  { img:'14.png', label:'배너 이미지 3', alt:'이벤트 배너 3' },

];
const BANNER_INTERVAL = 4000;
let bannerTimer = null;

function renderBanner(){
  const track=document.getElementById('banner-track');
  if(!track) return;
  track.innerHTML=BANNER_SLIDES.map((s,i)=>
    '<div class="banner-slide" onclick="tapBanner('+i+')">'
      +'<span class="banner-ph">'+esc(s.label||('배너 '+(i+1)))+'</span>'
      +(s.img ? '<img src="'+esc(s.img)+'" alt="'+esc(s.alt||'')+'" onerror="this.remove()">' : '')
    +'</div>').join('');
  updateBannerCount();
  // 사용자가 직접 넘기면 자동 전환 타이머를 리셋해 바로 다음으로 튀지 않게 한다
  track.addEventListener('scroll', ()=>{ updateBannerCount(); startBannerAuto(); }, { passive:true });
  startBannerAuto();
}

function bannerIndex(){
  const track=document.getElementById('banner-track');
  if(!track || !track.clientWidth) return 0;
  return Math.round(track.scrollLeft / track.clientWidth);
}

function updateBannerCount(){
  const el=document.getElementById('banner-count');
  if(el) el.textContent=(bannerIndex()+1)+' / '+BANNER_SLIDES.length;
}

function startBannerAuto(){
  clearTimeout(bannerTimer);
  if(BANNER_SLIDES.length<2) return;
  bannerTimer=setTimeout(()=>{
    const track=document.getElementById('banner-track');
    // 홈이 안 보이는 동안에는 넘기지 않는다(clientWidth 0이면 레이아웃 전)
    if(track && track.clientWidth){
      const next=(bannerIndex()+1) % BANNER_SLIDES.length;
      track.scrollTo({ left: next*track.clientWidth, behavior:'smooth' });
    }
    startBannerAuto();
  }, BANNER_INTERVAL);
}

function tapBanner(i){
  // 배너 3(14.png)은 외부 이벤트 페이지로 연결한다.
  if(BANNER_SLIDES[i] && BANNER_SLIDES[i].img==='14.png' && typeof openExtPage==='function'){ openExtPage('event'); return; }
  showToast((BANNER_SLIDES[i] && BANNER_SLIDES[i].label) || ('배너 '+(i+1)));
}

// 재예약
function confirmRebook(){
  showToast('8월 13일 재예약이 확정됐습니다!');
  setTimeout(()=>tabTo('s-home'),900);
}

// ── 초기 렌더 ──
// MGRS를 읽는 초기화는 전부 여기서 실행한다(선언 순서상 위쪽에서는 아직 접근할 수 없다).
renderSearchMgrCards();
renderMapMgrCards();
renderCatGrid();
renderBanner();
renderStopList();
renderConfirmRoute();
renderTargetLists();
renderPayList();
renderShareList();
renderReqList();
renderFeedbackPair();
renderModeList();
renderCost();
initMaps();
pickMgr(0);
renderMgrProfile(0);
