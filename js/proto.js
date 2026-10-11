// SPDX-License-Identifier: GPL-3.0-or-later
// EpoControl protocol layer for the EPOMAKER TH80 SE (device id 1091, yc500).
// Source of truth: official EPOMAKER Driver 2.1.92, resources/app/dist/static/js/main_c38c7efc.js.
// The driver's factory maps name "yc500_th80se_soc" -> class tgt, whose chain is
//   tgt -> BGe -> JC -> OC -> hC -> JF -> FF -> dF -> eF.
// Opcodes below are the effective (most-derived) values of that chain. Cross-checked with
// sharkfin docs/PROTOCOL.md (yc500 column). Pure functions only: no I/O, so test/run-tests.js can verify them.
(function (g) {
  'use strict';
  const LEN = 64;

  // Effective FEA_CMD_* values for the tgt chain (class that defines the winning value in brackets).
  const OP = {
    GET_INFOR: 0x8F,      // identify [FF]
    GET_REV: 0x80,        // firmware version [FF], JC.getFirmwareVersion reads u16 LE at 1
    SET_RESET: 0x02,      // FEA_CMD_SET_RESERT [FF], JF.setReSet
    SET_PROFILE: 0x05, GET_PROFILE: 0x85,     // [FF], JF.setCurrentProfile / getCurrentProfile
    SET_KBOPTION: 0x06, GET_KBOPTION: 0x86,   // [JC], JC.setKeyboardOption / getKeyboardOption
    SET_LEDPARAM: 0x07, GET_LEDPARAM: 0x87,   // [FF], JC.setLightSetting / getLightSetting
    SET_KEYMATRIX: 0x09, GET_KEYMATRIX: 0x89, // [FF], JC._setKeyConfig / JF._getKeyMatrix
    SET_USERPIC: 0x0C, GET_USERPIC: 0x8C,     // [FF], hC._setLightPic / FF._getLightPic
    SET_FN: 0x10, GET_FN: 0x90,               // literal 16 / 144 in eF._setFnKeyConfig / eF._getFnKeyMatrix
    SET_DEBOUNCE: 0x11, GET_DEBOUNCE: 0x91,   // [JF], JC.setDeBounce / getDeBounce
    SET_SLEEPTIME: 0x12, GET_SLEEPTIME: 0x92, // [eF], JC.setSleepTime / getSleepTime
    SET_MACRO: 0x16, GET_MACRO: 0x8B,         // SET_MACRO_SIMPLE [BGe] used by BGe._setMacro; GET_MACRO [FF] used by FF.getMacro
    GET_REPORT: 0x84,                         // [FF], JC.getReportRate (read only in this app)
  };

  // Explicit allow-list per opcode and direction. Anything else throws before it reaches the wire.
  // Deliberately absent: 0x7F bootloader, 0xAC flash-chip erase, 0x30/0x31/0x40/0x41 OLED/MLED boot,
  // 0x04 report-rate write, 0x08 side light (no side light in this board's driver config), 0x0A key-enable,
  // 0x0B SET_MACRO, 0x0D/0x0E audio/windows, 0x13-0x15 simple writes, magnetism, TFT/OLED.
  const ALLOW = {
    0x8F: 'read', 0x80: 'read', 0x85: 'read', 0x86: 'read', 0x87: 'read', 0x89: 'read', 0x8C: 'read',
    0x90: 'read', 0x91: 'read', 0x92: 'read', 0x8B: 'read', 0x84: 'read',
    0x07: 'write', 0x05: 'write', 0x06: 'write', 0x09: 'write', 0x0C: 'write', 0x10: 'write',
    0x11: 'write', 0x12: 'write', 0x16: 'write', 0x02: 'write',
  };
  function checkAllowed(buf, dir) {
    const d = ALLOW[buf[0]];
    if (!d) throw new Error('opcode 0x' + buf[0].toString(16) + ' is not on the allow-list');
    if (dir && d !== dir) throw new Error('opcode 0x' + buf[0].toString(16) + ' is allowed only as ' + d);
    if (buf[0] === OP.SET_KBOPTION) assertNoLock(buf);
    return d;
  }

  // Driver CheckSumType {BIT7:0, BIT8:1, NONE:2} (proto.driver.CheckSumType). BIT7: byte7 = 0xFF - sum(0..6).
  // BIT8: byte8 = 0xFF - sum(0..7). The native iot_driver applies it; we apply it here.
  function checksum(b, type) {
    if (type === 7) { let s = 0; for (let i = 0; i < 7; i++) s += b[i]; b[7] = 0xFF - (s & 0xFF); }
    else if (type === 8) { let s = 0; for (let i = 0; i < 8; i++) s += b[i]; b[8] = 0xFF - (s & 0xFF); }
    return b;
  }
  function pkt(op, head, ck, data) {
    const b = new Uint8Array(LEN); b[0] = op;
    (head || []).forEach((v, i) => { b[1 + i] = v & 0xFF; });
    if (data) b.set(data.slice(0, 56), 8);
    return checksum(b, ck === undefined ? 7 : ck);
  }

  // ---------- simple reads (commomFeature(r,0) = BIT7) ----------
  const identify = () => pkt(OP.GET_INFOR, []);
  const getRev = () => pkt(OP.GET_REV, []);
  const getLed = () => pkt(OP.GET_LEDPARAM, []);
  const getProfile = () => pkt(OP.GET_PROFILE, []);             // JF.getCurrentProfile: profile = reply[1]
  const getOptions = (p) => pkt(OP.GET_KBOPTION, [p]);           // JC.getKeyboardOption: r[1]=currentProfile
  const getDebounce = () => pkt(OP.GET_DEBOUNCE, []);           // JC.getDeBounce: value = reply[2]
  const getSleep = () => pkt(OP.GET_SLEEPTIME, []);             // JC.getSleepTime: u16 LE at 1,3,5,7
  const getReportRate = (p) => pkt(OP.GET_REPORT, [p]);          // JC.getReportRate: reply[2] 1/2/4/8 -> 1000/500/250/125

  // ---------- lighting: JC.setLightSetting ----------
  // a[1]=mode, a[2]=MAXSPEED(4)-speed, a[3]=value(brightness), a[4]=flags, a[5..7]=rgb; writeFeatureCmd(a, BIT8, 500).
  // flags default i=7; y = dazzle ? DAZZLE(8) : NORMAL(7). White 0xFFFFFF is sent as 0xFAFAFA.
  const MAXSPEED = 4, NORMAL = 7, DAZZLE = 8;
  const WAVEOP = { right: 0, left: 1, down: 2, up: 3 };                 // JF.WAVEOP
  const USEROP = { 1: 0, 2: 16, 3: 32 };                                // JC.USEROP (options "1","2","3" for this board)
  const COMMONCOLOR = [0xFF0000, 0xFF8000, 0xFFFF00, 0x00FF00, 0x00FFFF, 0x0000FF, 0xFF00FF]; // JC.COMMONCOLOR
  // Effects the driver offers for this board (Yy.light.types), with setLightSetting's mode numbers and option encoders.
  // kind: 'flag' = i=y (fixed/rainbow); 'none' = i stays 7; 'opt' = option bit 16 or WAVEOP<<4, ORed with y.
  const EFFECTS = [
    { type: 'LightOff', mode: 0, kind: 'off' },   // setLightSetting case LightOff (not listed in Yy; generic)
    { type: 'LightAlwaysOn', mode: 1, kind: 'flag', speed: false },
    { type: 'LightBreath', mode: 2, kind: 'flag' },
    { type: 'LightNeon', mode: 3, kind: 'none', rgb: false },
    { type: 'LightWave', mode: 4, kind: 'wave', options: ['right', 'left', 'down', 'up'] },
    { type: 'LightRipple', mode: 5, kind: 'flag' },
    { type: 'LightRaindrop', mode: 6, kind: 'flag' },
    { type: 'LightSnake', mode: 7, kind: 'bit', options: ['z', 'return'] },
    { type: 'LightPressAction', mode: 8, kind: 'flag' },
    { type: 'LightConverage', mode: 9, kind: 'flag' },
    { type: 'LightSineWave', mode: 10, kind: 'flag' },
    { type: 'LightKaleidoscope', mode: 11, kind: 'bit', options: ['out', 'in'] },
    { type: 'LightLineWave', mode: 12, kind: 'bit', options: ['right', 'left'] },
    { type: 'LightUserPicture', mode: 13, kind: 'userpic', options: ['1', '2', '3'], speed: false, rgb: false },
    { type: 'LightLaser', mode: 14, kind: 'flag' },
    { type: 'LightCircleWave', mode: 15, kind: 'bit', options: ['anti-clockwise', 'clockwise'] },
    { type: 'LightDazzing', mode: 16, kind: 'flag' },
    { type: 'LightRainDown', mode: 17, kind: 'flag' },
    { type: 'LightMeteor', mode: 18, kind: 'flag' },
    { type: 'LightPressActionOff', mode: 19, kind: 'flag' },
  ];
  // Excluded on purpose: LightMusicFollow2/3 and LightScreenColor need host audio/screen streaming.
  function fixWhite(rgb) { return rgb === 0xFFFFFF ? 0xFAFAFA : rgb; }
  function setLed(s) {
    const e = EFFECTS.find(x => x.type === s.type); if (!e) throw new Error('unknown effect ' + s.type);
    let mode = e.mode, o = 0, u = 0, i = 7;
    const y = s.dazzle ? DAZZLE : NORMAL;
    if (e.kind !== 'off') {
      u = clamp(s.value, 0, 4);
      if (e.speed !== false) o = clamp(s.speed, 0, MAXSPEED);
      if (e.kind === 'flag') i = y;
      else if (e.kind === 'wave') i = ((WAVEOP[s.option] !== undefined ? WAVEOP[s.option] : 0) << 4) | y;
      else if (e.kind === 'bit') i = (s.option === undefined || s.option === e.options[0] ? 0 : 16) | y;
      else if (e.kind === 'userpic') i = USEROP[s.option] !== undefined ? USEROP[s.option] : 0;
      // 'none' (Neon): i stays 7, exactly like the driver.
    }
    const b = new Uint8Array(LEN);
    b[0] = OP.SET_LEDPARAM; b[1] = mode; b[2] = MAXSPEED - o; b[3] = u; b[4] = i;
    if (e.kind === 'userpic') { b[5] = 0; b[6] = 200; b[7] = 200; }   // driver: LightUserPicture -> rgb (0,200,200)
    else if (s.rgb !== undefined && e.rgb !== false && e.kind !== 'off') { const c = fixWhite(s.rgb); b[5] = c >> 16 & 255; b[6] = c >> 8 & 255; b[7] = c & 255; }
    return checksum(b, 8);
  }
  // JC.getLightSetting decode.
  function parseLed(r) {
    if (!r || r[0] !== OP.GET_LEDPARAM) return null;
    const mode = r[1], speed = MAXSPEED - r[2], value = r[3], flags = r[4], opt = flags >> 4, nib = flags & 15;
    let rgb = (r[5] << 16) | (r[6] << 8) | r[7];
    if (nib !== DAZZLE && nib !== NORMAL && COMMONCOLOR[nib] !== undefined) rgb = COMMONCOLOR[nib];
    if (rgb === 0xFAFAFA) rgb = 0xFFFFFF;
    const e = EFFECTS.find(x => x.mode === mode);
    let option;
    if (e && e.kind === 'wave') option = Object.keys(WAVEOP).find(k => WAVEOP[k] === opt) || 'right';
    else if (e && e.kind === 'bit') option = opt === 0 ? e.options[0] : e.options[1];
    else if (e && e.kind === 'userpic') option = Object.keys(USEROP).find(k => USEROP[k] === flags) || '1';
    return { type: e ? e.type : 'Unknown(' + mode + ')', mode, speed: clamp(speed, 0, 4), value, flags, option, dazzle: nib === DAZZLE, rgb };
  }

  // ---------- profiles: JF.setCurrentProfile ----------
  const PROFILES = 3; // inferred: manual Fn+Z/X/C "layers 1/2/3"; driver loops profiles for keymaps
  const setProfile = (p) => { if (!(p >= 0 && p < PROFILES)) throw new Error('profile out of range'); return pkt(OP.SET_PROFILE, [p]); };

  // ---------- options: JC.setKeyboardOption / getKeyboardOption ----------
  // byte2: 1 winKeyLock, 2 system(mac) [getter], 8 WASD swap, 16 ledOff, 32 sLedOff, 64 keyboardMode, 128 keyboardLock.
  // byte3: bit0 keyboardFnKeyMatrix. byte4: powerSaveMode.
  // NOTE: the driver's setter writes system at o<<2 (0x04) while its getter reads 0x02, so Mac/Win is read-only here.
  const OPT_WRITABLE = 0x01 | 0x08 | 0x10;  // win lock, WASD swap, ledOff: the only byte-2 bits this app changes
  const OPT_LOCK = 0x80;
  function parseOptions(r) {
    if (!r || r[0] !== OP.GET_KBOPTION) return null;
    const n = r[2];
    return { raw2: n, raw3: r[3], raw4: r[4], winLock: !!(n & 1), mac: !!(n & 2), wasd: !!(n & 8), ledOff: !!(n & 16),
      sLedOff: !!(n & 32), keyboardMode: !!(n & 64), keyboardLock: !!(n & 128), fnMatrix: !!(r[3] & 1), powerSave: !!r[4] };
  }
  // Read-modify-write from a fresh read: only OPT_WRITABLE bits and byte 4 change; everything else is copied; lock forced 0.
  function setOptions(profile, fresh, want) {
    if (!fresh) throw new Error('options write needs a fresh read');
    let b2 = fresh.raw2 & ~OPT_WRITABLE;
    if (want.winLock) b2 |= 0x01;
    if (want.wasd) b2 |= 0x08;
    if (want.ledOff) b2 |= 0x10;
    b2 &= ~OPT_LOCK;
    const b4 = want.powerSave === undefined ? fresh.raw4 : (want.powerSave ? 1 : 0);
    const b = pkt(OP.SET_KBOPTION, [profile, b2, fresh.raw3, b4]);
    assertNoLock(b);
    return b;
  }
  function assertNoLock(b) { if (b[0] === OP.SET_KBOPTION && (b[2] & OPT_LOCK)) throw new Error('ASSERTION: keyboard-lock bit 0x80 must never be written'); }

  // ---------- debounce / sleep ----------
  const setDebounce = (v) => { const b = new Uint8Array(LEN); b[0] = OP.SET_DEBOUNCE; b[2] = clamp(v, 1, 10); return checksum(b, 7); }; // JC.setDeBounce a[2]=v
  // JC.setSleepTime: u16 LE at 8 time_bt, 10 time_24, 12 deepTime_bt, 14 deepTime_24 (seconds). BIT7 over bytes 0..6 (opcode only).
  // Ranges from driver otherSetting Iu: sleep 1..60 min, deep 10..60 min.
  function setSleep(t) {
    const b = new Uint8Array(LEN); b[0] = OP.SET_SLEEPTIME;
    const put = (off, v) => { b[off] = v & 255; b[off + 1] = v >> 8 & 255; };
    put(8, clamp(t.time_bt, 60, 3600)); put(10, clamp(t.time_24, 60, 3600));
    put(12, clamp(t.deepTime_bt, 600, 3600)); put(14, clamp(t.deepTime_24, 600, 3600));
    return checksum(b, 7);
  }
  function parseSleep(r) { if (!r || r[0] !== OP.GET_SLEEPTIME) return null; const u = o => r[o] | r[o + 1] << 8;
    return { time_bt: u(1), time_24: u(3), deepTime_bt: u(5), deepTime_24: u(7) }; }
  const reset = () => pkt(OP.SET_RESET, []);  // JF.setReSet: bare opcode, BIT7

  // ---------- keymap: JF._getKeyMatrix / JC._setKeyConfig / eF._getFnKeyMatrix / eF._setFnKeyConfig ----------
  // Read: [0x89, profile, page] for page 0..7, raw 64-byte replies concatenated (512 bytes = 128 slots x 4).
  // Fn read: [0x90, fnIndex(profile), page] 0..7.
  // Write: 9 pages, header [op, profile, 0xF8, 1, page, 0, 0, 0xFF-(sum(0..6)&0xFF)] + 56 data bytes (matrix.slice(56*page)).
  const keymapReads = (p, fn) => Array.from({ length: 8 }, (_, n) => pkt(fn ? OP.GET_FN : OP.GET_KEYMATRIX, [p, n]));
  function keymapWrites(p, matrix, fn) {
    if (matrix.length !== 512) throw new Error('matrix must be 512 bytes');
    const out = [];
    for (let o = 0; o < 9; o++) {
      const data = Array.from(matrix.slice(56 * o, 56 * o + 56)); while (data.length < 56) data.push(0);
      out.push(pkt(fn ? OP.SET_FN : OP.SET_KEYMATRIX, [p, 0xF8, 1, o], 7, data));
    }
    return out;
  }
  // Slot codes (driver DM()): key/combo [0, modifier, hid, hid2]; consumer [3,0,lo,hi]; Fn [10,1,0,0];
  // macro [9, mode(0 repeat_times,1 on_off,2 touch_repeat), index, 0]; disabled [0,0,0,0].
  const MOD = { none: 0, ctrl: 224, shift: 225, alt: 226, win: 227 }; // driver rF
  function decodeSlot(s) {
    const [a, b, c, d] = s;
    if (a === 0 && b === 0 && c === 0 && d === 0) return { kind: 'none' };
    if (a === 0) return { kind: 'key', mod: b, hid: c, hid2: d };
    if (a === 3) return { kind: 'consumer', usage: c | d << 8 };
    if (a === 9) return { kind: 'macro', mode: b, index: c };
    if (a === 10 && b === 1) return { kind: 'fn' };
    return { kind: 'special', raw: [a, b, c, d] };
  }

  // ---------- macros: BGe._setMacro / eF.setMacro (encoder) / FF.getMacro / eF.buffToMacroEvents ----------
  // Encoder ported line by line from eF.setMacro: 256-byte buffer, u16 LE repeatCount, then per keyboard event
  // [hid][bit7=down | inline delay<=127]; a following delay >127 (or none) is written as u16 LE.
  function encodeMacro(events, repeatCount) {
    const o = new Uint8Array(256); let u = 0, i = false;
    const w8 = v => { o[u++] = v & 255; }, w16 = v => { o[u++] = v & 255; o[u++] = v >> 8 & 255; };
    w16(repeatCount || 1);
    for (let t = 0; t < events.length; t++) {
      const a = events[t];
      if (a.type !== 'delay' && i === true) w16(0);
      if (a.type === 'delay') { if (i) w16(a.value); else { w16(0); w16(a.value); } i = false; }
      else if (a.type === 'keyboard') {
        w8(a.value); i = true;
        let r = 0; if (t + 1 < events.length) { const nx = events[t + 1]; if (nx.type === 'delay' && nx.value <= 127) r = nx.value; }
        r = a.action === 'down' ? (r | 128) : (r & ~128);
        w8(r); i = true; if ((r & 127) > 0) { i = false; t++; }
      }
      if (u > 250) throw new Error('macro too long for the 256-byte buffer');
    }
    return o;
  }
  // BGe._setMacro: pages = number of non-zero 56-byte chunks among the first 5; header [0x16, index, page, 56, last] BIT7.
  function macroWrites(index, buf) {
    if (!(index >= 0 && index < 50)) throw new Error('macro index out of range (MACROMAX 50)');
    const arr = Array.from(buf); let n = 0;
    for (let k = 0; k < 5; k++) if (arr.slice(56 * k, 56 * k + 56).some(v => v !== 0)) n++;
    const out = [];
    for (let k = 0; k < n; k++) out.push(pkt(OP.SET_MACRO, [index, k, 56, k === n - 1 ? 1 : 0], 7, arr.slice(56 * k, 56 * k + 56)));
    return out;
  }
  const macroReads = (index) => Array.from({ length: 4 }, (_, k) => pkt(OP.GET_MACRO, [index, k]));
  // Port of eF.buffToMacroEvents (keyboard events + delays).
  function decodeMacro(e) {
    const t = []; const rd16 = o => e[o] | e[o + 1] << 8; const repeatCount = rd16(0); let a = 2;
    let n = e.slice(a, a + 4); a += 4;
    while (a < e.length) {
      if (n[0] === 249) { t.push({ type: 'mouse_move' }); let ov = 0; if (n[1] !== 0) ov = n[1] >> 1; else { ov = rd16(a); a += 2; } t.push({ type: 'delay', value: ov }); }
      else {
        if (n[0] >= 4 && n[0] <= 239) t.push({ type: 'keyboard', action: (n[1] >> 7 & 1) === 0 ? 'up' : 'down', value: n[0] });
        let l = 0; if ((127 & n[1]) !== 0) { l = 127 & n[1]; a -= 2; } else l = n[2] | n[3] << 8;
        t.push({ type: 'delay', value: l });
      }
      n = e.slice(a, a + 4); if (n.length < 4 || (n[0] === 0 && n[1] === 0 && n[2] === 0 && n[3] === 0)) break; a += 4;
    }
    return { macroEvents: t.filter(x => !(x.type === 'delay' && x.value === 0)), repeatCount };
  }

  // ---------- per-key RGB: dF.setLightPic / hC._setLightPic / FF._getLightPic ----------
  // Buffer 600 bytes, slot i at 3*i (slot index from the default matrix). 7 pages of 56 bytes;
  // header [0x0C, 0, len lo, len hi, page], len = 64*picsCount = 64*floor(128*3/64) = 384. BIT7, LITTLECMDDELAY 20 ms.
  const PICS_LEN = 64 * Math.floor(512 / 4 * 3 / 64);
  function userpicWrites(rgbBySlot) {
    const n = new Uint8Array(600);
    for (const [slot, rgb] of Object.entries(rgbBySlot)) { const i = +slot; n[3 * i] = rgb >> 16 & 255; n[3 * i + 1] = rgb >> 8 & 255; n[3 * i + 2] = rgb & 255; }
    const out = [];
    for (let l = 0; l < 7; l++) out.push(pkt(OP.SET_USERPIC, [0, PICS_LEN & 255, PICS_LEN >> 8, l], 7, Array.from(n.slice(56 * l, 56 * l + 56))));
    return out;
  }
  const userpicReads = () => Array.from({ length: 6 }, (_, n) => pkt(OP.GET_USERPIC, [0, n]));

  function clamp(v, lo, hi) { v = Number(v); if (!Number.isFinite(v)) v = lo; return Math.max(lo, Math.min(hi, Math.round(v))); }

  g.EPO_PROTO = { LEN, OP, ALLOW, checkAllowed, checksum, pkt, identify, getRev, getLed, setLed, parseLed, EFFECTS, COMMONCOLOR,
    MAXSPEED, NORMAL, DAZZLE, getProfile, setProfile, PROFILES, getOptions, parseOptions, setOptions, OPT_WRITABLE, OPT_LOCK,
    assertNoLock, getDebounce, setDebounce, getSleep, setSleep, parseSleep, getReportRate, reset, keymapReads, keymapWrites,
    decodeSlot, MOD, encodeMacro, decodeMacro, macroWrites, macroReads, userpicWrites, userpicReads, PICS_LEN };
})(typeof window !== 'undefined' ? window : globalThis);
