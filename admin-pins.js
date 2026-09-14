// Commissioner codes. Imported by admin.html (to let people into the console) and by
// index.html, where the same code turns on commissioner mode: every scorecard open and
// editable, submitted ones included.
//
// These are plain text in public source, same as the Firebase config — a "keep casual
// players out" gate, not real security.

export const ADMIN_PIN = "8E707C6A"; // change this, and tell the commissioner the new value

// Short codes so Andrew and Pat can get in fast while building.
// REMOVE BEFORE THE EVENT — these are guessable without viewing source, and anyone who
// gets in can rewrite the course, the roster, every pairing and every scorecard.
export const DEV_PINS = ["ADM1", "ADM2"];

export const ACCEPTED_PINS = [ADMIN_PIN, ...DEV_PINS];

export const isAdminCode = value =>
  ACCEPTED_PINS.includes(String(value ?? "").trim().toUpperCase());
