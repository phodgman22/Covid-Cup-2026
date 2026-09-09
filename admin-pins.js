// Commissioner console codes. Imported by admin.html (to let people in) and by
// index.html (so an admin code typed on the player screen redirects to the console
// instead of just being rejected).
//
// These are plain text in public source, same as the Firebase config — a "keep casual
// players out" gate, not real security.

export const ADMIN_PIN = "8E707C6A"; // change this, and tell the commissioner the new value

// Short codes so Andrew and Pat can get in fast while building.
// REMOVE BEFORE THE EVENT — these are guessable without viewing source, and anyone who
// gets into the console can rewrite the course, the roster and every pairing.
export const DEV_PINS = ["ADM1", "ADM2"];

export const ACCEPTED_PINS = [ADMIN_PIN, ...DEV_PINS];

export const isAdminCode = value =>
  ACCEPTED_PINS.includes(String(value ?? "").trim().toUpperCase());
