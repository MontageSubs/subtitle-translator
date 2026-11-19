export interface EarlyIntakeCapture {
  files: File[];
  entries: FileSystemEntry[];
}

export function takeEarlyIntake(): EarlyIntakeCapture {
  const held = window.__earlyIntake;
  if (!held) return { files: [], entries: [] };
  held.armed = false;
  const capture = { files: held.files.splice(0), entries: held.entries.splice(0) };
  document.querySelector("#dropzone")?.removeAttribute("data-intake");
  return capture;
}
