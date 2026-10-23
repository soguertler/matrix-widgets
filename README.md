# Widget Games

pnpm workspace for Matrix room widgets. Doodle Phone is a React, TypeScript,
and Tailwind CSS telephone drawing game. Linux Terminal runs a small Linux
system locally in the browser using v86.

## Packages

- `packages/doodle-phone`: widget app, game rules, drawing tools, and UI.
- `packages/linux`: browser Linux terminal backed by v86 and Buildroot.
- `packages/widget-shared`: Matrix Widget API room-event connection, room member
  profiles, and widget URL parameters for future games.
- `packages/tsconfig`: shared TypeScript config based on the `sbomtrak` workspace's
  Vite React and strictest presets. Doodle Phone keeps two indexed-access
  overrides while its existing drawing code is migrated.

Dependencies use the pnpm workspace catalog. Each game owns its own event type,
protocol, and build output; shared code does not interpret game actions.

## Development

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` serves Doodle Phone at `http://127.0.0.1:5173`. Add it to a Matrix
client with Widget API support using a URL with these parameters:

```text
https://your-widget-host.example/?widgetId=$matrix_widget_id&userId=$matrix_user_id&roomId=$matrix_room_id
```

The client must grant permission to send and receive
`com.local.matrix_widget_lab.doodle_phone` room events, receive `m.room.member`
state events, and download profile images. All players use the same room and
widget. The host starts with 2–14 players, chooses 2–N turns per story, and
sets a one-, two-, or three-minute timer. Rounds advance when everyone submits;
missing turns are marked as timed out. Players can export each story as a PNG.
Unsubmitted turns are saved in the browser tab's session storage.

Run `pnpm --filter @widget-games/linux dev` to serve the Linux widget at
`http://127.0.0.1:5174`. It has no Matrix permissions or shared state; each
participant gets a separate Linux instance in their own browser tab. Click
**Boot Linux** to download and start the emulator, then enter shell commands
in the input below the terminal. Restart discards the instance's files. The
host must permit WebAssembly and serve the `.wasm` and `.bin` files from the
same directory as the HTML.

## Use a release

Download the [latest `doodle-phone.html` release asset](https://github.com/soguertler/widget-games/releases/latest/download/doodle-phone.html)
and serve it from an HTTPS host that allows embedding in your Matrix client.
Add the hosted URL as a room widget, including the parameters shown above. The
GitHub release URL downloads the file; it is not a widget hosting URL.

The release also includes `linux.html`, `v86.wasm`, `seabios.bin`,
`vgabios.bin`, `buildroot-bzimage68.bin`, and `icon.svg`. Host these files together
on an HTTPS origin that allows iframe embedding. The Linux widget does not
need room-event permission. Include `?widgetId=$matrix_widget_id` in its Matrix
widget URL so it can complete the client's loading handshake.

## Protocol

Doodle Phone actions are non-state Matrix room events of type
`com.local.matrix_widget_lab.doodle_phone`. Their content has `version: 2`, a
`gameId`, and a `kind` of `create`, `join`, `leave`, `cancel`, `start`, `submit`, or
`expire`. `packages/doodle-phone/src/model/game.ts` validates and reduces these
events into game state. Room members can read prompts and drawings, even when
the client hides the custom events from its timeline.

The widget reads recent game events from the host every two seconds. It requests
more history when the first 1,000 events exclude the current game's creation,
up to 4,000 events. If the client cannot provide enough history, it shows an
error. A connected player's widget sends an expiry event when the round timer
reaches zero. Drawing turns store vector strokes and PNG masks for area fills.

## Build and checks

```sh
pnpm test
pnpm lint
pnpm fmt:check
pnpm build
```

`pnpm build` writes a standalone `packages/doodle-phone/dist/index.html` with
inlined CSS and JavaScript. It also writes `packages/linux/dist/index.html`
with inlined CSS and JavaScript plus four binary assets. The Linux build
downloads the [v86 Buildroot image](https://github.com/copy/v86) and BIOS
files from the project's hosts and verifies their SHA-256 hashes. It copies
the pinned v86 npm package's WebAssembly file and verifies its hash too. Run
`pnpm fmt` to format the workspace. Pushes to `main` publish both widgets and
the Linux assets in a GitHub Release.
