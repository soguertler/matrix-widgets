#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
archive="$(mktemp)"
trap 'rm -f "$archive"' EXIT
curl --fail --location --silent --show-error \
  https://github.com/aristocratos/btop/releases/download/v1.4.7/btop-i686-unknown-linux-musl.tar.gz \
  --output "$archive"
printf '%s  %s\n' \
  ca9d80d71cd86e9f77515fcd20ca3f4d2e4f84abfb1d2ea3768265fd50a15f1e \
  "$archive" | sha256sum --check -
tar -xOf "$archive" ./btop/bin/btop > public/btop
tar -xOf "$archive" ./btop/LICENSE > public/btop-LICENSE.txt
chmod +x public/btop
file public/btop
