import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Both implementations provide an atomic first-start / first-finish transition.
export async function createStore({ backend = 'sqlite', path = 'data/code-sprint.db' } = {}) {
  if (backend === 'firestore') {
    const { Firestore } = await import('@google-cloud/firestore');
    const db = new Firestore();
    const competitions = db.collection('competitions');
    const attempts = id => competitions.doc(id).collection('attempts');
    return {
      async createCompetition(value) {
        try {
          await competitions.doc(value.id).create(value);
          return true;
        } catch (error) {
          if (error.code === 6) return false; // Firestore ALREADY_EXISTS
          throw error;
        }
      },
      async getCompetition(id) { return (await competitions.doc(id).get()).data(); },
      async createAttempt(id, value) { await attempts(id).doc(value.id).create(value); },
      async updateAttempt(id, attemptId, change) {
        const ref = attempts(id).doc(attemptId);
        return db.runTransaction(async transaction => {
          const current = (await transaction.get(ref)).data();
          const next = change(current);
          if (next) transaction.set(ref, next);
          return next;
        });
      },
      async results(id) {
        const snapshot = await attempts(id).where('completed', '==', true)
          .orderBy('wpm', 'desc').limit(100).get();
        return snapshot.docs.map(doc => doc.data());
      },
      async close() { await db.terminate(); },
    };
  }
  if (backend !== 'sqlite') throw new Error('STORAGE must be sqlite or firestore');
  const { DatabaseSync } = await import('node:sqlite');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS competitions (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, competition_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS attempts_competition ON attempts(competition_id);`);
  return {
    async createCompetition(value) {
      return db.prepare('INSERT INTO competitions VALUES (?, ?) ON CONFLICT(id) DO NOTHING')
        .run(value.id, JSON.stringify(value)).changes === 1;
    },
    async getCompetition(id) {
      const row = db.prepare('SELECT data FROM competitions WHERE id = ?').get(id);
      return row && JSON.parse(row.data);
    },
    async createAttempt(id, value) {
      db.prepare('INSERT INTO attempts VALUES (?, ?, ?)').run(value.id, id, JSON.stringify(value));
    },
    async updateAttempt(id, attemptId, change) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const row = db.prepare('SELECT data FROM attempts WHERE id = ? AND competition_id = ?').get(attemptId, id);
        const next = change(row && JSON.parse(row.data));
        if (next) db.prepare('UPDATE attempts SET data = ? WHERE id = ?').run(JSON.stringify(next), attemptId);
        db.exec('COMMIT');
        return next;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    async results(id) {
      return db.prepare('SELECT data FROM attempts WHERE competition_id = ?').all(id)
        .map(row => JSON.parse(row.data)).filter(row => row.completed)
        .sort((a, b) => b.wpm - a.wpm || a.finishedAt - b.finishedAt).slice(0, 100);
    },
    async close() { db.close(); },
  };
}
