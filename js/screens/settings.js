// Settings: save backup (Export / Import) and Reset Progress (MDD 4.8). Haptics and calibration come in Phase 6.

import { exportSave, parseSave, replaceState } from "../state.js";
import { confirmDialog } from "../ui.js";

let statusEl;

export function init() {
  statusEl = document.getElementById("settings-status");
  const fileInput = document.getElementById("import-file");

  document.getElementById("export-save").addEventListener("click", download);
  document.getElementById("import-save").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = ""; // allow picking the same file again
    if (file) await importFile(file);
  });
  document.getElementById("reset-progress").addEventListener("click", reset);
}

export function enter() {
  statusEl.textContent = "";
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
