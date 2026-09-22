import { acceptInput, formatTime, skipIndentation, typedCharacterCount } from './typing.js';

const app = document.querySelector('#app');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const presets = [
  { name: 'Binary search', level: 'WARM-UP', text: '#include <bits/stdc++.h>\nusing namespace std;\n\nint binary_search(const vector<int>& a, int target) {\n    int lo = 0, hi = (int)a.size() - 1;\n    while (lo <= hi) {\n        int mid = lo + (hi - lo) / 2;\n        if (a[mid] == target) return mid;\n        if (a[mid] < target) lo = mid + 1;\n        else hi = mid - 1;\n    }\n    return -1;\n}' },
  { name: 'Fast I/O', level: 'QUICK SPRINT', text: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    int n;\n    cin >> n;\n    long long sum = 0;\n    for (int i = 0; i < n; ++i) {\n        int x;\n        cin >> x;\n        sum += x;\n    }\n    cout << sum << "\\n";\n    return 0;\n}' },
  { name: 'Breadth-first search', level: 'ENDURANCE', text: '#include <bits/stdc++.h>\nusing namespace std;\n\nvector<int> bfs(const vector<vector<int>>& adj, int start) {\n    vector<int> dist(adj.size(), -1);\n    queue<int> q;\n    dist[start] = 0;\n    q.push(start);\n\n    while (!q.empty()) {\n        int u = q.front();\n        q.pop();\n        for (int v : adj[u]) {\n            if (dist[v] != -1) continue;\n            dist[v] = dist[u] + 1;\n            q.push(v);\n        }\n    }\n    return dist;\n}' },
];
async function api(path, options = {}) {
  const { headers, ...rest } = options;
  const response = await fetch(`/api${path}`, { ...rest, headers: { 'Content-Type': 'application/json', ...headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
function errorText(id, message) { document.getElementById(id).textContent = message; }
function codeLines(text) { return text.split('\n').map((line, i) => `<div class="preview-line"><span>${i + 1}</span><code>${escape(line) || ' '}</code></div>`).join(''); }

async function home() {
  const config = await api('/config');
  document.title = 'Code Sprint — C++ typing competitions';
  app.innerHTML = `<section class="hero"><div class="eyebrow"><span class="dot">●</span> THE PROGRAMMING CLUB'S TYPING ARENA</div><h1>Think fast.<br>Type <em>faster.</em></h1><p>Turn C++ practice into a friendly competition.<br>One snippet. One shared link. Every keystroke counts.</p><div class="hero-tags"><span>C++ focused</span><span>Instant results</span><span>Shared leaderboard</span></div><div class="hero-mark" aria-hidden="true">{<span>↗</span>}</div></section>
  <section class="create-section"><div class="section-heading"><div><span class="eyebrow muted">SET THE PACE</span><h2>Create a competition</h2></div><span class="step-label">01 / SET UP YOUR ROUND</span></div>
  <div class="setup-grid"><form id="create-form" class="panel setup-form"><label for="title">Competition name</label><input id="title" maxlength="100" required placeholder="e.g. Friday night code sprint" autocomplete="off"><label for="preset">Choose your challenge</label><select id="preset">${presets.map((p, i) => `<option value="${i}">${p.name}</option>`).join('')}<option value="custom">Custom C++ snippet</option></select><p class="field-hint" id="challenge-hint">A contest staple. Find your rhythm with loops and conditions.</p><div id="custom-field" hidden><label for="custom-code">Your C++ snippet</label><textarea id="custom-code" rows="10" spellcheck="false" maxlength="5000" placeholder="Paste 20–5,000 characters of C++ here"></textarea><p class="field-hint">Indentation is automatic. Use ASCII text; spaces within code still count.</p></div>${config.requiresOrganizerKey ? '<label for="organizer-key">Organizer key</label><input id="organizer-key" type="password" autocomplete="off" required placeholder="Your private organizer key">' : '<p class="local-note">Local mode · no organizer key required</p>'}<p id="create-error" class="error" role="alert"></p><button class="primary" type="submit" id="create-button">Create competition <span>→</span></button><p class="field-hint centered">You’ll get a unique link to share with your competitors.</p></form>
  <div class="panel code-preview"><div class="editor-bar"><span><i></i><i></i><i></i></span><span id="filename">binary_search.cpp</span><span class="language">C++</span></div><div id="preview-code" class="preview-code"></div><div class="editor-footer"><span id="char-count"></span><span id="level"></span></div></div></div></section>
  <section class="how-it-works"><article><span class="step-number">01</span><h3>Make it a round</h3><p>Pick a snippet or bring your own contest code.</p></article><article><span class="step-number">02</span><h3>Bring your club</h3><p>Share the link. Competitors enter a name and get ready.</p></article><article><span class="step-number">03</span><h3>Race the clock</h3><p>The first character starts it. The last one seals your score.</p></article></section>`;
  const select = document.querySelector('#preset');
  const custom = document.querySelector('#custom-code');
  const selectedText = () => select.value === 'custom' ? custom.value.replace(/\r\n?/g, '\n') : presets[Number(select.value)].text;
  const preview = () => {
    const isCustom = select.value === 'custom';
    document.querySelector('#custom-field').hidden = !isCustom;
    custom.required = isCustom;
    document.querySelector('#preview-code').innerHTML = codeLines(selectedText());
    document.querySelector('#char-count').textContent = `${typedCharacterCount(selectedText())} characters to type · auto-indent`;
    document.querySelector('#level').textContent = isCustom ? 'YOUR CHALLENGE' : presets[Number(select.value)].level;
    document.querySelector('#filename').textContent = isCustom ? 'challenge.cpp' : `${presets[Number(select.value)].name.toLowerCase().replaceAll(' ', '_')}.cpp`;
    document.querySelector('#challenge-hint').textContent = isCustom ? 'Make the round your own.' : 'Practice real C++ patterns, one character at a time.';
  };
  select.addEventListener('change', preview); custom.addEventListener('input', preview); preview();
  document.querySelector('#create-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.querySelector('#create-button'); button.disabled = true;
    errorText('create-error', '');
    try {
      const competition = await api('/competitions', { method: 'POST', headers: { 'X-Organizer-Key': document.querySelector('#organizer-key')?.value || '' }, body: JSON.stringify({ title: document.querySelector('#title').value, text: selectedText() }) });
      location.assign(`/c/${competition.id}?created=1`);
    } catch (error) { errorText('create-error', error.message); button.disabled = false; }
  });
}

async function competitionPage(id) {
  const base = `/competitions/${encodeURIComponent(id)}`;
  const competition = await api(base);
  document.title = `${competition.title} — Code Sprint`;
  app.innerHTML = `<section class="round-heading"><a href="/" class="back-link">← All new sprints start here</a><div class="round-title"><div><div class="eyebrow"><span class="dot">●</span> C++ TYPING COMPETITION</div><h1>${escape(competition.title)}</h1><p>${typedCharacterCount(competition.text)} characters to type · ${competition.text.split('\n').length} lines · Start whenever you’re ready</p></div><button id="share" class="secondary">Copy competition link ↗</button></div><p id="share-status" class="field-hint" role="status">${new URLSearchParams(location.search).has('created') ? 'Your competition is ready. Share the link to invite your club.' : ''}</p></section>
  <div class="round-grid metrics-hidden" id="round-grid"><section class="race-column"><div class="panel join-panel" id="join-panel"><div><span class="eyebrow muted">TAKE YOUR PLACE</span><h2>Ready to sprint?</h2><p>Enter your name to join this round.</p></div><form id="join-form"><label class="sr-only" for="name">Your name</label><div class="join-input"><input id="name" maxlength="40" required placeholder="Your name" autocomplete="nickname"><button class="primary" id="join-button">Join round →</button></div><p class="field-hint">Your name and results will be visible to everyone with this link.</p><p id="join-error" class="error" role="alert"></p></form></div>
  <div class="stats-bar" id="stats-bar" hidden><div><span>TIME</span><strong id="time">00:00.0</strong></div><div><span>WORDS / MIN</span><strong id="wpm">0</strong></div><div><span>ACCURACY</span><strong id="accuracy">100<span>%</span></strong></div><div><span>PROGRESS</span><strong id="progress">0<span>%</span></strong></div></div>
  <div class="panel typing-panel"><div class="editor-bar"><span class="language">C++</span><span>challenge.cpp</span><span id="race-status">JOIN TO BEGIN</span></div><div class="typing-code" id="target" aria-label="Target C++ code"></div><div class="typing-entry"><label for="typing-input" id="typing-label">Join the round above to unlock your keyboard.</label><textarea id="typing-input" rows="2" disabled spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off" aria-describedby="typing-help" placeholder="Type here…"></textarea></div><div class="editor-footer" id="typing-help">Indentation is automatic. Enter = new line. Correct each mistake to advance. Paste is disabled.</div></div>
  <p id="race-error" class="error" role="alert"></p><div id="result" aria-live="polite"></div><div class="race-actions"><button id="restart" class="secondary" hidden>Start a new attempt ↻</button><span id="focus-hint" class="field-hint">No countdown. Your first character starts the clock.</span></div></section>
  <aside class="panel leaderboard" id="leaderboard-panel" hidden><div class="board-title"><div><span class="eyebrow muted">THE SCOREBOARD</span><h2>Leaderboard</h2></div><span class="live-dot" title="Refreshes every 10 seconds"></span></div><p class="field-hint">Top 100 attempts · ranked by WPM</p><div id="board" aria-live="polite"></div><p id="board-error" class="error" role="status"></p><div class="board-note">Every finish counts.<br>Try again and beat your best.</div></aside></div>`;
  document.querySelector('#share').addEventListener('click', async () => {
    const link = `${location.origin}/c/${id}`;
    try { await navigator.clipboard.writeText(link); errorText('share-status', 'Link copied. Send it to your competitors!'); }
    catch { errorText('share-status', `Share this link: ${link}`); }
  });
  let attempt, startRequest, started = null, ended = null, position = 0, typedCharacters = 0, errors = 0, saving = false, currentResult;
  const input = document.querySelector('#typing-input');
  const target = document.querySelector('#target');
  const restart = document.querySelector('#restart');
  const roundGrid = document.querySelector('#round-grid');
  const statsBar = document.querySelector('#stats-bar');
  const leaderboardPanel = document.querySelector('#leaderboard-panel');
  const spans = [...competition.text].map((char, i) => {
    const span = document.createElement('span');
    span.textContent = char === '\n' ? '↵\n' : char === '\t' ? '→   ' : char;
    span.className = 'char'; span.dataset.index = i;
    target.append(span); return span;
  });
  position = skipIndentation(competition.text, 0);
  for (let i = 0; i < position; i++) spans[i].classList.add('correct');
  spans[position]?.classList.add('cursor');
  const elapsed = () => started === null ? 0 : (ended ?? performance.now()) - started;
  function renderStats() {
    const duration = elapsed();
    document.querySelector('#time').textContent = formatTime(duration);
    document.querySelector('#wpm').textContent = duration > 0 ? Math.round(typedCharacters / 5 / (duration / 60000)) : 0;
    document.querySelector('#accuracy').textContent = `${typedCharacters + errors ? Math.round(typedCharacters / (typedCharacters + errors) * 100) : 100}%`;
    document.querySelector('#progress').textContent = `${Math.floor(typedCharacters / typedCharacterCount(competition.text) * 100)}%`;
  }
  function hideMetrics() {
    statsBar.hidden = true;
    leaderboardPanel.hidden = true;
    roundGrid.classList.add('metrics-hidden');
  }
  function revealMetrics() {
    renderStats();
    statsBar.hidden = false;
    leaderboardPanel.hidden = false;
    roundGrid.classList.remove('metrics-hidden');
    leaderboard();
  }
  const timer = setInterval(() => { if (started !== null && ended === null) renderStats(); }, 100);
  const authorization = () => ({ Authorization: `Bearer ${attempt.token}` });
  function startOnServer() {
    return api(`${base}/attempts/${attempt.id}/start`, { method: 'POST', headers: authorization(), body: '{}' });
  }
  async function join() {
    const button = document.querySelector('#join-button'); button.disabled = true; restart.disabled = true;
    try {
      attempt = await api(`${base}/attempts`, { method: 'POST', body: JSON.stringify({ name: document.querySelector('#name').value }) });
      started = ended = null; position = skipIndentation(competition.text, 0); typedCharacters = errors = 0; currentResult = null; startRequest = null;
      for (const span of spans) span.className = 'char';
      for (let i = 0; i < position; i++) spans[i].classList.add('correct');
      spans[position]?.classList.add('cursor'); target.scrollTop = 0;
      document.querySelector('#result').innerHTML = ''; errorText('race-error', ''); errorText('join-error', '');
      input.disabled = false; input.value = ''; input.focus();
      document.querySelector('#join-panel').hidden = true; restart.hidden = false;
      document.querySelector('#typing-label').textContent = `You're in, ${document.querySelector('#name').value.trim()}. Type the first character to start.`;
      document.querySelector('#race-status').textContent = 'READY WHEN YOU ARE';
      document.querySelector('#focus-hint').textContent = 'No countdown. Your first character starts the clock.';
      hideMetrics();
      renderStats();
    } catch (error) { errorText('race-error', error.message); }
    finally { button.disabled = false; restart.disabled = false; }
  }
  document.querySelector('#join-form').addEventListener('submit', event => { event.preventDefault(); join(); });
  restart.addEventListener('click', () => { if (started === null || ended !== null || confirm('Discard this unfinished attempt and start again?')) join(); });
  async function save() {
    if (saving) return; saving = true; restart.disabled = true;
    document.querySelector('#result').innerHTML = '<div class="panel result-panel"><h2>Sprint complete.</h2><p>Saving your result…</p></div>';
    try {
      const startError = await startRequest;
      if (startError) await startOnServer();
      currentResult = await api(`${base}/attempts/${attempt.id}/finish`, { method: 'POST', headers: authorization(), body: JSON.stringify({ text: competition.text, durationMs: elapsed(), errors }) });
      const r = currentResult;
      document.querySelector('#result').innerHTML = `<div class="panel result-panel"><span class="eyebrow">✓ RESULT SAVED</span><h2>That’s a finish, ${escape(r.name)}.</h2><div class="result-stats"><div><strong>${r.wpm}</strong><span>WPM</span></div><div><strong>${formatTime(r.durationMs)}</strong><span>TIME</span></div><div><strong>${r.accuracy}%</strong><span>ACCURACY</span></div></div><p>${r.cpm} characters/min · ${r.errors} incorrect keystrokes</p><p class="field-hint">Recorded ${escape(new Date(r.finishedAt).toLocaleString())}</p></div>`;
      errorText('race-error', ''); await leaderboard();
    } catch (error) {
      errorText('race-error', error.message);
      document.querySelector('#result').innerHTML = '<div class="panel result-panel"><h2>Finished. Your result hasn’t saved yet.</h2><p>Keep this page open and retry when your connection is back.</p><button class="primary" id="retry-save">Retry saving result</button></div>';
      document.querySelector('#retry-save').addEventListener('click', save);
    } finally { saving = false; restart.disabled = !currentResult; }
  }
  function type(chars) {
    if (!attempt || ended !== null || !chars) return;
    if (started === null) {
      started = performance.now();
      // Capture rejections immediately; the result can be retried when saving.
      startRequest = startOnServer().then(() => null, error => error);
      document.querySelector('#race-status').textContent = 'SPRINT IN PROGRESS';
      document.querySelector('#typing-label').textContent = 'Keep going. Correct characters light up in green.';
    }
    const previous = position;
    const result = acceptInput(competition.text, position, chars);
    position = result.position; typedCharacters += result.accepted; errors += result.errors;
    spans[previous]?.classList.remove('cursor');
    for (let i = previous; i < position; i++) spans[i].classList.add('correct');
    spans[position]?.classList.add('cursor');
    input.classList.toggle('incorrect', result.errors > 0);
    document.querySelector('#focus-hint').textContent = result.errors ? 'Wrong key — correct the highlighted character to continue.' : 'Keep your rhythm. Every character counts.';
    const cursor = spans[position];
    if (cursor) {
      const top = cursor.offsetTop;
      if (top > target.scrollTop + target.clientHeight - 50 || top < target.scrollTop) target.scrollTop = Math.max(0, top - target.clientHeight / 2);
    }
    if (position === competition.text.length) {
      ended = performance.now(); input.disabled = true;
      document.querySelector('#race-status').textContent = 'FINISHED';
      revealMetrics();
      save();
    }
    renderStats();
  }
  input.addEventListener('keydown', event => {
    if (event.key === 'Tab' && !event.shiftKey && competition.text[position] === '\t') {
      event.preventDefault();
      type('\t');
    }
    if (event.key === 'Enter') { event.preventDefault(); type('\n'); }
  });
  input.addEventListener('beforeinput', event => {
    if (event.inputType.startsWith('insert')) {
      event.preventDefault();
      if (event.inputType === 'insertText' && event.data && event.data.length === 1) type(event.data);
      else if (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') type('\n');
    } else event.preventDefault();
  });
  input.addEventListener('input', () => { input.value = ''; });
  for (const name of ['paste', 'drop']) input.addEventListener(name, event => { event.preventDefault(); errorText('race-error', 'Type the snippet yourself — paste and drop are disabled.'); });
  async function leaderboard() {
    try {
      const results = await api(`${base}/results`);
      document.querySelector('#board').innerHTML = results.length ? `<table><thead><tr><th>#</th><th>COMPETITOR</th><th>WPM</th></tr></thead><tbody>${results.map((r, i) => `<tr class="${r.id === currentResult?.id ? 'your-score' : ''}"><td>${String(i + 1).padStart(2, '0')}</td><td><strong>${escape(r.name)}</strong><small>${formatTime(r.durationMs)} · ${r.accuracy}% acc.</small></td><td>${r.wpm.toFixed(1)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-board"><span aria-hidden="true">⚑</span><h3>The first spot is yours.</h3><p>Finish a sprint to put your<br>name on the board.</p></div>';
      errorText('board-error', '');
    } catch { errorText('board-error', 'Leaderboard unavailable. We’ll retry automatically.'); }
  }
  const poll = setInterval(() => { if (ended !== null && !document.hidden) leaderboard(); }, 10000);
  addEventListener('beforeunload', event => {
    if ((started !== null && ended === null) || (ended !== null && !currentResult)) { event.preventDefault(); event.returnValue = ''; }
  });
  addEventListener('pagehide', () => { clearInterval(timer); clearInterval(poll); }, { once: true });
}
try {
  const match = location.pathname.match(/^\/c\/([^/]+)\/?$/);
  if (match) await competitionPage(match[1]); else await home();
} catch (error) {
  app.innerHTML = `<section class="page-error panel"><span class="eyebrow">UNABLE TO OPEN THIS PAGE</span><h1>Let’s try that again.</h1><p>${escape(error.message)}</p><a class="primary" href="/">Back to Code Sprint →</a></section>`;
}
