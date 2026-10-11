// SPDX-License-Identifier: GPL-3.0-or-later
// USB HID usage names (keyboard page 0x07) and consumer usages offered by the driver (tables tM / rM).
(function (g) {
  const K = {};
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => K[4 + i] = c);
  '1234567890'.split('').forEach((c, i) => K[30 + i] = c);
  Object.assign(K, { 40: 'Enter', 41: 'Esc', 42: 'Backspace', 43: 'Tab', 44: 'Space', 45: '-', 46: '=', 47: '[', 48: ']', 49: '\\', 50: '#(ISO)',
    51: ';', 52: "'", 53: '`', 54: ',', 55: '.', 56: '/', 57: 'Caps Lock', 70: 'PrtSc', 71: 'Scroll Lock', 72: 'Pause', 73: 'Insert', 74: 'Home',
    75: 'Page Up', 76: 'Delete', 77: 'End', 78: 'Page Down', 79: '→', 80: '←', 81: '↓', 82: '↑', 83: 'Num Lock', 84: 'KP /', 85: 'KP *', 86: 'KP -',
    87: 'KP +', 88: 'KP Enter', 89: 'KP 1', 90: 'KP 2', 91: 'KP 3', 92: 'KP 4', 93: 'KP 5', 94: 'KP 6', 95: 'KP 7', 96: 'KP 8', 97: 'KP 9', 98: 'KP 0',
    99: 'KP .', 100: '\\(ISO)', 101: 'Menu', 224: 'L Ctrl', 225: 'L Shift', 226: 'L Alt', 227: 'L Win', 228: 'R Ctrl', 229: 'R Shift', 230: 'R Alt', 231: 'R Win' });
  for (let i = 0; i < 12; i++) K[58 + i] = 'F' + (i + 1);
  for (let i = 0; i < 12; i++) K[104 + i] = 'F' + (13 + i);
  // Consumer slots [3, 0, lo, hi] from driver table tM / rM.
  const CONSUMER = [
    ['Previous track', 182], ['Next track', 181], ['Stop', 183], ['Play/Pause', 205], ['Mute', 226], ['Volume -', 234], ['Volume +', 233],
    ['Media player', 0x183], ['Calculator', 0x192], ['Mail', 0x18A], ['My Computer', 0x194], ['Search', 0x221], ['Browser home', 0x223],
    ['Browser back', 0x224], ['Browser refresh', 0x227], ['Screen brightness -', 112], ['Screen brightness +', 111]];
  // KeyboardEvent.code -> HID usage, for macro recording.
  const CODE = {};
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => CODE['Key' + c] = 4 + i);
  '1234567890'.split('').forEach((c, i) => CODE['Digit' + c] = 30 + i);
  for (let i = 0; i < 12; i++) CODE['F' + (i + 1)] = 58 + i;
  Object.assign(CODE, { Enter: 40, Escape: 41, Backspace: 42, Tab: 43, Space: 44, Minus: 45, Equal: 46, BracketLeft: 47, BracketRight: 48, Backslash: 49,
    Semicolon: 51, Quote: 52, Backquote: 53, Comma: 54, Period: 55, Slash: 56, CapsLock: 57, PrintScreen: 70, ScrollLock: 71, Pause: 72, Insert: 73,
    Home: 74, PageUp: 75, Delete: 76, End: 77, PageDown: 78, ArrowRight: 79, ArrowLeft: 80, ArrowDown: 81, ArrowUp: 82, ContextMenu: 101,
    ControlLeft: 224, ShiftLeft: 225, AltLeft: 226, MetaLeft: 227, ControlRight: 228, ShiftRight: 229, AltRight: 230, MetaRight: 231 });
  g.EPO_HID = { KEYS: K, CONSUMER, CODE };
})(typeof window !== 'undefined' ? window : globalThis);
