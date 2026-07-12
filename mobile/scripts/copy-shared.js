'use strict';
/**
 * Copies the modules the mobile app shares with the desktop app into www/.
 * Desktop stays the single source of truth for calendars, merge logic,
 * icons, UI helpers and the timer engine.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..'); // repo root
const www = path.join(__dirname, '..', 'www');

const COPIES = [
  ['src/shared/hijri.js', 'js/shared/hijri.js'],
  ['src/shared/jalali.js', 'js/shared/jalali.js'],
  ['src/shared/merge.js', 'js/shared/merge.js'],
  ['renderer/js/icons.js', 'js/icons.js'],
  ['renderer/js/ui.js', 'js/ui.js'],
  ['renderer/js/timer-engine.js', 'js/timer-engine.js']
];

for (const [from, to] of COPIES) {
  const src = path.join(root, from);
  const dest = path.join(www, to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`copied ${from} -> mobile/www/${to}`);
}
console.log('shared assets in sync');
