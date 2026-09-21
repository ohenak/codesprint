import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.js';
import { createApp } from '../src/app.js';
import { acceptInput, formatTime, skipIndentation, typedCharacterCount } from '../public/typing.js';

const snippet = 'int main() {\n    return 0;\n}';
const key = 'a-private-organizer-key-for-tests';
async function setup(t, options = {}) {
  const store = await createStore({ path: ':memory:' });
  let clock = 100_000;
  const server = createApp({ store, adminKey: key, production: true, limits: false, now: () => clock, ...options }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await store.close(); });
  const request = async (path, body, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  const create = () => request('/competitions', { title: 'Club round', text: snippet }, { 'X-Organizer-Key': key });
  return { request, create, store, tick: ms => { clock += ms; } };
}

test('create, join, start, finish, retry and public leaderboard', async t => {
  const { request, create, tick } = await setup(t);
  const { data: competition, status } = await create(); assert.equal(status, 201);
  assert.match(competition.id, /^[23456789abcdefghjkmnpqrstuvwxyz]{5}$/);
  const base = `/competitions/${competition.id}`;
  assert.equal((await request(base)).data.text, snippet);
  const { data: attempt } = await request(`${base}/attempts`, { name: 'Ada' });
  const headers = { Authorization: `Bearer ${attempt.token}` };
  const attemptBase = `${base}/attempts/${attempt.id}`;
  const result = { text: snippet, durationMs: 10_000, errors: 2 };
  assert.equal((await request(`${attemptBase}/finish`, result, headers)).status, 409);
  assert.equal((await request(`${attemptBase}/start`, {}, {})).status, 403);
  const first = await request(`${attemptBase}/start`, {}, headers); tick(10_000);
  assert.equal((await request(`${attemptBase}/start`, {}, headers)).data.startedAt, first.data.startedAt);
  assert.equal((await request(`${attemptBase}/finish`, { ...result, text: 'wrong' }, headers)).status, 400);
  const finished = await request(`${attemptBase}/finish`, result, headers);
  assert.equal(finished.status, 200);
  assert.equal(finished.data.wpm, Math.round(typedCharacterCount(snippet) / 5 * 6 * 100) / 100);
  assert.equal(finished.data.accuracy, Math.round(typedCharacterCount(snippet) / (typedCharacterCount(snippet) + 2) * 10000) / 100);
  assert.deepEqual((await request(`${attemptBase}/finish`, { ...result, durationMs: 100 }, headers)).data, finished.data);
  const board = (await request(`${base}/results`)).data;
  assert.equal(board.length, 1); assert.equal(board[0].name, 'Ada');
  assert.equal(board[0].token, undefined); assert.equal(board[0].startedAt, undefined);
});

test('validation, isolation and organizer authentication', async t => {
  const { request, create } = await setup(t);
  assert.equal((await request('/competitions', { title: 'X', text: snippet })).status, 401);
  assert.equal((await request('/competitions', { title: '', text: snippet }, { 'X-Organizer-Key': key })).status, 400);
  assert.equal((await request('/competitions', { title: 'X', text: '😀'.repeat(20) }, { 'X-Organizer-Key': key })).status, 400);
  assert.equal((await request('/competitions/missing')).status, 404);
  const first = (await create()).data; const second = (await create()).data;
  assert.notEqual(first.id, second.id);
  assert.equal((await request(`/competitions/${first.id}/attempts`, { name: '   ' })).status, 400);
  const attempt = (await request(`/competitions/${first.id}/attempts`, { name: 'Grace' })).data;
  const headers = { Authorization: `Bearer ${attempt.token}` };
  assert.equal((await request(`/competitions/${second.id}/attempts/${attempt.id}/start`, {}, headers)).status, 404);
  const base = `/competitions/${first.id}/attempts/${attempt.id}`;
  await request(`${base}/start`, {}, headers);
  for (const bad of [{ durationMs: -1, errors: 0 }, { durationMs: 999999, errors: 0 }, { durationMs: 1000, errors: -1 }]) {
    assert.equal((await request(`${base}/finish`, { text: snippet, ...bad }, headers)).status, 400);
  }
});

