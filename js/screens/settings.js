// Settings: timing offset, volumes, haptics, save backup (Export / Import) and Reset Progress (MDD 4.8).

import { state, subscribe, setSetting, exportSave, parseSave, replaceState } from "../state.js";
import { confirmDialog } from "../ui.js";
import { hapticsSupported } from "../haptics.js";

let statusEl, latency, music, sfx, hapticsBtn;
const $ = (id) => document.getElementById(id);

export function init() {
  statusEl = $("settings-status");
  latency = $("latency-slider");
  music = $("music-slider");
  sfx = $("sfx-slider");
  hapticsBtn = $("haptics-toggle");
  const fileInput = $("import-file");

  latency.addEventListener("input", () => setSetting("latencyOffsetMs", Number(latency.value)));
  music.addEventListener("input", () => setSetting("musicVolume", Number(music.value) / 100));
  sfx.addEventListener("input", () => setSetting("sfxVolume", Number(sfx.value) / 100));

  // Vibration is not available on iPhone Safari: hide the toggle and say so.
  hapticsBtn.hidden = !hapticsSupported;
  $("haptics-note").hidden = hapticsSupported;
  hapticsBtn.addEventListener("click", () => setSetting("hapticsEnabled", !state.settings.hapticsEnabled));

  $("export-save").addEventListener("click", download);
  $("import-save").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = ""; // allow picking the same file again
    if (file) await importFile(file);
  });
  $("reset-progress").addEventListener("click", reset);
  $("app-version").textContent = `Version ${globalThis.WT_VERSION ?? "dev"}`;
  subscribe(render);
  render();
}

export function enter() {
  statusEl.textContent = "";
  render();
}

function render() {
  const s = state.settings;
  latency.value = s.latencyOffsetMs;
  $("latency-value").textContent = `${s.latencyOffsetMs > 0 ? "+" : ""}${s.latencyOffsetMs} ms`;
  music.value = Math.round(s.musicVolume * 100);
  $("music-value").textContent = `${music.value}%`;
  sfx.value = Math.round(s.sfxVolume * 100);
  $("sfx-value").textContent = `${sfx.value}%`;
  hapticsBtn.setAttribute("aria-checked", String(s.hapticsEnabled));
  hapticsBtn.textContent = `Vibration: ${s.hapticsEnabled ? "On" : "Off"}`;
}

function download() {
  const blob = new Blob([exportSave()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `worship-tiles-save-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  statusEl.textContent = "Save exported.";
}

async function importFile(file) {
  const result = parseSave(await file.text());
  if (result.error) { statusEl.textContent = `Import failed: ${result.error}`; return; }
  const ok = await confirmDialog({
    title: "Replace your progress?",
    message: "This overwrites your current Bank, songs and scores with the file's contents.",
    confirmLabel: "Import",
  });
  if (!ok) { statusEl.textContent = "Import cancelled."; return; }
  replaceState(result.save);
  statusEl.textContent = "Save imported.";
}

async function reset() {
  const ok = await confirmDialog({
    title: "Reset all progress?",
    message: "Your Bank, unlocked songs and high scores will be erased. This can't be undone.",
    confirmLabel: "Reset",
  });
  if (!ok) return;
  replaceState(null);
  statusEl.textContent = "Progress reset.";
}
