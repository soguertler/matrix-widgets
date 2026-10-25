import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const directory = new URL('dev/local/', root);
const runtime = new URL('.runtime/', directory);
const homeserver = 'http://localhost:8008';
const command = process.argv[2] ?? 'up';
const compose = (...args) =>
  execFileSync(
    'docker',
    ['compose', '-f', fileURLToPath(new URL('compose.yaml', directory)), ...args],
    {
      cwd: fileURLToPath(root),
      stdio: 'inherit',
    },
  );

async function request(path, body, token, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(`${homeserver}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${data.errcode}: ${data.error}`);
  return data;
}

async function waitForHomeserver() {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      await request('/_matrix/client/versions');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('Synapse did not start. Inspect pnpm local:logs.');
}

async function seed() {
  await mkdir(runtime, { recursive: true });
  const accountsPath = new URL('accounts.json', runtime);
  let accounts;
  try {
    accounts = JSON.parse(await readFile(accountsPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    accounts = ['alice', 'bob'].map((name) => ({
      name,
      password: randomBytes(18).toString('base64url'),
    }));
    await writeFile(accountsPath, `${JSON.stringify(accounts, null, 2)}\n`, { mode: 0o600 });
  }
  const sessions = [];
  for (const account of accounts) {
    let session;
    const login = () =>
      request('/_matrix/client/v3/login', {
        type: 'm.login.password',
        identifier: { type: 'm.id.user', user: account.name },
        password: account.password,
        device_id: `WIDGET_SEED_${account.name.toUpperCase()}`,
      });
    try {
      session = await login();
    } catch (error) {
      if (!error.message.includes('M_FORBIDDEN')) throw error;
      const { nonce } = await request('/_synapse/admin/v1/register');
      const mac = createHmac('sha1', 'local-widget-test-registration-only')
        .update([nonce, account.name, account.password, 'admin'].join('\0'))
        .digest('hex');
      await request('/_synapse/admin/v1/register', {
        nonce,
        username: account.name,
        password: account.password,
        admin: true,
        mac,
      });
      session = await login();
    }
    sessions.push(session);
  }
  const [alice, bob] = sessions;
  const rooms = [];
  for (const [slug, name] of [
    ['doodle-phone', 'Doodle Phone'],
    ['sketch-guess', 'Sketch & Guess'],
    ['linux', 'Linux Terminal'],
  ]) {
    let roomId;
    try {
      ({ room_id: roomId } = await request(
        `/_matrix/client/v3/directory/room/${encodeURIComponent(`#${slug}:matrix.localhost`)}`,
        undefined,
        alice.access_token,
      ));
    } catch (error) {
      if (!error.message.includes('M_NOT_FOUND')) throw error;
      ({ room_id: roomId } = await request(
        '/_matrix/client/v3/createRoom',
        {
          name: `${name} · Widget Testing`,
          room_alias_name: slug,
          preset: 'private_chat',
          invite: [bob.user_id],
          creation_content: { 'm.federate': false },
          power_level_content_override: { users: { [bob.user_id]: 100 } },
        },
        alice.access_token,
      ));
    }
    const members = await request(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`,
      undefined,
      alice.access_token,
    );
    if (!members.joined[bob.user_id]) {
      await request(
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`,
        { user_id: bob.user_id },
        alice.access_token,
      );
      await request(`/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, {}, bob.access_token);
    }
    const base = `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state`;
    await request(
      `${base}/im.vector.modular.widgets/${slug}`,
      {
        id: slug,
        type: 'm.custom',
        name,
        creatorUserId: alice.user_id,
        url: `http://localhost:8090/${slug}/index.html?widgetId=$matrix_widget_id&userId=$matrix_user_id&roomId=$matrix_room_id&deviceId=$org.matrix.msc3819.matrix_device_id`,
        data: {},
      },
      alice.access_token,
      'PUT',
    );
    await request(
      `${base}/io.element.widgets.layout/`,
      {
        widgets: { [slug]: { container: 'top', index: 0, width: 100, height: 600 } },
      },
      alice.access_token,
      'PUT',
    );
    rooms.push({ name, url: `http://localhost:8080/#/room/${roomId}` });
  }
  await writeFile(new URL('rooms.json', runtime), `${JSON.stringify(rooms, null, 2)}\n`);
  console.log('\nElement: http://localhost:8080');
  console.log('Homeserver: http://localhost:8008');
  console.log(`Test credentials: ${fileURLToPath(accountsPath)}`);
  console.log('Use Alice and Bob in separate browser profiles or a private window.');
  for (const room of rooms) console.log(`${room.name}: ${room.url}`);
}

if (command === 'up') {
  await mkdir(runtime, { recursive: true });
  try {
    await access(new URL('federation.crt', runtime));
    await access(new URL('federation.key', runtime));
  } catch {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '365',
        '-keyout',
        fileURLToPath(new URL('federation.key', runtime)),
        '-out',
        fileURLToPath(new URL('federation.crt', runtime)),
        '-subj',
        '/CN=matrix.localhost',
        '-addext',
        'subjectAltName=DNS:matrix.localhost',
      ],
      { stdio: 'ignore' },
    );
  }
  compose(
    'run',
    '--rm',
    '--no-deps',
    '--user',
    '0',
    '--entrypoint',
    'chown',
    'synapse',
    '991:991',
    '/data',
  );
  compose('up', '-d');
  await waitForHomeserver();
  await seed();
} else if (command === 'seed') {
  await waitForHomeserver();
  await seed();
} else if (command === 'down') {
  compose('down');
} else if (command === 'logs') {
  compose('logs', '--tail=100', '-f');
} else if (command === 'status') {
  compose('ps');
} else {
  throw new Error(`Unknown local stack command: ${command}`);
}