test('SQLite retains competitions and scores after reopening', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'code-sprint-'));
  const path = join(dir, 'test.db');
  try {
    let store = await createStore({ path });
    await store.createCompetition({ id: 'round', text: snippet });
    await store.createAttempt('round', { id: 'attempt', name: 'Ada', completed: true, wpm: 40 });
    await store.close(); store = await createStore({ path });
    assert.equal((await store.getCompetition('round')).text, snippet);
    assert.equal((await store.results('round'))[0].name, 'Ada');
    await store.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('auto-indent skips leading whitespace but preserves code spacing and newlines', () => {
  const target = '  int x;\n\t  x++;\n   \n}';
  assert.equal(skipIndentation(target, 0), 2);
  assert.equal(typedCharacterCount(target), 'int x;\nx++;\n\n}'.length);
  assert.deepEqual(acceptInput('  a\n\tb', 0, 'x'), { position: 2, errors: 1, accepted: 0 });
  assert.deepEqual(acceptInput('  a\n\tb', 0, 'a\n'), { position: 5, errors: 0, accepted: 2 });
  assert.deepEqual(acceptInput('  a\n\tb', 5, 'b'), { position: 6, errors: 0, accepted: 1 });
  assert.deepEqual(acceptInput('a b', 1, 'b'), { position: 1, errors: 1, accepted: 0 });
  assert.deepEqual(acceptInput('a\tb', 1, '\t'), { position: 2, errors: 0, accepted: 1 });
  assert.deepEqual(acceptInput('a\n  \n\tb', 0, 'a\n\nb'), { position: 7, errors: 0, accepted: 4 });
  assert.deepEqual(acceptInput('a\n  ', 0, 'a\n'), { position: 4, errors: 0, accepted: 2 });
  assert.equal(formatTime(61234), '01:01.2');
});

test('production requires an organizer secret', () => {
  assert.throws(() => createApp({ store: {}, production: true }), /ADMIN_KEY/);
});

// A first-start request can be lost offline and reach the server only at save time.
test('late start retry still accepts the full elapsed typing duration', async t => {
  const { request, create, tick } = await setup(t);
  const { data: competition } = await create();
  const base = `/competitions/${competition.id}`;
  const { data: attempt } = await request(`${base}/attempts`, { name: 'Linus' });
  const attemptBase = `${base}/attempts/${attempt.id}`;
  const headers = { Authorization: `Bearer ${attempt.token}` };
  tick(120_000);
  await request(`${attemptBase}/start`, {}, headers);
  const result = await request(`${attemptBase}/finish`, { text: snippet, durationMs: 120_000, errors: 0 }, headers);
  assert.equal(result.status, 200);
  assert.equal(result.data.durationMs, 120_000);
});

test('short ID collisions retry without overwriting existing competitions', async t => {
  const ids = ['abcde', 'abcde', 'fghjk'];
  const { create, request } = await setup(t, { generateCompetitionId: () => ids.shift() });
  const first = await create();
  const second = await create();
  assert.equal(first.status, 201);
  assert.equal(first.data.id, 'abcde');
  assert.equal(second.status, 201);
  assert.equal(second.data.id, 'fghjk');
  assert.deepEqual((await request('/competitions/abcde')).data, first.data);
});

test('atomic competition insertion preserves existing data and GUID links', async t => {
  const { store, request } = await setup(t);
  const legacy = { id: '123e4567-e89b-42d3-a456-426614174000', title: 'Existing round', text: snippet };
  const inserted = await Promise.all([
    store.createCompetition(legacy),
    store.createCompetition({ ...legacy, title: 'Overwrite attempt' }),
  ]);
  assert.deepEqual(inserted, [true, false]);
  assert.deepEqual((await request(`/competitions/${legacy.id}`)).data, legacy);
  assert.equal((await request(`/competitions/${legacy.id}/attempts`, { name: 'Ada' })).status, 201);
});

test('repeated collisions fail safely after bounded retries', async t => {
  const { create, request } = await setup(t, { generateCompetitionId: () => 'abcde' });
  const first = await create();
  assert.equal((await create()).status, 503);
  assert.deepEqual((await request('/competitions/abcde')).data, first.data);
});
