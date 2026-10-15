// Input: Pointer Events on the canvas (tracked by pointerId so several fingers work at once) plus a
// D F J K keyboard fallback. Reports lane presses and releases; it knows nothing about notes or timing.
//   onLaneDown(lane): every finger/key press.
//   onLaneUp(lane):   when the LAST finger leaves a lane, when a finger slides into another lane, or on pointercancel.

import { LANE_COUNT } from "./notes.js";

const KEY_LANES = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };

export function createInput(canvas, { onLaneDown, onLaneUp }) {
  const pointers = new Map();                  // pointerId -> lane it is pressing (-1 once it slid out)
  const keysDown = new Set();
  const pressCount = new Array(LANE_COUNT).fill(0); // fingers/keys currently on each lane

  const laneAt = (clientX) => {
    const rect = canvas.getBoundingClientRect();
    const lane = Math.floor(((clientX - rect.left) / rect.width) * LANE_COUNT);
    return Math.max(0, Math.min(LANE_COUNT - 1, lane));
  };

  const press = (lane) => { pressCount[lane]++; onLaneDown(lane); };
  const lift = (lane) => { if (pressCount[lane] > 0 && --pressCount[lane] === 0) onLaneUp(lane); };

  const onPointerDown = (e) => {
    e.preventDefault();
    const lane = laneAt(e.clientX);
    pointers.set(e.pointerId, lane);
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    press(lane);
  };
  const onPointerMove = (e) => {
    const lane = pointers.get(e.pointerId);
    if (lane === undefined || lane < 0 || laneAt(e.clientX) === lane) return;
    pointers.set(e.pointerId, -1); // slid out of its lane: counts as a release
    lift(lane);
  };
  const onPointerEnd = (e) => {
    const lane = pointers.get(e.pointerId);
    if (lane === undefined) return;
    pointers.delete(e.pointerId);
    if (lane >= 0) lift(lane);
  };
  const onKeyDown = (e) => {
    const lane = KEY_LANES[e.code];
    if (lane === undefined || e.repeat || keysDown.has(e.code)) return;
    keysDown.add(e.code);
    press(lane);
  };
  const onKeyUp = (e) => {
    const lane = KEY_LANES[e.code];
    if (lane === undefined || !keysDown.delete(e.code)) return;
    lift(lane);
  };

  return {
    attach() {
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerEnd);
      canvas.addEventListener("pointercancel", onPointerEnd);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
    },
    detach() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerEnd);
      canvas.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      pointers.clear();
      keysDown.clear();
      pressCount.fill(0);
    },
  };
}
