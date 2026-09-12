// v4 Functional Prototype — hospital search state, richer prototype availability, and retry UX.
// Loaded after index-core.js/new_ext-pages.js/index-post.js so it can extend the stable v3 flow.

let v4HospitalQueryMeta = null;
let v4HospitalRequestState = { status:'idle', error:'' };

function v4SetHospitalRequestState(status, error='') {
  v4HospitalRequestState = { status, error:String(error || '') };
}

function v4FallbackHospital(hospital, index) {
  const waits = [15,25,35,20,null,null];
  const ratings = [4.9,4.8,4.7,4.8,4.6,4.5];
  const reviews = [182,136,94,107,78,41];
  const sameDay = [true,true,false,true,false,false];
  const openNow = [true,true,true,true,false,false];
  return {
    ...hospital,
    id:hospital.id || 'fallback-'+(index+1),
    rating:hospital.rating ?? ratings[index] ?? 4.5,
    reviewCount:hospital.reviewCount ?? reviews[index] ?? 0,
    specialties:Array.isArray(hospital.specialties) ? hospital.specialties : [hospital.dept].filter(Boolean),
    availability:hospital.availability || {
      openNow:openNow[index] ?? true,
      sameDay:sameDay[index] ?? false,
      waitMin:waits[index] ?? null
    }
  };
}

function v4ApplyFallbackFilters(items, { managerAvailable=false, sameDay=false, sort='recommended' }={}) {
  let list = items.map(v4FallbackHospital);
  if(managerAvailable) list = list.filter(h=>Array.isArray(h.mgrIds) && h.mgrIds.length>0);
  if(sameDay) list = list.filter(h=>h.availability?.sameDay===true);
  if(sort==='rating') list.sort((a,b)=>(b.rating||0)-(a.rating||0));
  else if(sort==='wait') list.sort((a,b)=>{
    const aw=Number.isFinite(a.availability?.waitMin)?a.availability.waitMin:Infinity;
    const bw=Number.isFinite(b.availability?.waitMin)?b.availability.waitMin:Infinity;
    return aw-bw || (b.rating||0)-(a.rating||0);
  });
  else list.sort((a,b)=>{
    const ao=a.availability?.openNow?1:0, bo=b.availability?.openNow?1:0;
    return bo-ao || (b.mgrIds?.length||0)-(a.mgrIds?.length||0) || (b.rating||0)-(a.rating||0);
  });
  return list;
}

async function v4SearchHospitals({ qn='', qd='', numOfRows=10, managerAvailable=false, sameDay=false, sort='recommended' }={}) {
  if(!HOSPITAL_API_BASE) {
    lastHospitalDataSource='fallback';
    v4SetHospitalRequestState('fallback','API를 사용할 수 없는 환경입니다.');
    const items=v4ApplyFallbackFilters(searchHospitalsFallback({qn,qd,numOfRows}),{managerAvailable,sameDay,sort});
    v4HospitalQueryMeta={ total:items.length, returned:items.length, limit:numOfRows, sort, filters:{query:qn,department:qd,managerAvailable,sameDay} };
    return items.slice(0,numOfRows);
  }

  const params=new URLSearchParams({ numOfRows:String(numOfRows), sort });
  if(qn) params.set('qn',qn);
  if(qd) params.set('qd',qd);
  if(managerAvailable) params.set('managerAvailable','1');
  if(sameDay) params.set('sameDay','1');

  const controller=typeof AbortController!=='undefined' ? new AbortController() : null;
  const timeout=controller ? setTimeout(()=>controller.abort(),3500) : null;
  v4SetHospitalRequestState('loading');
  try {
    const res=await fetch(HOSPITAL_API_BASE+'?'+params.toString(),controller?{signal:controller.signal}:undefined);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data=await res.json();
    if(!data || !Array.isArray(data.items)) throw new Error('invalid payload');
    lastHospitalDataSource=data.source==='prototype'?'prototype':'api';
    v4HospitalQueryMeta=data.meta || { total:data.items.length, returned:data.items.length, limit:numOfRows, sort };
    v4SetHospitalRequestState(data.items.length?'ready':'empty');
    return data.items.map(v4FallbackHospital);
  } catch(error) {
    lastHospitalDataSource='fallback';
    v4SetHospitalRequestState('fallback',error?.name==='AbortError'?'검색 응답 시간이 초과됐습니다.':error?.message||'API 오류');
    let items=searchHospitalsFallback({qn,qd,numOfRows});
    items=v4ApplyFallbackFilters(items,{managerAvailable,sameDay,sort});
    v4HospitalQueryMeta={ total:items.length, returned:items.length, limit:numOfRows, sort, fallback:true };
    return items.slice(0,numOfRows);
  } finally {
    if(timeout) clearTimeout(timeout);
  }
}

