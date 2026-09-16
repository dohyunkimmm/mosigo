// Mosigo current runtime bootstrap.
// Historical version-numbered modules are exposed through stable, role-based paths under /runtime.
(function bootMosigoRuntime(){
  if(globalThis.MosigoRuntimeBootstrap) return;

  const currentScript=document.currentScript;
  const runtimeBase=new URL('./',currentScript?.src||location.href);
  const scriptMap={
    'v4-functional.js':'hospital-search.js',
    'booking-state.js':'booking-state.js',
    'v4-booking.js':'booking-runtime.js',
    'v6-booking.js':'booking-sync.js',
    'v7-booking.js':'booking-recovery.js',
    'v8-booking.js':'booking-trace.js',
    'v9-booking.js':'booking-coordination.js',
    'v10-booking.js':'booking-durable.js',
    'v11-booking.js':'booking-handoff.js',
    'v11-ui.js':'booking-handoff-ui.js',
    'v12-sharing.js':'booking-sharing.js',
    'v12-ui.js':'booking-sharing-ui.js',
    'v13-account.js':'account-ownership.js',
    'v13-ui.js':'account-ui.js'
  };
  const styleMap={ 'v13-ui.css':'account-ui.css' };

  const head=document.head;
  const append=head.appendChild.bind(head);

  function basename(value){
    try{return new URL(value,location.href).pathname.split('/').pop()||'';}
    catch(error){return String(value||'').split('/').pop()||'';}
  }

  function rewriteRuntimeAsset(node){
    if(!node?.tagName) return node;
    if(node.tagName==='SCRIPT'){
      const source=node.getAttribute('src');
      const mapped=scriptMap[basename(source)];
      if(mapped) node.src=new URL(mapped,runtimeBase).href;
    }else if(node.tagName==='LINK'){
      const href=node.getAttribute('href');
      const mapped=styleMap[basename(href)];
      if(mapped) node.href=new URL(mapped,runtimeBase).href;
    }
    return node;
  }

  head.appendChild=function(node){
    return append(rewriteRuntimeAsset(node));
  };

  globalThis.MosigoRuntimeBootstrap={
    runtimeBase:String(runtimeBase),
    scriptMap:{...scriptMap},
    styleMap:{...styleMap}
  };

  const entry=document.createElement('script');
  entry.src=new URL('hospital-search.js',runtimeBase).href;
  entry.async=false;
  entry.dataset.mosigoRuntimeEntry='1';
  append(entry);
})();
