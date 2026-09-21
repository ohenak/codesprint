import { createStore } from './store.js';
import { createApp } from './app.js';

const production = process.env.NODE_ENV === 'production';
if (process.env.K_SERVICE && process.env.STORAGE !== 'firestore') {
  throw new Error('Cloud Run requires STORAGE=firestore; local disk is not persistent.');
}
const store = await createStore({ backend: process.env.STORAGE || 'sqlite', path: process.env.SQLITE_PATH || 'data/code-sprint.db' });
const app = createApp({ store, adminKey: process.env.ADMIN_KEY, production });
const server = app.listen(Number(process.env.PORT) || 8080, '0.0.0.0', () => console.log('Code Sprint listening on port', server.address().port));
process.on('SIGTERM', () => server.close(async () => { await store.close(); process.exit(0); }));
