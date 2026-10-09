
/* P0/P1 isolated experience affordances.
 * These helpers never create real bookings, send payments, or use account APIs. */
(function(){
  function showPrototypeNotice(label){
    const name=String(label||'해당 기능').replace(/(?:을|를|이|가)?\s*(?:완료|성공|설정했습니다|접수했습니다|연결합니다)\s*$/,'').trim()||'해당 기능';
    const message='시연 안내 · '+name+' — 실제 처리나 알림 발송은 수행되지 않습니다.';
    if(typeof showToast==='function') showToast(message);
    else {const node=document.getElementById('toast');if(node){node.textContent=message;node.classList.add('show');}}
  }
  window.showPrototypeNotice=showPrototypeNotice;

  function createNode(tag,className,text){
    const node=document.createElement(tag);
    if(className) node.className=className;
    if(text!=null) node.textContent=String(text);
    return node;
  }
  let lastTrigger=null;
  function closeMgrCompare(){
    const dialog=document.getElementById('mosigo-manager-compare');
    if(dialog?.open) dialog.close();
    if(lastTrigger?.isConnected) lastTrigger.focus({preventScroll:true});
    lastTrigger=null;
  }
  function openMgrCompare(){
    if(typeof MGRS==='undefined'||!Array.isArray(MGRS)||!MGRS.length){
      showPrototypeNotice('매니저 비교 데이터를 불러오는 중');return;
    }
    lastTrigger=document.activeElement;
    const chosen=(typeof selectedMgr==='number'&&selectedMgr>=0&&selectedMgr<MGRS.length)?selectedMgr:0;
    const indexes=[chosen,...MGRS.map((_,i)=>i).filter(i=>i!==chosen)].slice(0,3);
    let dialog=document.getElementById('mosigo-manager-compare');
    if(!dialog){
      dialog=createNode('dialog','mosigo-compare-dialog');dialog.id='mosigo-manager-compare';
      dialog.setAttribute('aria-labelledby','mosigo-compare-title');
      dialog.addEventListener('click',e=>{if(e.target===dialog)closeMgrCompare()});
      dialog.addEventListener('close',()=>{if(lastTrigger?.isConnected)lastTrigger.focus({preventScroll:true});lastTrigger=null});
      document.body.append(dialog);
    }
    dialog.replaceChildren();
    const head=createNode('div','mosigo-compare-head'),headCopy=createNode('div');
    headCopy.append(createNode('span','mosigo-task-kicker','SAMPLE MANAGER COMPARISON'));
    const title=createNode('h2','', '예시 매니저 3명 비교');title.id='mosigo-compare-title';
    headCopy.append(title,createNode('p','', '요금·자격·평점·동행 횟수를 한눈에 비교합니다. 추천 순위가 아닙니다.'));
    const close=createNode('button','mosigo-compare-close','×');close.type='button';close.setAttribute('aria-label','비교 닫기');close.addEventListener('click',closeMgrCompare);
    head.append(headCopy,close);dialog.append(head);
    const grid=createNode('div','mosigo-compare-grid');
    for(const index of indexes){
      const mgr=MGRS[index], current=index===chosen;
      const card=createNode('article','mosigo-compare-card'+(current?' is-current':''));
      card.append(createNode('h3','',mgr.nm+' 매니저'+(current?' · 현재 선택':'')));
      card.append(createNode('small','',mgr.lv||'자격 정보 예시'));
      const dl=createNode('dl','mosigo-compare-stats');
      for(const [k,v] of [['평점',String(mgr.rating??'-')],['동행 예시',String(mgr.count??'-')+'건'],['도보 거리',String(mgr.walk??'-')+'분'],['동행비',Number.isFinite(mgr.price)?mgr.price.toLocaleString('ko-KR')+'원':'가격 미정']]){
        const row=createNode('div');row.append(createNode('dt','',k),createNode('dd','',v));dl.append(row);
      }
      card.append(dl);
      const choose=createNode('button','',current?'현재 매니저 보기':'이 매니저 프로필 보기');
      choose.type='button';
      choose.addEventListener('click',()=>{closeMgrCompare();if(typeof openMgr==='function')openMgr(index)});
      card.append(choose);grid.append(card);
    }
    dialog.append(grid,createNode('p','mosigo-compare-disclaimer','이름·자격·평점·실적·요금은 모두 사용자 여정 검증용 예시입니다. 실제 인력 검증이나 배정 결과가 아닙니다.'));
    dialog.showModal();close.focus();
  }
  window.openMgrCompare=openMgrCompare;
})();
