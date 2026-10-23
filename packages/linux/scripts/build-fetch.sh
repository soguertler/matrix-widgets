#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
gcc -m32 -static -Os -s -Wl,--build-id=none -o public/fetch guest/fetch.c
file public/fetch
