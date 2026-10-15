// Haptics: short vibration pulses where navigator.vibrate exists (not iPhone Safari). Respects the Settings toggle.

import { state } from "./state.js";

export const hapticsSupported = typeof navigator.vibrate === "function";

export function pulse(ms) {
  if (hapticsSupported && state.settings.hapticsEnabled) navigator.vibrate(ms);
}

export const hitPulse = () => pulse(15);   // Perfect / Great / Good
export const holdPulse = () => pulse(40);  // completed hold
