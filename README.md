# Widget Games

pnpm workspace for Matrix room game widgets. Doodle Phone is a turn-based drawing
telephone game. Sketch & Guess is a live drawing and guessing game using LiveKit.

## Packages

- `packages/doodle-phone`: widget app, game rules, drawing tools, and UI.
- `packages/sketch-guess`: live drawing widget, scoring rules, and LiveKit data channel.
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

`pnpm dev:sketch` serves Sketch & Guess at `http://127.0.0.1:5174`. Its widget URL
also needs `&deviceId=$matrix_device_id`. The client must support the
`org.matrix.msc4515.rtc_transports` widget capability, OpenID token requests,
and provide a LiveKit transport. All players open the same widget in one Matrix
room. The host creates a lobby, and players join before starting. Every player
draws once per round; the drawer picks one of three words, and guessers score
based on the remaining time. The host advances after each reveal.

## Use a release

Download the [latest `doodle-phone.html` release asset](https://github.com/soguertler/widget-games/releases/latest/download/doodle-phone.html)
and serve it from an HTTPS host that allows embedding in your Matrix client.
Add the hosted URL as a room widget, including the parameters shown above. The
GitHub release URL downloads the file; it is not a widget hosting URL.
Sketch & Guess has a separate
[`sketch-guess.html` asset](https://github.com/soguertler/widget-games/releases/latest/download/sketch-guess.html)
to host in the same way.

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

Sketch & Guess uses `com.widget_games.sketch_guess` room events for lobbies,
round starts, scores, and reveals. The secret word and guesses are absent from
room events during drawing. LiveKit data packets carry guesses and strokes;
disconnected players can resume the current drawing through a stroke replay from
the drawer. The reveal event stores the word and a compacted drawing in Matrix
room history. Any joined player can expire a round five seconds after its timer
ends if the drawer did not reveal it.

## Build and checks

```sh
pnpm test
pnpm lint
pnpm fmt:check
pnpm build
```

`pnpm build` writes standalone `index.html` files in both game packages' `dist`
directories, with inlined CSS and JavaScript. Run `pnpm fmt` to format the
workspace. Pushes to `main` publish both HTML files in a GitHub Release.
