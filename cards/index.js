// Central card-script registration. Wave files add themselves here.
import { registerPilots } from './pilots.js';

const waves = [registerPilots];
// WAVE REGISTRATIONS (batch agents: import your registerWavesX above and push
// it here, keeping alphabetical batch order A, B, C, D):

let done = false;
export function registerAll(db) {
  if (done) return; done = true;
  for (const r of waves) r(db);
}
