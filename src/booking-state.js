(function initMosigoBookingState(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MosigoBookingState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function bookingStateFactory() {
  const PHASES = Object.freeze({
    IDLE:'idle',
    REQUESTING:'requesting',
    CONFIRMED:'confirmed',
    IN_PROGRESS:'in_progress',
    COMPLETED:'completed',
    CANCELLED:'cancelled'
  });

  const TRANSITIONS = Object.freeze({
    idle:['requesting'],
    requesting:['confirmed','cancelled'],
    confirmed:['in_progress','cancelled'],
    in_progress:['completed'],
    completed:['idle'],
    cancelled:['idle']
  });

  const ACTIVE_PHASES = new Set([PHASES.REQUESTING, PHASES.CONFIRMED, PHASES.IN_PROGRESS]);

  function normalizeText(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalizeNumber(value, fallback=0) {
    const parsed=Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function entropyToken(value) {
    if (value != null) {
      const token=String(value).toUpperCase().replace(/[^A-Z0-9]/g,'');
      if (token) return token.slice(-4).padStart(4,'0');
    }

    let randomValue;
    try {
      if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
        const buffer=new Uint32Array(1);
        globalThis.crypto.getRandomValues(buffer);
        randomValue=buffer[0];
      }
    } catch(error) {}
    if (!Number.isFinite(randomValue)) randomValue=Math.floor(Math.random()*0x100000000);
    return Math.max(0,randomValue).toString(36).toUpperCase().slice(-4).padStart(4,'0');
  }

  function createBookingId(now=Date.now(), entropy) {
    const stamp=Math.max(0,Number(now)||0).toString(36).toUpperCase().slice(-4).padStart(4,'0');
    return 'M9'+stamp+entropyToken(entropy);
  }

  function createBookingState(input={}) {
    const phase=Object.values(PHASES).includes(input.phase) ? input.phase : PHASES.IDLE;
    return {
      phase,
      bookingId:normalizeText(input.bookingId),
      hospitalId:normalizeText(input.hospitalId),
      hospitalName:normalizeText(input.hospitalName),
      managerIndex:Number.isInteger(input.managerIndex) ? input.managerIndex : -1,
      managerName:normalizeText(input.managerName),
      targetName:normalizeText(input.targetName),
      date:normalizeText(input.date),
      time:normalizeText(input.time),
      durationHours:Math.max(1,normalizeNumber(input.durationHours,2)),
      mode:normalizeText(input.mode),
      amount:Math.max(0,normalizeNumber(input.amount,0)),
      createdAt:input.createdAt || null,
      updatedAt:input.updatedAt || null
    };
  }

  function canTransition(from, to) {
    return Array.isArray(TRANSITIONS[from]) && TRANSITIONS[from].includes(to);
  }

  function transitionBookingState(state, nextPhase, patch={}, now=Date.now()) {
    const current=createBookingState(state);
    if (!Object.values(PHASES).includes(nextPhase)) throw new Error('Unknown booking phase: '+nextPhase);
    if (!canTransition(current.phase,nextPhase)) throw new Error('Invalid booking transition: '+current.phase+' -> '+nextPhase);
    const timestamp=new Date(now).toISOString();
    return createBookingState({
      ...current,
      ...patch,
      phase:nextPhase,
      createdAt:current.createdAt || timestamp,
      updatedAt:timestamp
    });
  }

  function isActiveBooking(state) {
    return ACTIVE_PHASES.has(createBookingState(state).phase);
  }

  function serializeBookingState(state) {
    return JSON.stringify(createBookingState(state));
  }

  function restoreBookingState(serialized) {
    if (!serialized) return createBookingState();
    try {
      const parsed=typeof serialized==='string' ? JSON.parse(serialized) : serialized;
      return createBookingState(parsed && typeof parsed==='object' ? parsed : {});
    } catch(error) {
      return createBookingState();
    }
  }

  return {
    PHASES,
    TRANSITIONS,
    canTransition,
    createBookingId,
    createBookingState,
    isActiveBooking,
    restoreBookingState,
    serializeBookingState,
    transitionBookingState
  };
});
