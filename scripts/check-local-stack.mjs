import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime = new URL('../dev/local/.runtime/', import.meta.url);
const accounts = JSON.parse(await readFile(new URL('accounts.json', runtime), 'utf8'));
const rooms = JSON.parse(await readFile(new URL('rooms.json', runtime), 'utf8'));
async function request(url, body, token) {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.equal(response.ok, true, `${url}: HTTP ${response.status}`);
  return response.json();
}
const matrix = 'http://localhost:8008/_matrix/client/v3';
const account = accounts[0];
const session = await request(`${matrix}/login`, {
  type: 'm.login.password',
  identifier: { type: 'm.id.user', user: account.name },
  password: account.password,
  device_id: 'WIDGET_LOCAL_CHECK',
});
try {
  const element = await fetch('http://localhost:8080');
  assert.equal(element.ok, true);
  for (const [index, slug] of ['doodle-phone', 'sketch-guess', 'linux'].entries()) {
    const page = await fetch(`http://localhost:8090/${slug}/index.html`);
    assert.equal(page.ok, true, `${slug} build is served`);
    const roomId = rooms[index].url.split('/#/room/')[1];
    const widget = await request(
      `${matrix}/rooms/${encodeURIComponent(roomId)}/state/im.vector.modular.widgets/${slug}`,
      undefined,
      session.access_token,
    );
    assert.equal(widget.id, slug);
    assert.ok(widget.url.includes(`/${slug}/index.html`));
  }
  const openid = await request(
    `${matrix}/user/${encodeURIComponent(session.user_id)}/openid/request_token`,
    {},
    session.access_token,
  );
  const roomId = rooms[1].url.split('/#/room/')[1];
  const token = await request('http://localhost:8082/get_token', {
    room_id: roomId,
    slot_id: 'com.matrix_widgets.sketch_guess#local-smoke-check',
    openid_token: openid,
    member: {
      id: crypto.randomUUID(),
      claimed_user_id: session.user_id,
      claimed_device_id: session.device_id,
    },
  });
  assert.ok(token.jwt);
  assert.equal(token.url, 'ws://localhost:7880');
  console.log(
    'Local stack passed: Element, three widgets, room state, Matrix OpenID, and LiveKit token issuance.',
  );
} finally {
  await request(`${matrix}/logout`, {}, session.access_token);
}
