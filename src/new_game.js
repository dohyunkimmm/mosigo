if(window.parent !== window) document.body.classList.add('in-iframe');

const ROLL_FALLBACK   = 4500;
const CATCH_FALLBACK  = 4500;
const FINISH_FALLBACK = 5500;

const WIN_RATE = 0.5;
let isWin = false;

function drawResult(){
  const q = new URLSearchParams(location.search).get('win');
  if(q === '1' || q === 'true')  { isWin = true;  return; }
  if(q === '0' || q === 'false') { isWin = false; return; }
  isWin = Math.random() < WIN_RATE;
}

const STEPS = {
  1: { title:'무엇이 잡힐까요?', sub:'버튼을 눌러 낚시대를 던져보세요!',
       layer:'g-bg1', btn:'클릭', btnLabel:'낚시대 던지기' },
  2: { title:'두구두구두구…',    sub:'과연 무엇이 잡혔을까요?',
       layer:'g-bg2', btn:null },
  3: { title:'오! 잡았다!',      sub:'과연 무엇일까요?',
       layer:'g-bg2', btn:'잡기', btnLabel:'잡은 것 확인하기' },
  4: { title:'오! 잡았다!',      sub:'과연 무엇일까요?',
       layer:'g-bg3', btn:null },
  5: { title:'오! 잡았다!',      sub:'과연 무엇일까요?',
       layer:'g-bg4', btn:null },
};

let step = 1;
let rollTimer   = null;
let catchTimer  = null;
let finishTimer = null;

const LAYERS = ['g-bg1','g-bg2','g-bg3','g-bg4'];
const FINISH_LAYER = () => 'g-bg4';
const $ = id => document.getElementById(id);
let layerTimer = null;

function showLayer(id){
  clearTimeout(layerTimer);
  const prev = LAYERS.filter(k => k !== id && $(k).classList.contains('is-on'));
  prev.forEach(k => { $(k).classList.remove('is-on'); $(k).classList.add('is-prev'); });
  const next = $(id);
  next.style.zIndex = 2;
  prev.forEach(k => { $(k).style.zIndex = 1; });
  next.classList.remove('is-prev');
  void next.offsetWidth;
  next.classList.add('is-on');
  layerTimer = setTimeout(()=>{
    prev.forEach(k => { $(k).classList.remove('is-prev'); $(k).style.zIndex = 0; });
  }, 500);
}

function playLayer(id){
  const v = $(id);
  if(!v || !v.play) return false;
  try { v.currentTime = 0; } catch(e) {}
  const p = v.play();
  if(p && p.catch) p.catch(()=>{});
  return true;
}

function goStep(n){
  step = n;
  const s = STEPS[n];
  const title = $('g-title'), sub = $('g-sub'), btn = $('g-cast');
  title.textContent = s.title;
  sub.textContent   = s.sub;
  title.classList.toggle('is-rolling', n === 2);
  showLayer(n === 5 ? FINISH_LAYER() : s.layer);
  if(s.btn){
    btn.hidden = false;
    btn.textContent = s.btn;
    btn.setAttribute('aria-label', s.btnLabel);
  } else {
    btn.hidden = true;
  }
  clearAllTimers();
  if(n === 2){
    veil(false);
    playLayer('g-bg2');
    rollTimer = setTimeout(()=>{ if(step === 2) goStep(3); }, videoWait('g-bg2', ROLL_FALLBACK));
  }
  else if(n === 4){
    veil(true);
    drawResult();
    playLayer('g-bg3');
    catchTimer = setTimeout(()=>{ if(step === 4) goStep(5); }, videoWait('g-bg3', CATCH_FALLBACK));
  }
  else if(n === 5){
    veil(true);
    const fin = FINISH_LAYER();
    playLayer(fin);
    finishTimer = setTimeout(()=>{ if(step === 5) showResult(); }, videoWait(fin, FINISH_FALLBACK));
  }
  else {
    veil(false);
  }
}

function clearAllTimers(){
  clearTimeout(rollTimer);
  clearTimeout(catchTimer);
  clearTimeout(finishTimer);
}

function videoWait(id, fallback){
  const v = $(id);
  return (v && v.duration && isFinite(v.duration)) ? v.duration * 1000 + 300 : fallback;
}

function veil(on){
  document.querySelector('.g-head').classList.toggle('is-veiled', on);
  $('g-cast').classList.toggle('is-veiled', on);
}

document.addEventListener('DOMContentLoaded', ()=>{
  const expiry = new Date();
  expiry.setDate(expiry.getDate()+30);
  const expiryEl = $('g-coupon-expiry');
  if(expiryEl){
    const mm=String(expiry.getMonth()+1).padStart(2,'0');
    const dd=String(expiry.getDate()).padStart(2,'0');
    expiryEl.textContent=`${expiry.getFullYear()}.${mm}.${dd}까지 사용 가능`;
  }
  $('g-bg2').addEventListener('ended', ()=>{ if(step === 2) goStep(3); });
  $('g-bg3').addEventListener('ended', ()=>{ if(step === 4) goStep(5); });
  $('g-bg4').addEventListener('ended', ()=>{ if(step === 5) showResult(); });
});

function onCast(){
  if(step === 1) goStep(2);
  else if(step === 3) goStep(4);
}

function updateResultActions(){
  const primary = $('g-rbtn-primary');
  const secondary = $('g-rbtn-secondary');
  if(isWin){
    primary.textContent = '쿠폰 확인하기';
    secondary.textContent = '다시 도전하기 ›';
  } else {
    primary.textContent = '다시 도전하기';
    secondary.textContent = '이벤트 나가기 ›';
  }
}

function showResult(){
  clearAllTimers();
  veil(true);
  $('g-lose').hidden = isWin;
  $('g-win').hidden  = !isWin;
  $('g-result').classList.toggle('is-win', isWin);
  updateResultActions();

  const box = $('g-result');
  box.hidden = false;

  const art = box.querySelector('video.g-result-art');
  if(art){
    try { art.currentTime = 0; } catch(e) {}
    const p = art.play();
    if(p && p.catch) p.catch(()=>{});
  }

  const first = box.querySelector('.g-rbtn');
  if(first) first.focus({ preventScroll:true });
}

function hideResult(){
  $('g-result').hidden = true;
  $('g-result').classList.remove('is-win');
}

function onRetry(){
  hideResult();
  ['g-bg2','g-bg3','g-bg4'].forEach(id => {
    const v = $(id);
    if(!v) return;
    v.pause();
    try { v.currentTime = 0; } catch(e) {}
  });
  goStep(1);
}

function onResultPrimary(){
  if(isWin){
    if(!notifyParent('navigate', { target:'s-mypage' })) location.href='index.html';
  } else {
    onRetry();
  }
}

function onResultSecondary(){
  if(isWin){
    onRetry();
  } else {
    if(!notifyParent('close')) location.href='index.html';
  }
}

let toastTimer = null;
function showToast(msg){
  const t = $('g-toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ t.classList.remove('is-on'); }, 1800);
}

function notifyParent(action, data){
  if(window.parent === window) return false;
  const targetOrigin = window.location.protocol === 'file:' ? '*' : window.location.origin;
  window.parent.postMessage(Object.assign({ source:'ext-page', action }, data||{}), targetOrigin);
  return true;
}

function goBackPage(){
  clearAllTimers();
  notifyParent('back');
}
