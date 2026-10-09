/* Completely local sample data; no fetch, login, cookies, or storage access. */
(function(){
  const $=id=>document.getElementById(id);
  const pad=n=>String(n).padStart(2,'0');
  const dateIn=days=>{const d=new Date();d.setDate(d.getDate()+days);return [d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');};
  const sample=[
    {id:'SAMPLE-001',hospital:'예시 내과의원',date:dateIn(2),time:'10:00',manager:'샘플 매니저 A',status:'예약 확정',kind:'upcoming',share:'예시 활성'},
    {id:'SAMPLE-002',hospital:'예시 정형외과',date:dateIn(5),time:'14:30',manager:'샘플 매니저 B',status:'대기',kind:'upcoming',share:'없음'},
    {id:'SAMPLE-003',hospital:'예시 안과의원',date:dateIn(-7),time:'09:30',manager:'샘플 매니저 C',status:'동행 완료',kind:'past',share:'만료'}
  ];
  let filter='all',query='';
  const format=r=>r.date+' '+r.time;
  function openDetail(id){const item=sample.find(x=>x.id===id);if(!item)return;
    $('sample-detail-title').textContent=item.hospital;
    const dl=$('sample-detail-content');dl.replaceChildren();
    for(const [a,b] of [['예약번호',item.id],['일정',format(item)],['매니저',item.manager],['진행',item.status],['공유',item.share]]){
      const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
      dt.textContent=a;dd.textContent=b;div.append(dt,dd);dl.append(div);
    }
    $('sample-detail').showModal();$('sample-detail-close').focus();
  }
  function itemRow(item){const row=document.createElement('article');row.className='ops-preview-item';
    const main=document.createElement('div'),title=document.createElement('b'),meta=document.createElement('small'),actions=document.createElement('div'),status=document.createElement('span'),btn=document.createElement('button');
    title.textContent=item.hospital;meta.textContent=format(item)+' · '+item.id+' · '+item.manager;
    main.append(title,meta);actions.className='ops-preview-actions';status.className='ops-preview-chip'+(item.kind==='past'?' past':'');status.textContent=item.status;
    btn.type='button';btn.className='ops-table-action primary';btn.textContent='상세 보기';btn.addEventListener('click',()=>openDetail(item.id));
    actions.append(status,btn);row.append(main,actions);return row;
  }
  function render(){
    const list=sample.filter(x=>(filter==='all'||x.kind===filter)&&(!query||[x.id,x.hospital,x.manager,x.status].join(' ').toLowerCase().includes(query)));
    const host=$('sample-bookings');host.replaceChildren(...list.map(itemRow));
    $('sample-result-count').textContent=list.length+'건';$('sample-empty').hidden=list.length!==0;
    $('sample-total').textContent=sample.length;$('sample-upcoming').textContent=sample.filter(x=>x.kind==='upcoming').length;
    $('sample-actions').replaceChildren(...sample.filter(x=>x.kind==='upcoming').map(itemRow));
  }
  function tab(key){
    document.querySelectorAll('[data-sample-panel]').forEach(e=>e.hidden=e.dataset.samplePanel!==key);
    document.querySelectorAll('.ops-nav [data-sample-tab]').forEach(e=>{const yes=e.dataset.sampleTab===key;e.classList.toggle('is-active',yes);if(yes)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});
  }
  document.querySelectorAll('[data-sample-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.sampleTab)));
  document.querySelectorAll('[data-sample-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.sampleFilter;document.querySelectorAll('[data-sample-filter]').forEach(n=>{const a=n===b;n.classList.toggle('is-active',a);n.setAttribute('aria-pressed',a?'true':'false')});render()}));
  $('sample-query').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();render()});
  $('sample-detail-close').addEventListener('click',()=>$('sample-detail').close());
  $('sample-detail').addEventListener('click',e=>{if(e.target===$('sample-detail'))e.target.close()});
  render();tab('overview');
})();
