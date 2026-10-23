# Doodle Phone

Matrix room widget built with React, TypeScript, and Tailwind CSS.

## Development

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Add the development URL to a Matrix client with Widget API support. The widget
URL must include these parameters:

```text
https://your-widget-host.example/?widgetId=$matrix_widget_id&userId=$matrix_user_id&roomId=$matrix_room_id
```

The client must grant permission to send and receive
`com.local.matrix_widget_lab.doodle_phone` room events, receive `m.room.member`
state events, and download profile images. All players use the same room and
widget. The host creates and starts the game with 2–14 players, chooses 2–N
turns per story, and sets a one-, two-, or three-minute timer. Rounds advance
when everyone submits; missing turns are marked as timed out. Players browse
the reveal independently and can export each story as a PNG. Any room member
can create the next lobby; the latest completed reveal remains accessible while
that lobby is open. Unsubmitted text and drawings are saved in the browser tab's
session storage and restored after a reload when the client permits storage.

## Use a release

Download the [latest `index.html` release asset](https://github.com/soguertler/doodle-phone/releases/latest/download/index.html)
and serve it from an HTTPS web host that allows embedding in your Matrix client.
Add the hosted URL as a room widget, including the `widgetId`, `userId`, and
`roomId` parameters shown above. Each player opens the same room widget and
grants its requested permissions. The GitHub release URL downloads the file;
use your hosted copy as the widget URL.

## Protocol

Game actions are non-state Matrix room events of type
`com.local.matrix_widget_lab.doodle_phone`. Their content has `version: 2`, a
`gameId`, and a `kind` of `create`, `join`, `leave`, `cancel`, `start`, `submit`, or
`expire`. `src/model/game.ts` validates and reduces these events into game
state. Room members can read the events, including prompts and drawings,
regardless of whether their client displays them in the timeline.

The widget reads recent game events from the host every two seconds. If the
initial 1,000 events do not include the current game's creation, it requests up
to 4,000 events. If the client cannot provide enough history, the widget shows
an error instead of treating the room as empty. A connected player's widget
sends an expiry event when the round timer reaches zero.

The drawing tools store vector strokes and PNG masks for area fills in submit
events. The full-screen button uses the browser Fullscreen API or sends a
layout request to a compatible Element module.

## Build and checks

```sh
pnpm test
pnpm lint
pnpm fmt:check
pnpm build
```

`pnpm build` writes a standalone `dist/index.html` with its CSS and JavaScript
inlined. Run `pnpm fmt` to format the source. Source code is organized under
`src/model/`, `src/drawing/`, `src/matrix/`, and `src/components/`.

Pushes to `main` build and publish `index.html` as a GitHub Release asset.
The newest build is available from the repository's `releases/latest` page.
