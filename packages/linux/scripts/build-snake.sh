#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
build_dir="$(mktemp -d)"
trap 'rm -rf "$build_dir"' EXIT
curl --fail --location --silent --show-error \
  https://codeload.github.com/tbpaolini/terminal-snake/tar.gz/c3bfa1044dbe8de22a0502fadf9e917d21e799fe \
  --output "$build_dir/source.tar.gz"
printf '%s  %s\n' \
  644eacade62fed6c949cc98cdbb05fbf95c1b8f2c0af460557bd276e405f4f84 \
  "$build_dir/source.tar.gz" | sha256sum --check -
mkdir "$build_dir/source"
tar -xzf "$build_dir/source.tar.gz" -C "$build_dir/source" --strip-components=1
gcc -m32 -static -std=gnu11 -Os -s -Wl,--build-id=none \
  -o public/snake "$build_dir/source/src/main.c"
cp "$build_dir/source/LICENSE.txt" public/snake-LICENSE.txt
file public/snake
