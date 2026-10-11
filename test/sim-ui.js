// UI simulation: loads index.html + js/* in jsdom with a fake TH80 SE (a small model of the firmware's
// read/write registers) and drives the main flows. Needs jsdom: NODE_PATH=<dir with jsdom> node test/sim-ui.js
const { JSDOM } = require('jsdom'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script src="[^"]+"><\/script>/g, '');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost:8765/' });
const w = dom.window;
const sent = [];
// Fake keyboard state
const kb = { led: [3, 2, 4, 0, 0xff, 0xff, 0xff], profile: 0, opt: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], deb: 5, sleep: [120, 180, 720, 1200],
  km: {}, fn: {}, macro: {}, pic: new Uint8Array(600), pending: null };
const M = JSON.parse(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8').match(/defaultMatrix:(\[[^\]]+\])/)[1]);
for (let p = 0; p < 3; p++) { kb.km[p] = M.slice(); kb.fn[p] = M.slice(); }
let reply = new Uint8Array(64);
const dev = { productId: 0x4015, productName: 'EPOMAKER TH80 SE', opened: true, collections: [{ usagePage: 0xFFFF, usage: 2, featureReports: [{ reportId: 0 }] }],
  async open() {}, async sendFeatureReport(id, b) {
    b = Uint8Array.from(b); sent.push(b); const r = new Uint8Array(64); const op = b[0];
    const ck7 = () => { let s = 0; for (let i = 0; i < 7; i++) s += b[i]; return 0xFF - (s & 0xFF); };
    if (op !== 0x07 && op !== 0x09 && op !== 0x10 && b[7] !== ck7()) throw new Error('bad BIT7 checksum on 0x' + op.toString(16));
    if (op === 0x09 || op === 0x10) { const L = (op === 0x09 ? kb.km : kb.fn)[b[1]]; for (let i = 0; i < 56; i++) if (56 * b[4] + i < 512) L[56 * b[4] + i] = b[8 + i]; }
    switch (op) {
      case 0x8F: r.set([0x8F, 0x43, 0x04, 0, 0, 0, 0, 0x70]); break;
      case 0x80: r.set([0x80, 0x05, 0x01]); break;
      case 0x87: r.set([0x87, ...kb.led]); break;
      case 0x07: { let s = 0; for (let i = 0; i < 8; i++) s += b[i]; if (b[8] !== 0xFF - (s & 0xFF)) throw new Error('bad BIT8'); kb.led = Array.from(b.slice(1, 8)); r.set(reply); break; }
      case 0x85: r.set([0x85, kb.profile]); break;
      case 0x05: kb.profile = b[1]; break;
      case 0x86: r.set([0x86, b[1], ...kb.opt[b[1]]]); break;
      case 0x06: if (b[2] & 0x80) throw new Error('LOCK BIT WRITTEN'); kb.opt[b[1]] = [b[2], b[3], b[4]]; break;
      case 0x91: r.set([0x91, 0, kb.deb]); break;
      case 0x11: kb.deb = b[2]; break;
      case 0x92: { const s = kb.sleep; r.set([0x92, s[0] & 255, s[0] >> 8, s[1] & 255, s[1] >> 8, s[2] & 255, s[2] >> 8, s[3] & 255, s[3] >> 8]); break; }
      case 0x12: kb.sleep = [0, 1, 2, 3].map(k => b[8 + 2 * k] | b[9 + 2 * k] << 8); break;
      case 0x84: r.set([0x84, b[1], 1]); break;
      case 0x89: r.set(kb.km[b[1]].slice(64 * b[2], 64 * b[2] + 64)); break;
      case 0x90: r.set(kb.fn[b[1]].slice(64 * b[2], 64 * b[2] + 64)); break;
      case 0x16: { const m = kb.macro[b[1]] || (kb.macro[b[1]] = new Uint8Array(256)); m.set(b.slice(8, 64).slice(0, Math.max(0, 256 - 56 * b[2])), 56 * b[2]); break; }
      case 0x8B: r.set((kb.macro[b[1]] || new Uint8Array(256)).slice(64 * b[2], 64 * b[2] + 64)); break;
      case 0x0C: kb.pic.set(b.slice(8, 64), 56 * b[4]); break;
      case 0x8C: r.set(kb.pic.slice(64 * b[2], 64 * b[2] + 64)); break;
      case 0x02: kb.led = [3, 2, 4, 0, 0xff, 0xff, 0xff]; break;
    }
    reply = r;
  },
  async receiveFeatureReport() { return new w.DataView(reply.buffer.slice(0)); } };
w.navigator.hid = { requestDevice: async () => [dev], addEventListener() {} };
const downloads = []; w.URL.createObjectURL = b => { downloads.push(b); return 'blob:x'; };
w.HTMLAnchorElement.prototype.click = function () {};
w.confirm = () => true; w.performance = w.performance || { now: Date.now };
for (const f of ['data.js', 'hid-names.js', 'proto.js', 'transport.js', 'app.js']) w.eval(fs.readFileSync(path.join(root, 'js', f), 'utf8'));
const $ = s => w.document.querySelector(s); const hx = a => Array.from(a.slice(0, 9), x => x.toString(16).padStart(2, '0')).join(' ');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (n, c) => { (c ? pass++ : fail++); console.log((c ? '  ok   ' : '  FAIL ') + n); };
const toasts = () => Array.from(w.document.querySelectorAll('.toast')).map(t => t.className + ':' + t.textContent);
const lastToast = () => { const t = toasts(); return t[t.length - 1] || ''; };
const until = async (f, ms = 20000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await sleep(50); } return true; };
(async () => {
  if (w.document.readyState === 'loading') await new Promise(r => w.document.addEventListener('DOMContentLoaded', r));
  $('#bconnect').onclick(); await until(() => $('#chip').className.includes('on'));
  ok('connect + identify -> chip wired TH80 SE', $('#chip').textContent.includes('1091'));
  await until(() => $('#ledinfo').textContent !== '');
  ok('auto read lighting -> Neon', $('#ledinfo').textContent.startsWith('LightNeon'));
  // lighting apply
  $('#live').checked = false; $('#fx').value = 'LightAlwaysOn'; $('#fx').onchange(); $('#col').value = '#00ff00'; $('#bri').value = 3;
  let n = sent.length; $('#bledapply').onclick(); await until(() => lastToast().includes('Lighting'));
  const ledW = sent.slice(n).find(b => b[0] === 0x07); ok('apply static green b3 -> ' + hx(ledW), hx(ledW) === '07 01 04 03 07 00 ff 00 ea'); ok('lighting verified toast', lastToast().includes('verified'));
  // profile
  w.document.querySelector('.prof[data-p="2"]').onclick(); await until(() => lastToast().includes('Profile 3'));
  ok('profile 3 set+verified (kb.profile=' + kb.profile + ')', kb.profile === 2);
  // options RMW with unknown bits preserved
  kb.opt[2] = [0x42, 0x01, 0x00];
  $('#boptr').onclick(); await until(() => $('#o_raw').textContent.startsWith('86')); $('#o_win').checked = true; $('#o_ps').checked = true;
  $('#boptw').onclick(); await until(() => lastToast().includes('Options'));
  ok('options RMW kept 0x42, set win lock, power save -> ' + kb.opt[2].map(x => x.toString(16)), kb.opt[2][0] === 0x43 && kb.opt[2][1] === 1 && kb.opt[2][2] === 1);
  ok('options verified toast', lastToast().includes('verified'));
  // debounce / sleep
  $('#deb').value = 7; $('#bdebw').onclick(); await until(() => lastToast().includes('Debounce')); ok('debounce 7 verified', kb.deb === 7 && lastToast().includes('verified'));
  $('#bslr').onclick(); await until(() => $('#time_bt').value === '2'); $('#time_24').value = 5; $('#bslw').onclick(); await until(() => lastToast().includes('Sleep'));
  ok('sleep 2.4G = 5 min (' + kb.sleep + ')', kb.sleep[1] === 300 && lastToast().includes('verified'));
  // keymap: read, remap CapsLock -> Esc, write (auto backup first)
  $('#kmp').value = '0'; $('#kml').value = 'n'; $('#bkmr').onclick(); await until(() => lastToast().includes('Layer read'));
  const caps = Array.from(w.document.querySelectorAll('#kmboard .key')).find(k => k.textContent.startsWith('Caps'));
  caps.onclick(); $('#kmtype').value = 'key'; $('#kmtype').onchange(); $('#kmmod').value = '0'; $('#kmhid').value = '41'; $('#bkmset').onclick();
  n = downloads.length; $('#bkmw').onclick(); await until(() => lastToast().includes('Keymap'), 30000);
  ok('auto backup downloaded before first keymap write', downloads.length === n + 1);
  const capsSlot = +caps.dataset.slot; ok('slot ' + capsSlot + ' (Caps) now Esc on profile 1', kb.km[0][4 * capsSlot + 2] === 41 && kb.km[0][4 * capsSlot] === 0);
  ok('other profiles untouched', kb.km[1].join() === M.join()); ok('keymap verified toast', lastToast().includes('verified'));
  // macro: build, write, read back
  $('#midx').value = 4; $('#bmclr').onclick();
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'KeyH' })); // not recording: ignored
  $('#bmrec').onclick(); w.document.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'KeyH' })); await sleep(30); w.document.dispatchEvent(new w.KeyboardEvent('keyup', { code: 'KeyH' })); $('#bmrec').onclick();
  ok('recorded H down, delay, H up', w.document.querySelectorAll('#mlist .mrow').length === 3);
  $('#bmw').onclick(); await until(() => lastToast().includes('Macro 4 verified') || lastToast().includes('differs'), 20000);
  ok('macro 4 written + verified', !!kb.macro[4] && kb.macro[4][2] === 11 && lastToast().includes('verified'));
  // per-key
  w.EPO_APP.S.pk = { 0: 0xFF0000 }; n = sent.length; $('#pkup').onclick(); await until(() => sent.slice(n).some(b => b[0] === 0x07 && b[1] === 13), 30000);
  const pics = sent.slice(n).filter(b => b[0] === 0x0C); ok('per-key: 7 USERPIC pages then LED mode 13', pics.length === 7 && kb.pic[0] === 0xFF);
  // full backup
  n = downloads.length; $('#bfull').onclick(); await until(() => downloads.length > n, 30000); ok('full backup downloaded', downloads.length === n + 1);
  // safety: nothing outside allow-list, lock never set
  const ops = new Set(sent.map(b => b[0])); ok('ops used: ' + Array.from(ops).map(x => x.toString(16)).sort().join(','), Array.from(ops).every(o => o in w.EPO_PROTO.ALLOW));
  ok('no 0x06 packet ever had 0x80', sent.filter(b => b[0] === 6).every(b => !(b[2] & 0x80)));
  // reset requires typed confirmation
  n = sent.length; $('#brst').onclick(); await sleep(200); ok('reset refused without typed confirmation', !sent.slice(n).some(b => b[0] === 2));
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