// Preserve the v3 call signature while upgrading its behavior.
searchHospitals = v4SearchHospitals;

function v4HighlightHospitalName(name, highlight) {
  const safe=esc(name||'');
  if(!highlight || !String(name||'').includes(highlight)) return safe;
  return safe.replace(esc(highlight),()=>'<b>'+esc(highlight)+'</b>');
}

renderSiItem = function(h, idx, highlight) {
  const availability=h.availability||{};
  const isOpen=availability.openNow!==false;
  const sameDay=availability.sameDay===true;
  const wait=Number.isFinite(availability.waitMin) ? ' · 예시 대기 '+availability.waitMin+'분' : '';
  const managerCount=Array.isArray(h.mgrIds)?h.mgrIds.length:0;
  const rating=Number.isFinite(h.rating)?'★ '+h.rating.toFixed(1):'';
  const reviewCount=Number.isFinite(h.reviewCount)?'후기 '+h.reviewCount+'개':'';
  const dist=hospitalDistance(h);
  const shortAddr=h.addr ? h.addr.split(' ').slice(0,3).join(' ') : '';
  const tags=[...(h.specialties||hospitalTags(h)).slice(0,3), managerCount?'동행 매니저 '+managerCount+'명':'매니저 연결 대기'].filter(Boolean);
  const badges=sameDay
    ? '<span class="hosp-badge">＋ 당일접수</span><span class="hosp-badge">＋ 예약</span>'
    : '<span class="hosp-badge">＋ 예약</span>';
  const quickest=(idx===0 && isOpen) ? '<div class="hosp-fast"><span>추천 결과</span><b>'+(sameDay?'당일 접수 가능':'예약 가능')+'</b></div>' : '';
  return `<div class="hosp-card" onclick="openHospDetail(${idx})">
    <div class="hosp-badges">${badges}</div>
    <div class="hosp-nm">${v4HighlightHospitalName(h.name,highlight)}</div>
    <div class="hosp-status"><span class="${isOpen?'on':''}">${isOpen?'진료중':'진료 종료'}</span>${wait}${rating?' <span class="dot">|</span> '+esc(rating):''}${reviewCount?' · '+esc(reviewCount):''}</div>
    <div class="hosp-loc"><i class="fi fi-rr-marker"></i> ${dist?esc(dist)+' · ':''}${esc(shortAddr)}</div>
    <div class="hosp-tags">${esc(tags.join(' · '))}</div>
    ${quickest}
  </div>`;
};

function v4FallbackNotice(retryCall) {
  if(v4HospitalRequestState.status!=='fallback') return '';
  return `<div class="si-empty" role="status" style="padding:14px 18px;text-align:left">
    <b style="display:block;margin-bottom:5px;color:var(--g900)">예시 데이터로 검색했어요</b>
    <span>병원 API 연결이 불안정해 로컬 프로토타입 데이터로 전환했습니다.</span>
    <button class="bk-report" style="margin-top:10px" onclick="${retryCall}">다시 시도</button>
  </div>`;
}

function v4EmptyNotice(query='') {
  return `<div class="si-empty" role="status">
    <b style="display:block;margin-bottom:6px;color:var(--g900)">검색 결과가 없어요</b>
    ${query?'<span>'+esc(query)+'와 일치하는 병원을 찾지 못했습니다.</span><br>':''}
    <button class="bk-report" style="margin-top:12px" onclick="clearSi();document.getElementById('si-input')?.focus()">검색어 다시 입력</button>
  </div>`;
}

