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

