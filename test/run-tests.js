// Offline test harness: packet builders vs. bytes derived by hand from the EPOMAKER Driver 2.1.92 functions
// cited per case (main_c38c7efc.js, class chain of yc500_th80se_soc). Run: node test/run-tests.js
require('../js/proto.js'); require('../js/data.js');
const P = globalThis.EPO_PROTO, D = globalThis.EPO_DATA;
let pass = 0, fail = 0;
const hx = a => Array.from(a, b => b.toString(16).padStart(2, '0')).join(' ');
function eq(name, got, exp) { const g = hx(got), e = exp.trim().split(/\s+/).join(' ');
  if (g.startsWith(e) && Array.from(got).slice(e.split(' ').length).every((v, i) => v === 0 || name.includes('[data]'))) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n     got ' + g.slice(0, e.length + 30) + '\n     exp ' + e); } }
function ok(name, c) { if (c) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name); } }
function throws(name, f) { try { f(); fail++; console.log('  FAIL ' + name + ' (no throw)'); } catch (e) { pass++; console.log('  ok   ' + name + ' -> ' + e.message); } }

console.log('Reads (commomFeature(r,0) = BIT7: byte7 = 0xFF - sum(0..6))');
eq('identify 0x8F (matches the board log 8f..70)', P.identify(), '8f 00 00 00 00 00 00 70');
eq('GET_LEDPARAM 0x87 (matches board log 87..78)', P.getLed(), '87 00 00 00 00 00 00 78');
eq('GET_PROFILE 0x85 (JF.getCurrentProfile)', P.getProfile(), '85 00 00 00 00 00 00 7a');
eq('GET_KBOPTION 0x86 profile 0 (JC.getKeyboardOption)', P.getOptions(0), '86 00 00 00 00 00 00 79');
eq('GET_DEBOUNCE 0x91 (JC.getDeBounce)', P.getDebounce(), '91 00 00 00 00 00 00 6e');
eq('GET_SLEEPTIME 0x92 (JC.getSleepTime)', P.getSleep(), '92 00 00 00 00 00 00 6d');
eq('GET_KEYMATRIX profile 1 page 3 (JF._getKeyMatrix r[1]=profile r[2]=page)', P.keymapReads(1)[3], '89 01 03 00 00 00 00 72');
eq('GET_FN profile 0 page 7 (eF._getFnKeyMatrix literal 144)', P.keymapReads(0, true)[7], '90 00 07 00 00 00 00 68');
eq('GET_MACRO 5 page 2 (FF.getMacro n[1]=idx n[2]=page)', P.macroReads(5)[2], '8b 05 02 00 00 00 00 6d');
eq('GET_USERPIC page 4 (FF._getLightPic r[1]=0 r[2]=page)', P.userpicReads()[4], '8c 00 04 00 00 00 00 6f');
ok('keymap read = 8 pages, macro read = 4, userpic read = 6', P.keymapReads(0).length === 8 && P.macroReads(0).length === 4 && P.userpicReads().length === 6);

console.log('Lighting (JC.setLightSetting, MAXSPEED 4, NORMAL 7, DAZZLE 8, BIT8 checksum at byte 8)');
eq('AlwaysOn red b4: o=0 -> a2=4, i=7', P.setLed({ type: 'LightAlwaysOn', value: 4, rgb: 0xFF0000 }), '07 01 04 04 07 ff 00 00 e9');
eq('Neon s2 b4: i stays 7, no rgb (his Spectrum restore)', P.setLed({ type: 'LightNeon', value: 4, speed: 2 }), '07 03 02 04 07 00 00 00 e8');
eq('Wave left rainbow s3 b2 green: i=WAVEOP.left<<4|8', P.setLed({ type: 'LightWave', value: 2, speed: 3, option: 'left', dazzle: true, rgb: 0x00FF00 }), '07 04 01 02 18 00 ff 00 da');
eq('Snake "return": i=16|7', P.setLed({ type: 'LightSnake', value: 4, speed: 0, option: 'return', rgb: 0x0000FF }), '07 07 04 04 17 00 00 ff d3');
eq('White FFFFFF sent as FAFAFA', P.setLed({ type: 'LightBreath', value: 4, speed: 4, rgb: 0xFFFFFF }), '07 02 00 04 07 fa fa fa fd');
eq('UserPicture opt 2: i=USEROP[2]=16, rgb 0,200,200, speed unset -> 4', P.setLed({ type: 'LightUserPicture', value: 4, option: '2' }), '07 0d 04 04 10 00 c8 c8 43');
eq('Off: mode 0, a2=4-0', P.setLed({ type: 'LightOff' }), '07 00 04 00 07 00 00 00 ed');
const pl = P.parseLed(Uint8Array.from([0x87, 3, 2, 4, 0, 0xff, 0xff, 0xff]));
ok('parse his real reply 87 03 02 04 00 ff ff ff -> Neon, speed 2, preset red', pl.type === 'LightNeon' && pl.speed === 2 && pl.value === 4 && pl.rgb === 0xFF0000);
ok('driver effect list = 19 effects + Off, no music/screen', P.EFFECTS.length === 20 && !P.EFFECTS.some(e => /Music|Screen/.test(e.type)));

