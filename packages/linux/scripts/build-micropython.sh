#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
mp_build_dir="$(mktemp -d)"
trap 'rm -rf "$mp_build_dir"' EXIT
curl --fail --location --silent --show-error \
  https://codeload.github.com/micropython/micropython/tar.gz/refs/tags/v1.29.0 \
  --output "$mp_build_dir/source.tar.gz"
printf '%s  %s\n' \
  8072f6ad42c0e3bbfca88ed09bf8f1106ce207a39129af920f70081b8f2fe286 \
  "$mp_build_dir/source.tar.gz" | sha256sum --check -
tar -xzf "$mp_build_dir/source.tar.gz" -C "$mp_build_dir"
make -C "$mp_build_dir/micropython-1.29.0/ports/unix" -j4 \
  VARIANT=minimal CC='gcc -m32' CFLAGS_EXTRA=-m32 LDFLAGS_EXTRA='-m32 -static'
cp "$mp_build_dir/micropython-1.29.0/ports/unix/build-minimal/micropython" public/micropython
file public/micropython
