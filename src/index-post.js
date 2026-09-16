// Stable Mosigo browser entrypoint. Runtime implementation lives under /runtime.
(function loadMosigoRuntime(){
  const script=document.createElement('script');
  script.src='runtime/boot.js';
  script.async=false;
  script.dataset.mosigoRuntimeBootstrap='1';
  document.head.appendChild(script);
})();
