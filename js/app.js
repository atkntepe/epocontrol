// SPDX-License-Identifier: GPL-3.0-or-later
// EpoControl UI. All packets come from js/proto.js; all I/O from js/transport.js.
(function () {
  const P = window.EPO_PROTO, D = window.EPO_DATA, H = window.EPO_HID, hex = window.EPO_hex, sleep = window.EPO_sleep;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const el = (t, a, ...k) => { const e = document.createElement(t); if (a) for (const [x, v] of Object.entries(a)) { if (x === 'class') e.className = v; else if (x.startsWith('on')) e[x] = v; else if (x === 'html') e.innerHTML = v; else e.setAttribute(x, v); } k.flat().forEach(c => c != null && e.append(c)); return e; };
  const LOCAL_REG = { 1091: ['EPOMAKER TH80 SE (driver 2.1.92: yc500_th80se_soc)', 'yc500', 0, '3151:4015'] };
  const S = { dev: null, tx: null, ident: null, profile: 0, led: null, opts: {}, km: {}, backupTaken: false, macros: {}, pk: {}, pkQueue: 0, lastPk: 0 };
  window.EPO_STATE = S;

  // ---------- log / toast ----------
  function log(cls, msg) { const d = el('div', { class: cls }, new Date().toLocaleTimeString() + '  ' + msg); const L = $('#log'); L.append(d); if (L.children.length > 1500) L.firstChild.remove(); L.scrollTop = 1e9; }
  function toast(ok, msg) { const t = el('div', { class: 'toast ' + (ok === true ? 'ok' : ok === false ? 'bad' : 'info') }, msg); $('#toasts').append(t); setTimeout(() => t.remove(), 5000); }
  const need = () => { if (!S.tx || !S.ident || !S.ident.ok) { toast(false, 'Connect and identify first (USB cable).'); throw new Error('not connected'); } };
  async function guard(fn) { try { await fn(); } catch (e) { if (e.message !== 'not connected') { log('er', e.message); toast(false, e.message); } } }

  // ---------- connection ----------
  async function connect() {
    if (!('hid' in navigator)) return toast(false, 'WebHID unavailable: use Chrome or Edge on http://localhost:8765');
    const ds = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x3151, usagePage: 0xFFFF, usage: 2 }, { vendorId: 0x3151, usagePage: 0xFFFF, usage: 1 }] });
    if (!ds.length) return;
    const dev = ds.find(d => d.collections.some(c => c.usagePage === 0xFFFF && c.featureReports.some(r => r.reportId === 0))) || ds[0];
    if (!dev.opened) await dev.open();
    S.dev = dev; S.tx = new window.EPO_Transport(dev, log); S.ident = null;
    const pid = dev.productId.toString(16).padStart(4, '0').toUpperCase();
    log('in', 'Opened ' + dev.productName + ' 3151:' + pid);
    await identify();
  }
  async function identify() {
    const r = await S.tx.read(P.identify());
    const id = (r[1] | r[2] << 8 | r[3] << 16 | r[4] << 24) >>> 0;
    const e = LOCAL_REG[id] || D.registry[id];
    const pid = S.dev.productId;
    S.ident = { id, name: e ? e[0] : 'unknown', family: e ? e[1] : 'unknown', pid, ok: id === 1091 && pid === 0x4015 };
    chip();
    if (!S.ident.ok) { toast(false, id === 0 ? 'Identify returned 0: on the 2.4G dongle there is no settings channel. Plug in the USB cable.' : 'Board ' + id + ' is not the TH80 SE (1091). Writes disabled.'); return; }
    toast(true, 'TH80 SE identified (yc500).');
    try { const v = await S.tx.read(P.getRev()); $('#fw').textContent = 'v' + (v[1] | v[2] << 8); } catch (e) { }
    await readProfile(); await readLed();
  }
  function chip() {
    const c = $('#chip'); if (!S.dev) { c.className = 'chip off'; c.textContent = 'Not connected'; return; }
    const pid = S.dev.productId;
    if (pid === 0x4011) { c.className = 'chip warn'; c.textContent = '2.4G dongle: read/write needs the USB cable'; return; }
    if (S.ident && S.ident.ok) { c.className = 'chip on'; c.textContent = 'Wired · TH80 SE · id 1091 · yc500'; return; }
    c.className = 'chip warn'; c.textContent = 'Unknown board 3151:' + pid.toString(16) + (S.ident ? ' id ' + S.ident.id : '');
  }

  // ---------- lighting ----------
  let ledTimer = null, ledLastWrite = 0;
  function ledFormRead() {
    return { type: $('#fx').value, value: +$('#bri').value, speed: +$('#spd').value, option: $('#fxopt').value || undefined,
      dazzle: $('#rainbow').checked, rgb: parseInt($('#col').value.slice(1), 16) };
  }
  function ledFormSet(l) {
    $('#fx').value = l.type; fxChanged(); $('#bri').value = l.value; $('#spd').value = l.speed; $('#rainbow').checked = !!l.dazzle;
    if (l.option !== undefined) $('#fxopt').value = l.option;
    $('#col').value = '#' + (l.rgb >>> 0).toString(16).padStart(6, '0'); outs();
  }
  function fxChanged() {
    const e = P.EFFECTS.find(x => x.type === $('#fx').value); const o = $('#fxopt'); o.innerHTML = '';
    (e.options || []).forEach(v => o.append(el('option', { value: v }, v))); o.disabled = !e.options;
    $('#spd').disabled = e.speed === false || e.kind === 'off'; $('#col').disabled = $('#rainbow').disabled = e.rgb === false || e.kind === 'off' || e.kind === 'none';
    $('#bri').disabled = e.kind === 'off';
  }
  function outs() { $('#briv').textContent = $('#bri').value; $('#spdv').textContent = $('#spd').value; }
  async function readLed() { need(); const r = await S.tx.read(P.getLed()); const l = P.parseLed(r); S.led = l; ledFormSet(l);
    $('#ledraw').textContent = hex(r.slice(0, 8)); $('#ledinfo').textContent = l.type + ' · brightness ' + l.value + ' · speed ' + l.speed + (l.dazzle ? ' · rainbow' : ''); return l; }
  function scheduleLed() { if (!$('#live').checked) return; clearTimeout(ledTimer); ledTimer = setTimeout(() => guard(applyLed), 600); }
  async function applyLed(state) {
    need(); const want = state || ledFormRead();
    const gap = 1200 - (Date.now() - ledLastWrite); if (gap > 0) await sleep(gap);   // >= 1.2 s between LED writes (driver 500 before + 500 after)
    ledLastWrite = Date.now();
    const b = P.setLed(want);
    await S.tx.write([b], { before: 500, after: 500 });
    const got = P.parseLed(await S.tx.read(P.getLed()));
    const ok = got && got.mode === b[1] && got.value === b[3] && (b[1] === 0 || 4 - got.speed === b[2] || P.EFFECTS.find(x => x.mode === b[1]).speed === false);
    $('#ledraw').textContent = 'sent ' + hex(b.slice(0, 9)); toast(ok, ok ? 'Lighting verified: ' + want.type : 'Lighting not confirmed by read-back');
  }

  // ---------- per-key ----------
  const LAYOUT = D.layout.layout;
  function slotOfKey(k) {
    const M = D.defaultMatrix;
    if (k.value > 255) { const v = [k.value >>> 24 & 255, k.value >>> 16 & 255, k.value >>> 8 & 255, k.value & 255];
      for (let i = 0; i < 128; i++) if (M[4 * i] === v[0] && M[4 * i + 1] === v[1] && M[4 * i + 2] === v[2] && M[4 * i + 3] === v[3]) return i; return -1; }
    for (let i = 0; i < 128; i++) if (M[4 * i] === 0 && M[4 * i + 1] === 0 && M[4 * i + 2] === k.value && M[4 * i + 3] === 0) return i;
    return -1;
  }
  function drawBoard(host, onClick, deco) {
    host.innerHTML = ''; const minY = Math.min(...LAYOUT.map(k => k.y)); const W = Math.max(...LAYOUT.map(k => k.x + k.w)) + 10, Hh = -minY + 40;
    host.style.width = W * 1.4 + 'px'; host.style.height = Hh * 1.4 + 'px';
    LAYOUT.forEach(k => { const s = slotOfKey(k); const b = el('div', { class: 'key' + (k.knob ? ' knob' : '') }, el('span', null, k.keyName.replace('\n', ' ')));
      Object.assign(b.style, { left: k.x * 1.4 + 'px', top: (-k.y) * 1.4 + 'px', width: k.w * 1.4 + 'px', height: k.h * 1.4 + 'px' });
      b.dataset.slot = s; b.onclick = () => onClick(k, s, b); if (deco) deco(k, s, b); host.append(b); });
  }
  function pkPaint(k, s, b) { if (s < 0) return; const c = parseInt($('#pkcol').value.slice(1), 16); S.pk[s] = c; b.style.background = $('#pkcol').value; }
  function pkDeco(k, s, b) { if (S.pk[s] !== undefined) b.style.background = '#' + S.pk[s].toString(16).padStart(6, '0'); }
  async function pkUpload() {
    need();
    S.pkQueue++; pkQ();
    try {
      const wait = 5000 - (Date.now() - S.lastPk); if (wait > 0) { log('in', 'per-key: waiting ' + wait + ' ms (sharkfin safe pace: 2 uploads / 10 s)'); await sleep(wait); }
      S.lastPk = Date.now();
      await S.tx.write(P.userpicWrites(S.pk), { before: 20 });          // hC._setLightPic: LITTLECMDDELAY 20 ms per page
      await sleep(2000);                                                // sharkfin: 2 s settle before a mode switch
      await applyLed({ type: 'LightUserPicture', value: S.led ? S.led.value : 4, option: '1' });
    } finally { S.pkQueue--; pkQ(); }
  }
  function pkQ() { $('#pkq').textContent = S.pkQueue ? S.pkQueue + ' upload(s) queued/running' : 'idle'; }

  // ---------- profiles ----------
  async function readProfile() { need(); const r = await S.tx.read(P.getProfile()); S.profile = r[1]; $$('.prof').forEach(b => b.classList.toggle('active', +b.dataset.p === S.profile)); $('#profnow').textContent = 'Profile ' + (S.profile + 1); return S.profile; }
  async function setProfile(p) { need(); await S.tx.write([P.setProfile(p)], { after: 500 }); const now = await readProfile(); toast(now === p, now === p ? 'Profile ' + (p + 1) + ' active' : 'Profile switch not confirmed'); }

  // ---------- options / settings ----------
  async function readOptions() { need(); const p = await readProfile(); const r = await S.tx.read(P.getOptions(p)); const o = P.parseOptions(r); S.opts = { profile: p, o };
    $('#o_win').checked = o.winLock; $('#o_wasd').checked = o.wasd; $('#o_led').checked = o.ledOff; $('#o_ps').checked = o.powerSave;
    $('#o_ro').textContent = `Mac mode: ${o.mac ? 'on' : 'off'} (read-only) · side light off: ${o.sLedOff} · keyboard mode bit: ${o.keyboardMode} · keyboard lock: ${o.keyboardLock} · Fn flag: ${o.fnMatrix}`;
    $('#o_raw').textContent = hex(r.slice(0, 8)); return o; }
  async function writeOptions() {
    need(); const fresh = await readOptionsQuiet();
    const b = P.setOptions(S.opts.profile, fresh, { winLock: $('#o_win').checked, wasd: $('#o_wasd').checked, ledOff: $('#o_led').checked, powerSave: $('#o_ps').checked });
    await S.tx.write([b], { after: 500 });
    const after = await readOptions();
    const ok = after.winLock === $('#o_win').checked && after.wasd === $('#o_wasd').checked && after.ledOff === $('#o_led').checked && !after.keyboardLock;
    toast(ok, ok ? 'Options verified' : 'Options not confirmed');
  }
  async function readOptionsQuiet() { const p = await readProfile(); const o = P.parseOptions(await S.tx.read(P.getOptions(p))); S.opts = { profile: p, o }; return o; }
  async function readDeb() { need(); const r = await S.tx.read(P.getDebounce()); $('#deb').value = r[2]; $('#debv').textContent = r[2]; return r[2]; }
  async function writeDeb() { need(); const v = +$('#deb').value; await S.tx.write([P.setDebounce(v)], { after: 500 }); const got = await readDeb(); toast(got === v, got === v ? 'Debounce ' + v + ' verified' : 'Debounce not confirmed'); }
  async function readSleep() { need(); const s = P.parseSleep(await S.tx.read(P.getSleep())); ['time_bt', 'time_24', 'deepTime_bt', 'deepTime_24'].forEach(k => $('#' + k).value = Math.round(s[k] / 60)); return s; }
  async function writeSleep() { need(); const t = {}; ['time_bt', 'time_24', 'deepTime_bt', 'deepTime_24'].forEach(k => t[k] = 60 * +$('#' + k).value);
    await S.tx.write([P.setSleep(t)], { after: 500 }); const g = await readSleep(); const ok = ['time_bt', 'time_24', 'deepTime_bt', 'deepTime_24'].every(k => Math.round(g[k] / 60) === Math.round(t[k] / 60)); toast(ok, ok ? 'Sleep timers verified' : 'Sleep timers not confirmed'); }
  async function readRate() { need(); const r = await S.tx.read(P.getReportRate(S.profile)); $('#rate').textContent = ({ 1: '1000 Hz', 2: '500 Hz', 4: '250 Hz', 8: '125 Hz' })[r[2]] || 'unknown (' + r[2] + ')'; }
  async function factoryReset() { need(); if ($('#rstc').value !== 'RESET TH80 SE') return toast(false, 'Type RESET TH80 SE to confirm'); await S.tx.write([P.reset()], { after: 4000 }); toast(true, 'Reset sent. Re-identify.'); $('#rstc').value = ''; await identify(); }

  // ---------- keymap ----------
  let kmSel = null;
  const kmKey = () => 'p' + $('#kmp').value + ($('#kml').value === 'fn' ? 'f' : 'n');
  async function kmRead(p, fn) { need(); const m = await S.tx.readPages(P.keymapReads(p, fn)); S.km['p' + p + (fn ? 'f' : 'n')] = Array.from(m); return m; }
  function slotLabel(s4) { const d = P.decodeSlot(s4); if (d.kind === 'none') return '—'; if (d.kind === 'key') return (d.mod ? (H.KEYS[d.mod] || d.mod) + '+' : '') + (H.KEYS[d.hid] || '0x' + d.hid.toString(16));
    if (d.kind === 'consumer') { const c = H.CONSUMER.find(x => x[1] === d.usage); return c ? c[0] : 'media 0x' + d.usage.toString(16); }
    if (d.kind === 'macro') return 'M' + d.index; if (d.kind === 'fn') return 'Fn'; return '[' + d.raw.join(',') + ']'; }
  function kmDraw() { const m = S.km[kmKey()]; drawBoard($('#kmboard'), (k, s, b) => { if (s < 0) return; kmSel = s; $$('#kmboard .key').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); kmShow(); },
    (k, s, b) => { if (m && s >= 0) { const v = m.slice(4 * s, 4 * s + 4); const dflt = D.defaultMatrix.slice(4 * s, 4 * s + 4); b.append(el('small', null, slotLabel(v))); if (v.join() !== dflt.join()) b.classList.add('changed'); } }); }
  function kmShow() { const m = S.km[kmKey()]; if (!m || kmSel == null) return; const v = m.slice(4 * kmSel, 4 * kmSel + 4); $('#kmcur').textContent = 'Slot ' + kmSel + ': ' + slotLabel(v) + '  [' + v.join(', ') + ']'; }
  function kmAssign() {
    const m = S.km[kmKey()]; if (!m || kmSel == null) return toast(false, 'Read the layer and pick a key first');
    const t = $('#kmtype').value; let v;
    if (t === 'key') v = [0, +$('#kmmod').value, +$('#kmhid').value, 0];
    else if (t === 'media') { const u = +$('#kmmedia').value; v = [3, 0, u & 255, u >> 8]; }
    else if (t === 'macro') v = [9, +$('#kmmmode').value, +$('#kmmidx').value, 0];
    else if (t === 'fn') v = [10, 1, 0, 0];
    else if (t === 'none') v = [0, 0, 0, 0];
    else v = D.defaultMatrix.slice(4 * kmSel, 4 * kmSel + 4);
    m.splice(4 * kmSel, 4, ...v); kmDraw(); kmShow(); $('#kmdirty').textContent = 'Unsaved changes on ' + kmKey();
  }
  async function kmBackupAll(silent) {
    need(); const out = { kind: 'epocontrol-keymap-backup', device: 1091, date: new Date().toISOString(), layers: {} };
    for (let p = 0; p < P.PROFILES; p++) for (const fn of [false, true]) { const m = await kmRead(p, fn); out.layers['p' + p + (fn ? 'f' : 'n')] = Array.from(m); }
    download('th80se-keymap-backup-' + stamp() + '.json', out); S.backupTaken = true; if (!silent) toast(true, 'Keymap backup downloaded (all 3 profiles + Fn)'); return out;
  }
  async function kmWrite(key, matrix) {
    need(); if (!S.backupTaken) { toast(null, 'Taking a full keymap backup first…'); const cur = S.km[key] ? S.km[key].slice() : null; await kmBackupAll(true); if (cur) S.km[key] = cur; }
    const p = +key[1], fn = key[2] === 'f';
    const list = P.keymapWrites(p, Uint8Array.from(matrix), fn);
    await S.tx.write(list, { before: 10, after: fn ? 50 : 10 });   // JC._setKeyConfig: writeFeatureCmd default 10 ms; Fn: jm(50)
    const back = Array.from(await S.tx.readPages(P.keymapReads(p, fn)));
    const ok = back.slice(0, 504).join() === Array.from(matrix).slice(0, 504).join();
    S.km[key] = back; kmDraw(); $('#kmdirty').textContent = ''; toast(ok, ok ? 'Keymap ' + key + ' verified' : 'Keymap ' + key + ' read-back differs');
  }
  async function kmRestore(file) { const j = JSON.parse(await file.text()); if (j.kind !== 'epocontrol-keymap-backup' && j.kind !== 'epocontrol-full-backup') throw new Error('not an EpoControl backup');
    const layers = j.layers || (j.keymaps); if (!confirm('Write ' + Object.keys(layers).length + ' keymap layers from this backup?')) return;
    S.backupTaken = true; for (const [k, m] of Object.entries(layers)) { if (m.length !== 512) throw new Error('bad layer ' + k); await kmWrite(k, m); } }

  // ---------- macros ----------
  let mEvents = [], recording = false, recT = 0;
  function mDraw() { const L = $('#mlist'); L.innerHTML = '';
    mEvents.forEach((e, i) => L.append(el('div', { class: 'mrow' }, e.type === 'delay' ? el('span', null, '⏱ delay ', el('input', { type: 'number', min: 0, max: 65535, value: e.value, onchange: ev => e.value = +ev.target.value }), ' ms')
      : el('span', null, (e.action === 'down' ? '↓ ' : '↑ ') + (H.KEYS[e.value] || e.value)), el('button', { class: 'sec sm', onclick: () => { mEvents.splice(i, 1); mDraw(); } }, '✕'))));
    $('#mbytes').textContent = 'Encoded size: ' + (() => { try { const b = P.encodeMacro(mEvents, +$('#mrep').value); let n = 256; while (n > 2 && b[n - 1] === 0) n--; return n + ' / 256 bytes'; } catch (e) { return e.message; } })(); }
  function recKey(ev, down) { if (!recording) return; ev.preventDefault(); const h = H.CODE[ev.code]; if (!h) return; const now = performance.now();
    if (mEvents.length) mEvents.push({ type: 'delay', value: Math.min(65535, Math.round(now - recT)) }); recT = now; mEvents.push({ type: 'keyboard', action: down ? 'down' : 'up', value: h }); mDraw(); }
  async function mRead() { need(); const i = +$('#midx').value; const buf = await S.tx.readPages(P.macroReads(i)); const d = P.decodeMacro(buf.slice(0, 256)); mEvents = d.macroEvents.filter(e => e.type !== 'mouse_move'); $('#mrep').value = d.repeatCount || 1; S.macros[i] = Array.from(buf.slice(0, 256)); mDraw(); toast(true, 'Macro ' + i + ' read (' + mEvents.length + ' events)'); }
  async function mWrite() { need(); const i = +$('#midx').value; const buf = P.encodeMacro(mEvents, +$('#mrep').value);
    await S.tx.write(P.macroWrites(i, buf), { before: 10, after: 100 });
    const back = await S.tx.readPages(P.macroReads(i)); let n = 256; while (n > 2 && buf[n - 1] === 0) n--;
    const ok = Array.from(back.slice(0, n)).join() === Array.from(buf.slice(0, n)).join(); toast(ok, ok ? 'Macro ' + i + ' verified' : 'Macro read-back differs'); }

  // ---------- full backup ----------
  async function fullBackup() {
    need(); const out = { kind: 'epocontrol-full-backup', device: S.ident.id, firmware: $('#fw').textContent, date: new Date().toISOString() };
    out.profile = await readProfile(); out.led = Array.from((await S.tx.read(P.getLed())).slice(0, 8));
    out.options = {}; for (let p = 0; p < P.PROFILES; p++) out.options[p] = Array.from((await S.tx.read(P.getOptions(p))).slice(0, 8));
    out.debounce = (await S.tx.read(P.getDebounce()))[2]; out.sleep = P.parseSleep(await S.tx.read(P.getSleep()));
    out.layers = {}; const macroIdx = new Set();
    for (let p = 0; p < P.PROFILES; p++) for (const fn of [false, true]) { const m = Array.from(await kmRead(p, fn)); out.layers['p' + p + (fn ? 'f' : 'n')] = m;
      for (let s = 0; s < 128; s++) if (m[4 * s] === 9) macroIdx.add(m[4 * s + 2]); }
    out.macros = {}; for (const i of macroIdx) out.macros[i] = Array.from((await S.tx.readPages(P.macroReads(i))).slice(0, 256));
    out.userpic = Array.from(await S.tx.readPages(P.userpicReads()));
    download('th80se-full-backup-' + stamp() + '.json', out); S.backupTaken = true; toast(true, 'Full backup downloaded'); return out;
  }
  async function fullRestore(file) {
    need(); const j = JSON.parse(await file.text()); if (j.kind !== 'epocontrol-full-backup' || j.device !== 1091) throw new Error('not a TH80 SE full backup');
    const parts = $$('.rpart:checked').map(x => x.value); if (!parts.length || !confirm('Restore: ' + parts.join(', ') + ' ?')) return;
    if (parts.includes('keymaps')) { S.backupTaken = true; for (const [k, m] of Object.entries(j.layers)) await kmWrite(k, m); }
    if (parts.includes('macros')) for (const [i, b] of Object.entries(j.macros || {})) await S.tx.write(P.macroWrites(+i, Uint8Array.from(b)), { after: 100 });
    if (parts.includes('options')) for (const [p, r] of Object.entries(j.options)) { const saved = P.parseOptions(Uint8Array.from(r)); const fresh = P.parseOptions(await S.tx.read(P.getOptions(+p)));
      await S.tx.write([P.setOptions(+p, fresh, { winLock: saved.winLock, wasd: saved.wasd, ledOff: saved.ledOff, powerSave: saved.powerSave })], { after: 500 }); }
    if (parts.includes('debounce')) await S.tx.write([P.setDebounce(j.debounce)], { after: 500 });
    if (parts.includes('sleep')) await S.tx.write([P.setSleep(j.sleep)], { after: 500 });
    if (parts.includes('lighting')) { const l = P.parseLed(Uint8Array.from(j.led)); if (l && P.EFFECTS.find(e => e.type === l.type)) await applyLed(l); }
    if (parts.includes('profile')) await setProfile(j.profile);
    toast(true, 'Restore finished'); }
  function download(name, obj) { const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' })), download: name }); document.body.append(a); a.click(); a.remove(); }
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // ---------- wiring ----------
  function nav(id) { $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.v === id)); $$('.view').forEach(v => v.hidden = v.id !== 'v-' + id); if (id === 'perkey') drawBoard($('#pkboard'), pkPaint, pkDeco); if (id === 'keymap') kmDraw(); }
  function init() {
    $$('.nav a').forEach(a => a.onclick = () => nav(a.dataset.v));
    $('#bconnect').onclick = () => guard(connect);
    P.EFFECTS.forEach(e => $('#fx').append(el('option', { value: e.type }, e.type.replace(/^Light/, '').replace(/([a-z])([A-Z])/g, '$1 $2'))));
    P.COMMONCOLOR.forEach(c => { const h = '#' + c.toString(16).padStart(6, '0'); $('#presets').append(el('button', { class: 'sw', style: 'background:' + h, title: h, onclick: () => { $('#col').value = h; $('#pkcol').value = h; scheduleLed(); } })); });
    $('#fx').onchange = () => { fxChanged(); scheduleLed(); }; ['#bri', '#spd'].forEach(s => $(s).oninput = () => { outs(); scheduleLed(); });
    ['#col', '#rainbow', '#fxopt'].forEach(s => $(s).onchange = scheduleLed); fxChanged(); outs();
    $('#bledread').onclick = () => guard(readLed); $('#bledapply').onclick = () => guard(() => applyLed());
    $('#bledoff').onclick = () => guard(() => applyLed({ type: 'LightOff' }));
    $('#pkfill').onclick = () => { const c = parseInt($('#pkcol').value.slice(1), 16); LAYOUT.forEach(k => { const s = slotOfKey(k); if (s >= 0) S.pk[s] = c; }); drawBoard($('#pkboard'), pkPaint, pkDeco); };
    $('#pkclear').onclick = () => { S.pk = {}; drawBoard($('#pkboard'), pkPaint, pkDeco); };
    $('#pkup').onclick = () => guard(pkUpload);
    $$('.prof').forEach(b => b.onclick = () => guard(() => setProfile(+b.dataset.p))); $('#bprof').onclick = () => guard(readProfile);
    $('#boptr').onclick = () => guard(readOptions); $('#boptw').onclick = () => guard(writeOptions);
    $('#deb').oninput = () => $('#debv').textContent = $('#deb').value; $('#bdebr').onclick = () => guard(readDeb); $('#bdebw').onclick = () => guard(writeDeb);
    $('#bslr').onclick = () => guard(readSleep); $('#bslw').onclick = () => guard(writeSleep); $('#brate').onclick = () => guard(readRate);
    $('#brst').onclick = () => guard(factoryReset);
    Object.entries(H.KEYS).sort((a, b) => a[0] - b[0]).forEach(([v, n]) => $('#kmhid').append(el('option', { value: v }, n + ' (' + v + ')')));
    Object.entries(P.MOD).forEach(([n, v]) => $('#kmmod').append(el('option', { value: v }, n)));
    H.CONSUMER.forEach(([n, v]) => $('#kmmedia').append(el('option', { value: v }, n)));
    $('#kmtype').onchange = () => $$('.kmopt').forEach(x => x.hidden = !x.classList.contains('t-' + $('#kmtype').value));
    $('#kmtype').onchange();
    $('#bkmr').onclick = () => guard(async () => { await kmRead(+$('#kmp').value, $('#kml').value === 'fn'); kmDraw(); kmShow(); toast(true, 'Layer read'); });
    $('#kmp').onchange = $('#kml').onchange = () => { kmDraw(); kmShow(); };
    $('#bkmset').onclick = kmAssign;
    $('#bkmw').onclick = () => guard(() => { const k = kmKey(); if (!S.km[k]) throw new Error('read the layer first'); return kmWrite(k, S.km[k]); });
    $('#bkmb').onclick = () => guard(() => kmBackupAll(false));
    $('#fkmr').onchange = e => guard(() => kmRestore(e.target.files[0]));
    $('#bmrec').onclick = () => { recording = !recording; $('#bmrec').textContent = recording ? '■ Stop recording' : '● Record'; $('#bmrec').classList.toggle('rec', recording); recT = performance.now(); };
    document.addEventListener('keydown', e => recKey(e, true)); document.addEventListener('keyup', e => recKey(e, false));
    $('#bmdel').onclick = () => { mEvents.push({ type: 'delay', value: 50 }); mDraw(); }; $('#bmclr').onclick = () => { mEvents = []; mDraw(); };
    $('#bmr').onclick = () => guard(mRead); $('#bmw').onclick = () => guard(mWrite);
    $('#bmassign').onclick = () => { $('#kmtype').value = 'macro'; $('#kmtype').onchange(); $('#kmmidx').value = $('#midx').value; nav('keymap'); toast(null, 'Pick a key, then Assign and Write layer'); };
    $('#mrep').onchange = mDraw; mDraw();
    $('#bfull').onclick = () => guard(fullBackup); $('#ffull').onchange = e => guard(() => fullRestore(e.target.files[0]));
    $('#logtog').onclick = () => $('#logwrap').classList.toggle('open');
    if (navigator.hid) navigator.hid.addEventListener('disconnect', e => { if (e.device === S.dev) { S.dev = null; S.tx = null; S.ident = null; chip(); toast(false, 'Keyboard disconnected'); } });
    nav('lighting'); chip();
  }
  window.EPO_APP = { init, S, slotOfKey };
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
