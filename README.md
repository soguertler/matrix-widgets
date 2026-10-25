# Matrix Widgets

A pnpm monorepo of independent Matrix room widgets: two multiplayer drawing games
and a browser-based Linux terminal. Each app has its own build and development
server, backed by shared Matrix integration and TypeScript configuration.

## Workspace

| Package                  | Purpose                                                               | Development port |
| ------------------------ | --------------------------------------------------------------------- | ---------------- |
| `packages/doodle-phone`  | Turn-based drawing telephone game                                     | 5173             |
| `packages/sketch-guess`  | Live drawing and guessing over LiveKit                                | 5174             |
| `packages/linux`         | Linux virtual machine with a React/xterm terminal                     | 5175             |
| `packages/widget-shared` | Nordeck toolkit clients, room events, member profiles, URL parameters | —                |
| `packages/tsconfig`      | Shared strict TypeScript configuration                                | —                |

Internal packages use the `@matrix-widgets/` scope. Dependencies are managed
through the catalog in `pnpm-workspace.yaml`; internal dependencies use `workspace:`.
Matrix clients use [Nordeck's Matrix Widget Toolkit](https://github.com/nordeck/matrix-widget-toolkit).
The shared integration uses the toolkit's underlying `matrix-widget-api` transport
for capability constants and bounded history queries that
are not exposed by the toolkit's room-event convenience method.

## Development

Use Node.js 22.6 or newer and pnpm 9.14.4 (the version pinned in `package.json`).

```sh
pnpm install --frozen-lockfile
pnpm dev                 # all three apps, on separate ports
pnpm dev:doodle          # Doodle Phone only
pnpm dev:sketch          # Sketch & Guess only
pnpm dev:linux           # Linux only
```

Linux's first development/build run downloads checksum-verified kernel and BIOS
assets and copies v86's WebAssembly runtime into `packages/linux/public`. It needs
network access for missing assets. Subsequent runs reuse verified files.

| Command                                                    | What it does                                        |
| ---------------------------------------------------------- | --------------------------------------------------- |
| `pnpm build`                                               | Typecheck the workspace and build every app         |
| `pnpm typecheck`                                           | Check all app and shared-package types              |
| `pnpm test`                                                | Run all package tests                               |
| `pnpm lint`                                                | Lint workspace source and scripts                   |
| `pnpm fmt` / `pnpm fmt:check`                              | Format / check source, config, workflows, and docs  |
| `pnpm check`                                               | Formatting, lint, tests, typechecking, and builds   |
| `pnpm preview`                                             | Serve all production builds on ports 4173–4175      |
| `pnpm preview:doodle` / `preview:sketch` / `preview:linux` | Preview one app                                     |
| `pnpm assets:linux`                                        | Prepare and verify Linux runtime assets             |
| `pnpm guest:build`                                         | Rebuild the custom Linux guest commands             |
| `pnpm release:prepare`                                     | Build `release/matrix-widgets.zip` (requires `zip`) |
| `pnpm clean`                                               | Remove app builds and staged releases               |

Run a package command directly with `pnpm --filter @matrix-widgets/<package> <command>`.
To add an app, create a package under `packages/`, use the shared TypeScript config,
assign unique dev/preview ports, and provide `dev`, `build`, `typecheck`, and `preview`
scripts. Recursive workspace commands discover it automatically; add its deployable
output to `scripts/prepare-release.mjs` when it should ship in releases.

## Local Element and Matrix test environment

```sh
pnpm local:up       # build widgets, start Docker services, create test rooms/accounts
pnpm local:status   # inspect services
pnpm local:check    # check widgets, rooms, OpenID, and LiveKit token issuance
pnpm local:logs     # follow service logs
pnpm local:down     # stop services, preserving homeserver data
```

Requires Linux, Docker Compose, OpenSSL, and free local ports 7880, 7882 (UDP),
8008, 8080, 8082, 8090, and 8448. The first start downloads container images. Open
[local Element](http://localhost:8080) and sign in as `alice` or `bob`; their generated
passwords are stored in `dev/local/.runtime/accounts.json`. Use a separate browser
profile or private window for the second player. Both accounts are already in the
Doodle Phone, Sketch & Guess, and Linux Terminal rooms, with their widgets pinned.
Approve widget permissions when Element prompts. Rooms are unencrypted for these
room-event protocols. Room links are saved in `dev/local/.runtime/rooms.json`.

The dedicated `matrix-widgets-test` Compose project runs Synapse, Element, a widget
web server, LiveKit, and its Matrix authorization service. LiveKit uses Linux host
networking with its RTC interface restricted to loopback, avoiding Docker NAT.
The verified container versions are pinned by digest. Browser endpoints bind
only to loopback. `localhost` URLs require running the browser on the same computer.
A generated self-signed certificate is used only for internal OpenID verification;
the browser uses HTTP localhost, which supports secure-context features without
installing certificates. Development registration/LiveKit secrets are deliberately
local-only; this stack is not a production deployment.

Rebuild widget changes with `pnpm build`, then reload the widget in Element. The web
server mounts each app's `dist` folder directly. `pnpm local:seed` reapplies the room
widgets without recreating existing rooms. `pnpm local:down` keeps the dedicated
Synapse volume and account credentials, so the next start restores the same users
and room history. Keep `.runtime/` private; its credentials and keys are gitignored.

## Matrix setup

Serve builds over HTTPS from a host that permits embedding by your Matrix client.
Add the app URL as a room widget, with these substituted parameters:

```text
https://your-widget-host.example/doodle-phone/index.html?widgetId=$matrix_widget_id&userId=$matrix_user_id&roomId=$matrix_room_id
```

Use `sketch-guess/index.html` or `linux/index.html` for the other widgets. Sketch & Guess also
needs `&deviceId=$org.matrix.msc3819.matrix_device_id`. Parameters may be supplied in the query string
or fragment. Games require the host to grant room-event send/receive permissions,
room-member state access, and profile-image downloads.

### Doodle Phone

The host starts with 2–14 players, chooses 2–N turns per story, and sets a one-, two-,
or three-minute timer. Players alternate writing and drawing; missing submissions
time out. Stories can be exported as PNGs, and unfinished turns are saved in the
tab's session storage.

Actions use `com.local.matrix_widget_lab.doodle_phone` room events with `version: 2`,
a `gameId`, and a `kind` of `create`, `join`, `leave`, `cancel`, `start`, `submit`, or
`expire`. The reducer lives in `packages/doodle-phone/src/model/game.ts`. Drawings
contain vector strokes and PNG fill masks. Room members can read prompts and
submissions in history even if the client hides these events from its timeline.

### Sketch & Guess

The Matrix client must provide LiveKit transport discovery through
`org.matrix.msc4515.rtc_transports` and grant OpenID token requests. Players share
one widget in one room. The host chooses English or German words, optional custom
words, and up to three timed hints. Each player draws once per round, picking one
of three words. Guessers score according to remaining time.

`com.matrix_widgets.sketch_guess` room events store lobbies, settings, rounds, hints,
scores, and reveals. The renamed event namespace and LiveKit room identifiers require
all players to use the updated widget and start a new lobby after upgrading.
LiveKit carries private guesses, live strokes, undo actions,
and drawing replay for reconnecting players. Full words are withheld from room
events until reveal. Reveals advance after five seconds; stalled rounds and lobbies
have recovery timers.

Both games poll history every two seconds and request up to 4,000 events to find
the current game's creation. They report incomplete history instead of silently
building an invalid game state.

### Linux

A local, ephemeral 32-bit x86 virtual machine runs through v86 with 64 MiB RAM.
The React terminal fills the widget. Its top bar contains status, upload, download,
and power controls. Power boots or restarts Linux; restarting or closing the widget
clears the VM and its files. Normal terminal keyboard input works directly.

Included commands:

- `top`: a small custom process monitor showing CPU, memory, load, and processes
  ordered by resident memory; press `q` to leave.
- `snake`: a small custom Snake game; use arrow keys or WASD and `q` to leave.
- `widgetfetch` (also `fetch`): guest system information.
- `micropython` (also `python`): a compact Python interpreter.

`top` and `snake` each have one self-contained C source file in `packages/linux/guest`.
Their checked-in static x86 binaries can be rebuilt with `pnpm guest:build` on Linux
with GCC and 32-bit static libc development support (for example `gcc-multilib` and
`libc6-dev-i386` on Debian/Ubuntu). MicroPython has a separate pinned build script and
license in the Linux package.

Uploads appear at `/mnt/<filename>`. Download opens a dialog accepting a path such
as `/mnt/report.txt` or `/mnt/project/result.txt`. v86 exposes only the shared `/mnt`
filesystem to the browser; copy files there from other guest directories first.
Guest networking uses v86's fetch relay and is subject to browser/CORS restrictions.
The terminal also runs outside Matrix without requiring a widget connection.

## Builds and releases

Each app writes `dist/index.html` with inlined application CSS and JavaScript.
The two games are standalone HTML files. Linux additionally needs the kernel, BIOS,
WebAssembly runtime, icon, guest commands, and accompanying license alongside its
HTML. Deploy the entire Linux folder together.

`pnpm release:prepare` builds and creates `release/matrix-widgets.zip` using the
`zip` command-line tool (install it locally if needed; GitHub's Ubuntu runners
include it). GitHub Releases publish this single ZIP, containing:

```text
doodle-phone/
  index.html
sketch-guess/
  index.html
linux/
  index.html
  buildroot-bzimage68.bin
  seabios.bin
  vgabios.bin
  v86.wasm
  icon.svg
  widgetfetch
  micropython
  micropython-LICENSE.txt
  top
  snake
```

Extract the ZIP and host its folders over HTTPS. Each widget's URL is
`/<widget>/index.html` with the Matrix parameters described above. Release download
links are not embeddable hosting URLs. The unpacked folders are also available in
`release/` for local inspection. Pushes to `main` run all checks and publish the ZIP
using `.github/workflows/release-widget.yml`.
