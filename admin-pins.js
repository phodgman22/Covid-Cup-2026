// Commissioner codes. Imported by admin.html (to let people into the console) and by
// index.html, where the same code turns on commissioner mode: every scorecard open and
// editable, submitted ones included.
//
// These are plain text in public source, same as the Firebase config — a "keep casual
// players out" gate, not real security.

export const ADMIN_PIN = "CUP2026"; // change this, and tell the commissioner the new value

export const ACCEPTED_PINS = [ADMIN_PIN];

export const isAdminCode = value =>
  ACCEPTED_PINS.includes(String(value ?? "").trim().toUpperCase());