async function retryHospitalSearch() {
  const input=document.getElementById('si-input');
  if(input?.value.trim()) await siTypeFetch();
  else await loadNearbyHospitals();
}

loadNearbyHospitals = async function() {
  const el=document.getElementById('si-nearby');
  if(!el) return;
  el.innerHTML='<div class="si-loading" role="status">주변 병원을 불러오는 중…</div>';
  const list=await searchHospitals({numOfRows:8,sort:'recommended'});
  hospitalCache=list;
  if(!list.length){ el.innerHTML=v4EmptyNotice(); return; }
  el.innerHTML=v4FallbackNotice('loadNearbyHospitals()')+list.map((h,i)=>renderSiItem(h,i)).join('');
};

siTypeFetch = async function() {
  const input=document.getElementById('si-input');
  const v=input?.value.trim()||'';
  const def=document.getElementById('si-default');
  const sug=document.getElementById('si-suggest');
  if(!v){ if(def) def.style.display=''; if(sug) sug.style.display='none'; return; }
  if(def) def.style.display='none';
  if(sug){ sug.style.display=''; sug.innerHTML='<div class="si-loading" role="status">검색 중…</div>'; }
  const qd=detectDeptCode(v);
  const list=await searchHospitals({qn:qd?'':v,qd,numOfRows:12,sort:'recommended'});
  hospitalCache=list;
  if(!sug) return;
  if(!list.length){ sug.innerHTML=v4EmptyNotice(v); return; }
  sug.innerHTML=v4FallbackNotice('retryHospitalSearch()')+list.map((h,i)=>renderSiItem(h,i,v)).join('');
};

pickDept = async function(label) {
  const dt=document.getElementById('hospmap-dept-txt');
  if(dt) dt.textContent=label;
  closeModal('modal-dept');
  showToast(label+'로 필터링합니다');
  const qd=label==='전체'?'':detectDeptCode(label);
  const list=await searchHospitals({qd,numOfRows:12,sort:'recommended'});
  hospitalCache=list;
  renderHospMapList(list);
  renderHospMapPins(list);
  syncHospitalSourceUI();
  if(v4HospitalRequestState.status==='fallback') showToast('API 연결이 불안정해 예시 데이터로 표시합니다');
};

// Add v4 query-state detail to the existing provenance copy without changing the prototype disclaimer.
const _v4SyncHospitalSourceUI=syncHospitalSourceUI;
syncHospitalSourceUI=function(){
  _v4SyncHospitalSourceUI();
  const note=document.getElementById('hospmap-source-note');
  if(note && v4HospitalQueryMeta && v4HospitalRequestState.status!=='fallback'){
    const returned=v4HospitalQueryMeta.returned ?? hospitalCache.length;
    const total=v4HospitalQueryMeta.total ?? returned;
    note.setAttribute('aria-label','병원 검색 데이터 출처 및 결과 수');
    const count=document.createElement('span');
    count.style.display='block';
    count.style.marginTop='4px';
    count.textContent='검색 결과 '+returned+'건'+(total!==returned?' / 전체 '+total+'건':'')+' · 정렬 '+(v4HospitalQueryMeta.sort||'recommended');
    note.querySelector('span:last-child')?.appendChild(count);
  }
};

// Shared state model first, then the runtime adapter. This keeps one tested lifecycle contract
// for both Node QA and the browser prototype without introducing a bundler.
(function loadV4BookingRuntime(){
  function loadRuntime(){
    if(document.querySelector('script[data-mosigo-v4-booking]')) return;
    const runtime=document.createElement('script');
    runtime.src='v4-booking.js';
    runtime.async=false;
    runtime.dataset.mosigoV4Booking='1';
    document.head.appendChild(runtime);
  }
  if(globalThis.MosigoBookingState){ loadRuntime(); return; }
  if(document.querySelector('script[data-mosigo-booking-state]')) return;
  const model=document.createElement('script');
  model.src='booking-state.js';
  model.async=false;
  model.dataset.mosigoBookingState='1';
  model.onload=loadRuntime;
  document.head.appendChild(model);
})();
