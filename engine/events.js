// Event log: every state change flows through here (BUILD_PLAN Phase 2).
// Powers the UI log, tutorial triggers, and post-game analysis (Phase 7).
export function createLog() {
  const events = [];
  const listeners = [];
  return {
    events,
    emit(type, data = {}, stamp = {}) {
      const e = { i: events.length, type, ...stamp, data };
      events.push(e);
      for (const fn of listeners) fn(e);
      return e;
    },
    on(fn) { listeners.push(fn); },
    ofType(type) { return events.filter(e => e.type === type); },
  };
}
