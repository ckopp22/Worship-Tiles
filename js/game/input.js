// Input: Pointer Events on the canvas (tracked by pointerId for multi-touch) plus a D F J K keyboard fallback.
// Reports lane presses and releases; it knows nothing about notes or timing.

import { LANE_COUNT } from "./notes.js";

const KEY_LANES = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };

/** handlers: { onLaneDown(lane), onLaneUp(lane) } */
export function createInput(canvas, { onLaneDown, onLaneUp }) {
  const pointers = new Map(); // pointerId -> lane
  const keysDown = new Set();

  const laneAt = (clientX) => {
    const rect = canvas.getBoundingClientRect();
    const lane = Math.floor(((clientX - rect.left) / rect.width) * LANE_COUNT);
    return Math.max(0, Math.min(LANE_COUNT - 1, lane));
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    const lane = laneAt(e.clientX);
    pointers.set(e.pointerId, lane);
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    onLaneDown(lane);
  };
  // Phase 3b: a pointermove that leaves its lane should count as a release for hold notes.
  const onPointerEnd = (e) => {
    const lane = pointers.get(e.pointerId);
    if (lane === undefined) return;
    pointers.delete(e.pointerId);
    onLaneUp(lane);
  };
  const onKeyDown = (e) => {
    const lane = KEY_LANES[e.code];
    if (lane === undefined || e.repeat || keysDown.has(e.code)) return;
    keysDown.add(e.code);
    onLaneDown(lane);
  };
  const onKeyUp = (e) => {
    const lane = KEY_LANES[e.code];
    if (lane === undefined || !keysDown.delete(e.code)) return;
    onLaneUp(lane);
  };

  return {
    attach() {
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointerup", onPointerEnd);
      canvas.addEventListener("pointercancel", onPointerEnd);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
    },
    detach() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerEnd);
      canvas.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      pointers.clear();
      keysDown.clear();
    },
  };
}
