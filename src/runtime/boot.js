// Browser runtime bootstrap. External legacy URLs remain available through Vercel rewrites.
// Internal modules load their role-based paths directly, without DOM monkey-patching.
(function bootMosigoRuntime(){
  if(globalThis.MosigoRuntimeBootstrap) return;
  const currentScript=document.currentScript;
  const runtimeBase=new URL('./',currentScript?.src||location.href);
  globalThis.MosigoRuntimeBootstrap={runtimeBase:String(runtimeBase)};
  const entry=document.createElement('script');
  entry.src=new URL('post-ui.js',runtimeBase).href;
  entry.async=false;
  entry.dataset.mosigoPostUi='1';
  document.head.appendChild(entry);
})();
