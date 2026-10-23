# Widget Games

pnpm workspace for Matrix room game widgets. The current game is Doodle Phone, a
React, TypeScript, and Tailwind CSS telephone drawing game.

## Packages

- `packages/doodle-phone`: widget app, game rules, drawing tools, and UI.
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

## Use a release

Download the [latest `doodle-phone.html` release asset](https://github.com/soguertler/widget-games/releases/latest/download/doodle-phone.html)
and serve it from an HTTPS host that allows embedding in your Matrix client.
Add the hosted URL as a room widget, including the parameters shown above. The
GitHub release URL downloads the file; it is not a widget hosting URL.

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
inlined CSS and JavaScript. Run `pnpm fmt` to format the workspace. Pushes to
`main` publish that file as the `doodle-phone.html` asset in a GitHub Release.
