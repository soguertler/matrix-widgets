#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
for tool in top snake; do
  gcc -m32 -static -std=c11 -Wall -Wextra -Werror -Os -s -Wl,--build-id=none \
    -o "public/$tool" "guest/$tool.c"
done
