if(window.parent !== window) document.body.classList.add('in-iframe');

const NEXT_PAGE = 'game';

const WINNERS = [
  { name:'정*진', prize:'아메리카노' },
  { name:'김*수', prize:'CU 바나나 우유' },
  { name:'이*연', prize:'스프라이트 제로' },
  { name:'박*호', prize:'GS25 모바일 상품권' },
  { name:'최*영', prize:'배민클럽 3개월 무료' },
  { name:'윤*아', prize:'카카오 이모티콘 1개월' },
  { name:'장*민', prize:'초코에몽' },
  { name:'한*희', prize:'배민클럽 1개월 무료' },
  { name:'오*준', prize:'하겐다즈 아이스크림' },
  { name:'서*빈', prize:'맘스터치 싸이버거' },
];
const CHIP_INTERVAL = 2400;
let chipTimer = null;
let chipLast = -1;

function esc(s){
  return String(s).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

function applyName(){
  const q = new URLSearchParams(location.search).get('name');
  const name = (q && q.trim()) || '지현';
  document.getElementById('fish-hello').innerHTML = '<b>'+esc(name)+'님!</b> 낚시로<br>행운을 잡아보세요!';
}

function rollChip(){
  const chip = document.getElementById('fish-chip');
  if(!chip) return;
  let i;
  do { i = Math.floor(Math.random()*WINNERS.length); }
  while(WINNERS.length > 1 && i === chipLast);
  chipLast = i;
  const w = WINNERS[i];
  chip.innerHTML = '<b>'+esc(w.name)+'님</b>&nbsp;'+esc(w.prize)+' 당첨!';
}

function startChipAuto(){
  clearTimeout(chipTimer);
  chipTimer = setTimeout(()=>{
    const chip = document.getElementById('fish-chip');
    if(!chip) return;
    chip.classList.add('is-out');
    setTimeout(()=>{ rollChip(); chip.classList.remove('is-out'); }, 320);
    startChipAuto();
  }, CHIP_INTERVAL);
}

function notifyParent(action, data){
  if(window.parent === window) return false;
  const targetOrigin = window.location.protocol === 'file:' ? '*' : window.location.origin;
  window.parent.postMessage(Object.assign({ source:'ext-page', action }, data||{}), targetOrigin);
  return true;
}

function closeEvent(){
  clearTimeout(chipTimer);
  notifyParent('close');
}

function shareEvent(){
  const url = (document.referrer || location.href);
  if(navigator.share){
    navigator.share({ title:'황금낚시 이벤트', text:'낚시로 행운을 잡아보세요!', url }).catch(()=>{});
    return;
  }
  if(navigator.clipboard){
    navigator.clipboard.writeText(url).catch(()=>{});
  }
}

function goNext(){
  notifyParent('next', { next: NEXT_PAGE });
}

applyName();
rollChip();
if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches) startChipAuto();

// Bind controls without executable HTML attributes. Required by the
// enforced script-src-attr 'none' policy on the standalone event page.
function bindEventControls(){
  document.querySelector('.fish-nav [aria-label="뒤로 가기"]')?.addEventListener('click',closeEvent);
  document.querySelector('.fish-nav [aria-label="공유하기"]')?.addEventListener('click',shareEvent);
  document.querySelector('.fish-cta')?.addEventListener('click',goNext);
  document.querySelectorAll('[data-remove-on-error]').forEach(asset=>{
    asset.addEventListener('error',()=>asset.remove(),{once:true});
    if(asset instanceof HTMLImageElement && asset.complete && asset.naturalWidth===0) asset.remove();
  });
}
bindEventControls();