console.log('Profiles / options / debounce / sleep / reset');
eq('SET_PROFILE 1 (JF.setCurrentProfile a[1]=p, BIT7)', P.setProfile(1), '05 01 00 00 00 00 00 f9');
throws('profile 3 refused', () => P.setProfile(3));
const fresh = P.parseOptions(Uint8Array.from([0x86, 0, 0x42, 0x01, 0x00]));
eq('options RMW: keep 0x02 mac + 0x40, set win lock, keep byte3, power save on', P.setOptions(0, fresh, { winLock: true, wasd: false, ledOff: false, powerSave: true }), '06 00 43 01 01 00 00 b4');
const locked = P.parseOptions(Uint8Array.from([0x86, 0, 0x80 | 0x10, 0, 0]));
eq('options RMW strips 0x80 even if the read had it; clears ledOff', P.setOptions(0, locked, { ledOff: false }), '06 00 00 00 00 00 00 f9');
throws('raw options packet with 0x80 is rejected by checkAllowed', () => { const b = P.pkt(0x06, [0, 0x80]); P.checkAllowed(b, 'write'); });
throws('options write without a fresh read is refused', () => P.setOptions(0, null, {}));
eq('SET_DEBOUNCE 5 (JC.setDeBounce a[2]=v)', P.setDebounce(5), '11 00 05 00 00 00 00 e9');
eq('SET_SLEEPTIME 2/3/12/20 min (JC.setSleepTime u16 LE at 8..15)', P.setSleep({ time_bt: 120, time_24: 180, deepTime_bt: 720, deepTime_24: 1200 }), '12 00 00 00 00 00 00 ed 78 00 b4 00 d0 02 b0 04');
ok('parseSleep reads bytes 1..8', JSON.stringify(P.parseSleep(Uint8Array.from([0x92, 0x78, 0, 0xb4, 0, 0xd0, 2, 0xb0, 4]))) === '{"time_bt":120,"time_24":180,"deepTime_bt":720,"deepTime_24":1200}');
eq('SET_RESERT 0x02 (JF.setReSet)', P.reset(), '02 00 00 00 00 00 00 fd');

console.log('Keymap (JC._setKeyConfig / eF._setFnKeyConfig: 9 pages, [op, p, 0xF8, 1, page, 0, 0, ck] + 56 data)');
const M = Uint8Array.from(D.defaultMatrix);
const kw = P.keymapWrites(1, M);
ok('9 pages', kw.length === 9);
eq('page 0 header + first data bytes (Esc slot 0 = 00 00 29 00) [data]', kw[0], '09 01 f8 01 00 00 00 fc 00 00 29 00 00 00 35 00');
ok('page 8 carries matrix[448..503]', hx(kw[8].slice(8, 64)) === hx(M.slice(448, 504)));
eq('Fn page 2 opcode 16 (literal in eF._setFnKeyConfig) [data]', P.keymapWrites(1, M, true)[2], '10 01 f8 01 02 00 00 f3');
ok('default matrix: slot 65 = Fn [10,1,0,0], slot 84 = Mute [3,0,226,0]', hx(M.slice(260, 264)) === '0a 01 00 00' && hx(M.slice(336, 340)) === '03 00 e2 00');
ok('decodeSlot macro [9,1,4,0]', JSON.stringify(P.decodeSlot([9, 1, 4, 0])) === '{"kind":"macro","mode":1,"index":4}');

console.log('Macros (eF.setMacro encoder, BGe._setMacro writer 0x16, eF.buffToMacroEvents decoder)');
const ev = [{ type: 'keyboard', action: 'down', value: 4 }, { type: 'delay', value: 50 }, { type: 'keyboard', action: 'up', value: 4 },
  { type: 'delay', value: 300 }, { type: 'keyboard', action: 'down', value: 5 }, { type: 'delay', value: 20 }, { type: 'keyboard', action: 'up', value: 5 }];
const mb = P.encodeMacro(ev, 1);
eq('encode A↓ 50 A↑ 300 B↓ 20 B↑ [data]', mb, '01 00 04 b2 04 00 2c 01 05 94 05 00');
const mw = P.macroWrites(3, mb);
eq('write header [0x16, idx 3, page 0, 56, last 1] BIT7 [data]', mw[0], '16 03 00 38 01 00 00 ad 01 00 04 b2');
ok('one page for a short macro', mw.length === 1);
const dec = P.decodeMacro(mb);
ok('decode round-trip', JSON.stringify(dec.macroEvents) === JSON.stringify(ev) && dec.repeatCount === 1);
throws('macro index 50 refused (MACROMAX 50)', () => P.macroWrites(50, mb));

console.log('Per-key (hC._setLightPic: 7 pages, [0x0C, 0, 384 LE, page] BIT7)');
const uw = P.userpicWrites({ 0: 0x112233, 127: 0xAABBCC });
ok('7 pages, len 384', uw.length === 7 && P.PICS_LEN === 384);
eq('page 0: header + slot 0 rgb [data]', uw[0], '0c 00 80 01 00 00 00 72 11 22 33');
ok('slot 127 rgb at buffer 381..383 -> page 6 offset 8+(381-336)', hx(uw[6].slice(8 + 45, 8 + 48)) === 'aa bb cc');

console.log('Allow-list');
for (const op of [0x7F, 0xAC, 0x30, 0x31, 0x40, 0x41, 0x04, 0x0A, 0x0B, 0x08]) throws('blocked 0x' + op.toString(16), () => P.checkAllowed(P.pkt(op, []), 'write'));
throws('0x87 cannot be used as a write', () => P.checkAllowed(P.getLed(), 'write'));
throws('0x07 cannot be used as a read', () => P.checkAllowed(P.setLed({ type: 'LightOff' }), 'read'));

console.log(`\n${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
