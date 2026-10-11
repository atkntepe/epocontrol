// SPDX-License-Identifier: GPL-3.0-or-later
// Serialized WebHID transport. Every report goes through EPO_PROTO.checkAllowed first.
// Timing follows the driver: writeFeatureCmd waits its delay argument before sending (default 10 ms,
// 500 ms for LED, 20 ms LITTLECMDDELAY for per-key pages), then COMMONDELAY 500 ms after LED/debounce/sleep.
// Reads use the sharkfin pattern (wire.rs roundtrip_packet): send, settle 10 ms x attempt, accept on opcode echo.
(function (g) {
  const P = g.EPO_PROTO;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const hex = a => Array.from(a, b => b.toString(16).padStart(2, '0')).join(' ');
  function trimHex(a) { let n = a.length; while (n > 9 && a[n - 1] === 0) n--; return hex(a.slice(0, n)) + (n < a.length ? ' …' : ''); }
  class Transport {
    constructor(dev, log) { this.dev = dev; this.log = log || (() => {}); this.q = Promise.resolve(); this.last = 0; this.stats = { tx: 0, rx: 0 }; }
    run(fn) { const p = this.q.then(fn, fn); this.q = p.catch(() => {}); return p; }
    async _gap() { const d = Date.now() - this.last; if (d < 12) await sleep(12 - d); this.last = Date.now(); } // sharkfin MIN_WRITE_GAP 12 ms
    async _send(b, dir) {
      P.checkAllowed(b, dir);
      await this._gap();
      this.log('tx', (dir === 'write' ? 'W ' : 'R ') + trimHex(b));
      this.stats.tx++;
      await this.dev.sendFeatureReport(0, b);
    }
    async _recv() {
      const dv = await this.dev.receiveFeatureReport(0);
      let a = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      if (a.length === 65 && a[0] === 0) a = a.slice(1);                 // Windows may keep the report-ID byte
      const out = new Uint8Array(64); out.set(a.slice(0, 64)); this.stats.rx++;
      this.log('rx', trimHex(out)); return out;
    }
    // Simple read with opcode echo.
    read(b) { return this.run(async () => {
      await this._send(b, 'read');
      let r = null; for (let t = 1; t <= 5; t++) { await sleep(10 * t); r = await this._recv(); if (r[0] === b[0]) return r; }
      throw new Error('no 0x' + b[0].toString(16) + ' echo (last ' + (r ? trimHex(r) : 'none') + ')');
    }); }
    // Bulk read: raw pages, no echo (sharkfin PROTOCOL.md; driver commomFeature concatenates whatever comes back).
    readPages(list) { return this.run(async () => {
      const out = new Uint8Array(64 * list.length);
      for (let i = 0; i < list.length; i++) { await this._send(list[i], 'read'); await sleep(15); out.set(await this._recv(), 64 * i); }
      return out;
    }); }
    write(list, opt) { opt = opt || {}; return this.run(async () => {
      for (const b of list) { await sleep(opt.before === undefined ? 10 : opt.before); await this._send(b, 'write'); }
      if (opt.after) await sleep(opt.after);
    }); }
  }
  g.EPO_Transport = Transport; g.EPO_hex = hex; g.EPO_trimHex = trimHex; g.EPO_sleep = sleep;
})(typeof window !== 'undefined' ? window : globalThis);
