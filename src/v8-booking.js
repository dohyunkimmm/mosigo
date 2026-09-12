// v8 Traceable Booking Beta — exposes the server-validated lifecycle history carried by the booking resource.
(function bootV8BookingTrace(){
  function initV8BookingTrace(){
    const sync=globalThis.MosigoV6BookingSync;
    if(!sync){
      setTimeout(initV8BookingTrace,25);
      return;
    }
    if(globalThis.MosigoV8BookingTrace) return;

    let traceState={
      bookingId:'',
      revision:0,
      historyComplete:false,
      history:[],
      status:'empty'
    };

    function normalize(booking){
      if(!booking?.bookingId){
        return { bookingId:'', revision:0, historyComplete:false, history:[], status:'empty' };
      }
      const history=Array.isArray(booking.history) ? booking.history.map((event)=>({ ...event })) : [];
      const revision=Number.isInteger(booking.revision) ? booking.revision : 0;
      const valid=history.length>0 && revision===history.length;
      return {
        bookingId:String(booking.bookingId),
        revision,
        historyComplete:booking.historyComplete===true,
        history,
        status:valid ? (booking.historyComplete===true ? 'traceable' : 'legacy') : 'pending'
      };
    }

    function publish(booking){
      traceState=normalize(booking);
      globalThis.v8BookingTraceState=traceState;
    }

    window.addEventListener('mosigo:booking-sync',(event)=>{
      publish(event?.detail?.booking || null);
    });

    globalThis.MosigoV8BookingTrace={
      getState:()=>({ ...traceState, history:traceState.history.map((event)=>({ ...event })) }),
      getHistory:()=>traceState.history.map((event)=>({ ...event })),
      getRevision:()=>traceState.revision,
      isComplete:()=>traceState.historyComplete
    };

    publish(sync.getState());
  }

  initV8BookingTrace();
})();
