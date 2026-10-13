#!/bin/bash
# EpoControl Mac launcher: serves this folder on localhost:8765 and opens it in a Chrome app window.
DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=8765
if ! /usr/bin/curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then
  (cd "$DIR" && exec /usr/bin/python3 -m http.server $PORT --bind 127.0.0.1 </dev/null >/dev/null 2>&1 &) ; sleep 0.3
  for i in $(seq 1 20); do /usr/bin/curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.25; done
fi
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="http://localhost:$PORT/"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -na "Microsoft Edge" --args --app="http://localhost:$PORT/"
else
  open "http://localhost:$PORT/"
fi
