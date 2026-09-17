// Passwordless (magic-link) auth. Invite-only by design: friends are added
// as users via the Supabase dashboard (docs/HOSTING.md) — nobody can create
// their own account unless "Allow new users to sign up" is turned on in
// Supabase Auth settings (leave it off for the invite-only posture).
import { supabase } from './supabase.js';

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// fn(session|null) — fires on sign-in, sign-out, and token refresh, and
// once immediately with the current state (per supabase-js semantics).
export function onAuthChange(fn) {
  supabase.auth.onAuthStateChange((_event, session) => fn(session));
}

export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  return { error };
}

export async function signOut() {
  await supabase.auth.signOut();
}
