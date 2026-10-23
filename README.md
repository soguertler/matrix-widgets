# Drawing Phone Matrix widget

A React, TypeScript, and Tailwind drawing telephone game for a Matrix room.
Two or three people write prompts, draw the previous player's prompt, guess the
drawing, and reveal the resulting chains. Game actions are custom Matrix room
events sent through the Matrix Widget API.

## Develop

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the development URL as a widget in a Matrix client that supports the
Matrix Widget API. For a production build, run `pnpm build` and serve the
generated `dist/` directory over HTTP. The widget URL template is:

```text
https://your-widget-host.example/?widgetId=$matrix_widget_id&userId=$matrix_user_id&roomId=$matrix_room_id
```

The client must grant the widget permission to send and receive
`com.local.matrix_widget_lab.doodle_phone` room events. Everyone should open
the same widget in the same room. One player creates the lobby and starts the
game; other players join. The host advances each round after everyone submits.

The drawing pad offers a color palette, pen, eraser, line, rectangle, ellipse,
filled shapes, brush sizes, and undo/redo. Rounds show a two-minute countdown;
submission stays available when it reaches zero. The full-screen button uses
the browser Fullscreen API. If the host disallows iframe full screen, it sends
an optional layout request to a compatible Element module.

Game events are stored in the room and can be read by its members even if a
client does not normally display their event type. This is a small trusted-room
game, with no separate game server or anti-cheat. The widget reads recent room
events through the host; if older game events are missing, revisit the room and
load more timeline history.

Run `pnpm test` for the game-state tests.
