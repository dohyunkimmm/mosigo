/* ══════════════════════════════════════════════════════════════════════
   외부 페이지 연결기 (ext-pages.js)

   모시고.html 은 이 파일을 <script src="ext-pages.js"></script> 한 줄로만
   불러온다. 기존 HTML·CSS·JS 는 건드리지 않는다.
   별도 html 파일을 iframe으로 띄우므로 스타일이 서로 섞이지 않고,
   file:// 로 열어도(fetch 와 달리) 정상 동작한다.

   ▸ 화면을 추가할 때:  아래 EXT_PAGES 에 한 줄만 넣으면 된다.
       { key:'event2', file:'event2.html' }                  // 다른 화면에서 넘어옴
       { key:'event2', file:'event2.html', banner:'15.png' } // 홈 배너에서 바로 열기
     banner 는 BANNER_SLIDES 의 img 파일명과 같으면 그 배너를 탭했을 때 열린다.

   ▸ 페이지 쪽에서 부모에게 보내는 신호 (event.html 참고):
       postMessage({ source:'ext-page', action:'close' })
       postMessage({ source:'ext-page', action:'next', next:'<key>' })
   ══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  const EXT_PAGES = [
    { key:'event', file:'new_event.html', banner:'14.png', title:'황금낚시 이벤트' },
    { key:'game',  file:'new_game.html', title:'황금낚시 게임' },
    // 여기에 파일을 추가한다 ↓
  ];

  const pageByKey = k => EXT_PAGES.find(p => p.key === k);

  let host = null;      // 오버레이 컨테이너
  let frames = [];      // iframe 두 장을 번갈아 쓴다
  let live = 0;         // 지금 보이는 iframe 번호
  const openStack = [];

  // ── 스타일은 이 파일에서 주입해 기존 CSS를 수정하지 않는다 ──
  function injectStyle(){
    const css = `
      .ext-host{
        position:absolute; inset:0; z-index:60;
        background:#fff;
        transform:translateX(100%);
        transition:transform .28s cubic-bezier(.4,0,.2,1);
        pointer-events:none;
      }
      .ext-host.is-open{ transform:translateX(0); pointer-events:auto; }
      /* 페이지를 바꾸는 동안 iframe이 비어 흰 배경이 번쩍이는 걸 막는다.
         iframe 두 장을 겹쳐 두고, 새 문서가 다 그려진 뒤에야 앞뒤를 바꾼다.
         그동안 이전 페이지가 그대로 보이므로 흰 화면이 생길 틈이 없다. */
      .ext-host iframe{
        position:absolute; inset:0;
        display:block; width:100%; height:100%; border:none;
        opacity:0; z-index:1; pointer-events:none;
      }
      .ext-host iframe.is-live{ opacity:1; z-index:2; pointer-events:auto; }
      @media (prefers-reduced-motion: reduce){
        .ext-host{ transition:none; }
      }
    `;
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  }

  function mount(){
    // 화면들이 들어가는 컨테이너 안에 얹어야 폰 화면 영역만 정확히 덮는다
    const screens = document.getElementById('screens');
    if(!screens) return false;
    host = document.createElement('div');
    host.className = 'ext-host';
    frames = [0, 1].map(() => {
      const f = document.createElement('iframe');
      f.title = '모시고 확장 페이지';
      f.loading = 'lazy';
      host.appendChild(f);
      return f;
    });
    frames[0].classList.add('is-live');
    screens.appendChild(host);
    return true;
  }

  // 대기 중인(안 보이는) iframe 에 먼저 싣고, 다 그려지면 앞으로 내보낸다
  function swapTo(url, title, onDone){
    const back = frames[1 - live], front = frames[live];
    back.title = title || '모시고 확장 페이지';
    const onReady = () => {
      back.removeEventListener('load', onReady);
      back.classList.add('is-live');
      front.classList.remove('is-live');
      live = 1 - live;
      // 뒤로 물러난 쪽은 비워서 타이머·영상이 계속 돌지 않게 한다
      setTimeout(()=>{ if(!front.classList.contains('is-live')) front.src = 'about:blank'; }, 50);
      if(onDone) onDone();
    };
    back.addEventListener('load', onReady);
    back.src = url;
  }

  // 회원가입에서 입력한 이름을 그대로 넘긴다(미입력이면 페이지의 기본값을 쓴다)
  function currentUserName(){
    const input = document.getElementById('su-name');
    const v = input && input.value ? input.value.trim() : '';
    return v;
  }

  function openExtPage(key, opts){
    const page = pageByKey(key);
    if(!page){
      if(typeof showToast === 'function') showToast('다음 화면은 준비 중입니다');
      return;
    }
    if(!host && !mount()) return;

    const name = currentUserName();
    const wasOpen = host.classList.contains('is-open');

    swapTo(page.file + (name ? '?name=' + encodeURIComponent(name) : ''), page.title, () => {
      // 처음 열 때는 다 그려진 다음에 밀어 올린다.
      // 먼저 열고 나중에 채우면 비어 있는 흰 화면이 그대로 보인다.
      if(!wasOpen){
        void host.offsetWidth;
        host.classList.add('is-open');   // 기존 화면 전환은 건드리지 않고 위에 덮기만 한다
      }
    });

    if(!(opts && opts.replace) && openStack[openStack.length - 1] !== key) openStack.push(key);
  }

  // 페이지 안에서 뒤로: 앞 페이지로 돌아가고, 없으면 앱으로 나간다
  function backExtPage(){
    openStack.pop();
    const prev = openStack[openStack.length - 1];
    if(prev) openExtPage(prev, { replace:true });
    else closeExtPage();
  }

  function closeExtPage(){
    if(!host) return;
    openStack.length = 0;
    host.classList.remove('is-open');
    // 전환이 끝난 뒤 비워서 타이머·영상이 뒤에서 계속 돌지 않게 한다
    setTimeout(()=>{
      if(!host.classList.contains('is-open')) frames.forEach(f => { f.src = 'about:blank'; });
    }, 300);
  }

  function isExtPageOpen(){
    return !!host && host.classList.contains('is-open');
  }

  // ── 페이지 → 부모 신호 처리 ──
  window.addEventListener('message', e => {
    const d = e.data;
    if(!d || d.source !== 'ext-page') return;
    if(d.action === 'close') closeExtPage();
    else if(d.action === 'back') backExtPage();
    else if(d.action === 'navigate'){
      closeExtPage();
      const target=d.target;
      setTimeout(()=>{
        if(target && typeof tabTo==='function' && document.getElementById(target)) tabTo(target);
        else if(target && typeof goTo==='function' && document.getElementById(target)) goTo(target);
      }, 320);
    }
    else if(d.action === 'next'){
      if(pageByKey(d.next)) openExtPage(d.next);
      else if(typeof showToast === 'function') showToast('다음 화면은 준비 중입니다');
    }
  });

  // ── 홈 배너 연결: 기존 tapBanner 를 고치지 않고 감싸기만 한다 ──
  function hookBanner(){
    if(typeof window.tapBanner !== 'function' || typeof BANNER_SLIDES === 'undefined') return;
    const original = window.tapBanner;
    window.tapBanner = function(i){
      const slide = BANNER_SLIDES[i];
      const page = slide && EXT_PAGES.find(p => p.banner && p.banner === slide.img);
      if(page){ openExtPage(page.key); return; }
      return original.apply(this, arguments);
    };
  }

  function init(){
    injectStyle();
    hookBanner();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // 다른 화면에서도 부를 수 있게 열어둔다: openExtPage('event')
  window.openExtPage = openExtPage;
  window.closeExtPage = closeExtPage;
  window.backExtPage = backExtPage;
  window.isExtPageOpen = isExtPageOpen;
})();
