import express from 'express';
import { typedCharacterCount } from '../public/typing.js';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const publicPath = fileURLToPath(new URL('../public', import.meta.url));
const competitionAlphabet = '23456789abcdefghjkmnpqrstuvwxyz';
const shortCompetitionId = () => Array.from({ length: 5 }, () => competitionAlphabet[randomInt(competitionAlphabet.length)]).join('');
const fail = (status, message) => Object.assign(new Error(message), { status });
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string'
  && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const publicResult = a => ({ id: a.id, name: a.name, durationMs: a.durationMs,
  wpm: a.wpm, cpm: a.cpm, accuracy: a.accuracy, errors: a.errors, finishedAt: a.finishedAt });

export function createApp({ store, adminKey = '', production = false, now = Date.now, limits = true, generateCompetitionId = shortCompetitionId }) {
  if (production && adminKey.length < 24) throw new Error('Production requires ADMIN_KEY with at least 24 characters');
  const app = express();
  app.disable('x-powered-by');
  // Cloud Run is the single trusted proxy in front of this application.
  if (production) app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': production ? [] : null } } }));
  app.use(express.json({ limit: '32kb' }));
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  if (limits) app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a minute.' } }));
  app.get('/api/config', (_req, res) => res.json({ requiresOrganizerKey: Boolean(adminKey) }));
  app.post('/api/competitions', async (req, res) => {
    if (adminKey && !safeEqual(req.get('X-Organizer-Key'), adminKey)) throw fail(401, 'Incorrect organizer key.');
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const text = typeof req.body.text === 'string' ? req.body.text.replace(/\r\n?/g, '\n') : '';
    if (!title || title.length > 100) throw fail(400, 'Enter a title between 1 and 100 characters.');
    if (text.length < 20 || text.length > 5000 || !text.trim() || /[^\x09\x0a\x20-\x7e]/.test(text)) {
      throw fail(400, 'Use 20–5,000 ASCII characters, tabs, and line breaks for the C++ snippet.');
    }
    for (let tries = 0; tries < 10; tries++) {
      const competition = { id: generateCompetitionId(), title, text, createdAt: now() };
      // Atomic insert avoids overwriting a round, including across Cloud Run instances.
      if (await store.createCompetition(competition)) return res.status(201).json(competition);
    }
    throw fail(503, 'Unable to allocate a competition link. Please try again.');
  });
  app.param('competitionId', async (req, _res, next, id) => {
    try {
      if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) throw fail(404, 'Competition not found.');
      req.competition = await store.getCompetition(id);
      if (!req.competition) throw fail(404, 'Competition not found.');
      next();
    } catch (error) { next(error); }
  });
  app.get('/api/competitions/:competitionId', (req, res) => res.json(req.competition));
  app.get('/api/competitions/:competitionId/results', async (req, res) => {
    res.json((await store.results(req.competition.id)).map(publicResult));
  });
  app.post('/api/competitions/:competitionId/attempts', async (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 40 || /[\x00-\x1f\x7f]/.test(name)) throw fail(400, 'Enter a name between 1 and 40 characters.');
    const attempt = { id: randomUUID(), token: randomUUID(), name, createdAt: now(), startedAt: null, completed: false };
    await store.createAttempt(req.competition.id, attempt);
    res.status(201).json({ id: attempt.id, token: attempt.token });
  });
  const update = (req, change) => {
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(req.params.attemptId)) throw fail(404, 'Attempt not found.');
    return store.updateAttempt(req.competition.id, req.params.attemptId, attempt => {
      if (!attempt) throw fail(404, 'Attempt not found.');
      if (!safeEqual(req.get('Authorization'), `Bearer ${attempt.token}`)) throw fail(403, 'Invalid attempt token.');
      return change(attempt);
    });
  };
  app.post('/api/competitions/:competitionId/attempts/:attemptId/start', async (req, res) => {
    const attempt = await update(req, a => ({ ...a, startedAt: a.startedAt ?? now() }));
    res.json({ startedAt: attempt.startedAt });
  });
  app.post('/api/competitions/:competitionId/attempts/:attemptId/finish', async (req, res) => {
    const attempt = await update(req, a => {
      // Idempotency makes retries safe after a dropped response.
      if (a.completed) return a;
      if (a.startedAt === null) throw fail(409, 'Start typing before submitting a result.');
      const { text, durationMs, errors } = req.body;
      if (text !== req.competition.text) throw fail(400, 'The typed text must match the entire snippet.');
      // Bound against join time: the first-start request may have needed an offline retry.
      if (!Number.isFinite(durationMs) || durationMs < 100 || durationMs > 86_400_000
        || durationMs > now() - a.createdAt + 30_000) throw fail(400, 'Invalid typing duration.');
      if (!Number.isSafeInteger(errors) || errors < 0 || errors > 1_000_000) throw fail(400, 'Invalid error count.');
      const length = typedCharacterCount(text);
      return { ...a, completed: true, finishedAt: now(), durationMs: Math.round(durationMs), errors,
        wpm: Math.round(length / 5 / (durationMs / 60_000) * 100) / 100,
        cpm: Math.round(length / (durationMs / 60_000)),
        accuracy: Math.round(length / (length + errors) * 10000) / 100 };
    });
    res.json(publicResult(attempt));
  });
  app.use(express.static(publicPath));
  app.get('/c/:id', (_req, res) => res.sendFile(`${publicPath}/index.html`));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    if (status >= 500) console.error('Request failed:', error);
    res.status(status).json({ error: status >= 500 ? 'Unable to save or load data. Please try again.' : error.message });
  });
  return app;
}
