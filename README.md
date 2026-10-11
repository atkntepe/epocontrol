# EpoControl

A small, install-free web app for controlling the **EPOMAKER TH80 SE** keyboard (USB `3151:4015`) from Chrome or Edge with WebHID, so you don't have to memorize the Fn shortcuts.

> Status: early. Only safe read-only checks (identify the board and read the current lighting) and a single static-color change with restore are implemented so far.

## Run it (Windows)

1. Plug the keyboard in with the USB cable and set the back switch to wired. The 2.4G dongle and Bluetooth can't change settings.
2. Run `start-epocontrol.ps1` in PowerShell. It serves the page at http://localhost:8765/ and opens it.
3. In Chrome or Edge, click **Connect keyboard**, then **Identify** and **Read lighting**. The color controls only unlock when the board reports a known command set.

## Safety

- Only three commands are allowed: identify (`0x8F`), read lighting (`0x87`), and set lighting (`0x07`).
- There's at most one write every 2 seconds.
- Writes stay locked unless the board identifies as a known command set.

## Credits

The protocol details and the board list come from [sharkfin](https://github.com/dniminenn/sharkfin) (GPL-3.0) and the [dnim.dev ROYUAN protocol write-up](https://dnim.dev/blog/royuan-keyboard-protocol). Not affiliated with EPOMAKER.

## License

GPL-3.0. See `LICENSE`.
