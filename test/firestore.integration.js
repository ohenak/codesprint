import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createStore } from '../src/store.js';

test('Firestore persists and atomically transitions attempts', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const store = await createStore({ backend: 'firestore' });
  const id = randomUUID();
  try {
    await store.createCompetition({ id, title: 'Emulator round', text: 'int main(){return 0;}' });
    assert.equal(await store.createCompetition({ id, title: 'Overwrite attempt', text: 'different' }), false);
    assert.equal((await store.getCompetition(id)).title, 'Emulator round');
    await store.createAttempt(id, { id: 'one', name: 'Ada', completed: false, startedAt: null });
    const starts = await Promise.all([100, 200].map(time => store.updateAttempt(id, 'one', a => ({ ...a, startedAt: a.startedAt ?? time }))));
    assert.equal(starts[0].startedAt, starts[1].startedAt);
    await store.updateAttempt(id, 'one', a => ({ ...a, completed: true, wpm: 42 }));
    assert.equal((await store.results(id))[0].wpm, 42);
    assert.equal(await store.getCompetition('missing'), undefined);
  } finally { await store.close(); }
});
