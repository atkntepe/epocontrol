# EpoControl
<img width="2556" height="1265" alt="image" src="https://github.com/user-attachments/assets/e7aabcf3-38ff-4cf8-a83c-aa5817328b65" />

An install-free web app for the **EPOMAKER TH80 SE** (USB `3151:4015`, device id 1091). It runs in Chrome or Edge over WebHID and is served from `http://localhost:8765/` by a small PowerShell script.

## Features

| Area | What it does | Read-back |
|---|---|---|
| Lighting | Every effect the official driver lists for this board, plus Off. Colour picker, 7 driver presets, rainbow, brightness 0-4, speed 0-4, effect options (direction and so on). Live preview is debounced and keeps at least 1.2 s between writes. | yes (`0x87`) |
| Per-key RGB | A clickable TH80 SE layout taken from the driver's layout data. Paint, fill, clear, then upload to the User Picture effect. Uploads are paced to at most 2 per 10 s, with a queue indicator. | not used (unreliable) |
| Keymap | Profiles 1-3, base and Fn layers. Assign a key or combo, media key, macro, Fn, disabled, or the factory default. All 6 layers are downloaded as a JSON backup automatically before the first write. Restore from a backup file. | yes (`0x89` / `0x90`) |
| Macros | Record from the browser, edit delays, set a repeat count, write, and assign to a key. | yes (`0x8B`) |
| Profiles | Shows the active profile and switches between the 3 onboard profiles. | yes (`0x85`) |
| Settings | Win lock, WASD swap, backlight off, and power save, all as read-modify-write. Debounce, sleep timers, polling rate (read-only), firmware version, factory reset (typed confirmation). | yes |
| Backup | Full JSON backup: lighting, profile, options x3, debounce, sleep, 6 keymap layers, the macros they use, and per-key colours. Choose which parts to restore. | n/a |

## Run it (Windows)

1. Connect the keyboard with the USB cable in wired mode. The 2.4G dongle has no settings channel, and WebHID can't reach Bluetooth.
2. Run `start-epocontrol.ps1`. Then click **Connect keyboard** in Chrome or Edge.

## Safety

- **Source of truth.** Every packet copies the official EPOMAKER Driver 2.1.92 code for `yc500_th80se_soc` (class chain `tgt → BGe → JC → OC → hC → JF → FF → dF → eF`) and is cross-checked with sharkfin. Each builder in `js/proto.js` cites the driver function it comes from.
- **Allow-list.** `js/proto.js` keeps an explicit allow-list for each opcode and direction, and anything else throws before it reaches the wire. The app never sends bootloader (`0x7F`), flash erase (`0xAC`), OLED/MLED boot, report-rate write, key-enable, or any other unlisted command.
- **Keyboard lock.** The options write is read-modify-write from a fresh read. It only changes Win lock (0x01), WASD swap (0x08), ledOff (0x10), and the power-save byte. The keyboard-lock bit 0x80 is forced to 0, and an assertion rejects any packet that still has it. Mac/Win is read-only because the driver's setter and getter use different bits.
- **Pacing.** I/O is serialized with a 12 ms minimum gap between reports. The app uses the driver's delays (500 ms around LED, debounce, and sleep writes; 20 ms per per-key page) and sharkfin's per-key pace.
- **Backups.** The app backs up keymaps automatically before the first keymap write, and factory reset needs typed confirmation.
- **Board check.** Writes only run when identify returns id 1091 on PID 4015.

## Tests

```
node test/run-tests.js                      # every packet builder vs. bytes derived from the driver functions
NODE_PATH=<jsdom> node test/sim-ui.js       # UI flows against a simulated keyboard (needs jsdom, test-only)
```

## Not included

- The badge/side light. The driver has no side-light config for this board (`SLEDPARAM` is not exposed), so use the Fn shortcuts on the keyboard.
- Battery level. The driver's `getBattery` for this board is a stub.
- Music-follow and screen-colour effects, which need host streaming.
- Polling-rate writes. sharkfin and the driver disagree about them, so polling rate is read-only.

## Credits

- The protocol was studied from [sharkfin](https://github.com/dniminenn/sharkfin) (GPL-3.0) and the [dnim.dev ROYUAN write-up](https://dnim.dev/blog/royuan-keyboard-protocol). `js/data.js` includes sharkfin's device registry.
- The layout and default matrix data come from the EPOMAKER Driver 2.1.92. Not affiliated with EPOMAKER.

## License

GPL-3.0. See `LICENSE`.
