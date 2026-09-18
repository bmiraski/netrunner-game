// Central card-script registration. Wave files add themselves here.
import { registerPilots } from './pilots.js';
import { registerWavesA } from './waves-a.js';
import { registerWavesB } from './waves-b.js';
import { registerWavesC } from './waves-c.js';
import { registerWavesD } from './waves-d.js';
import { registerWavesGenesisA } from './waves-genesis-a.js';
import { registerWavesGenesisB } from './waves-genesis-b.js';

const waves = [registerPilots, registerWavesA, registerWavesB, registerWavesC, registerWavesD,
  registerWavesGenesisA, registerWavesGenesisB];
// WAVE REGISTRATIONS (batch agents: import your registerWavesX above and push
// it here, keeping alphabetical batch order A, B, C, D):

let done = false;
export function registerAll(db) {
  if (done) return; done = true;
  for (const r of waves) r(db);
}
