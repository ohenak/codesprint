# Code Sprint

A deployable C++ typing competition app for programming clubs. Create a round, share its unique `/c/abcde` URL, and let competitors join by name. Each competitor starts independently. Timing begins with their first typed character (including an incorrect character) and stops on the final correct character. Results and the leaderboard persist. New links use five lowercase letters/digits, excluding easily confused characters. Collisions are retried atomically without overwriting existing rounds. Existing GUID links continue to work.

## Run locally

Requires **Node.js 24 or newer**.

```sh
npm ci
npm start
```

Open **http://localhost:8080**. Local competitions and results are stored in `data/code-sprint.db` and survive restarts. No cloud account is needed. Local creation is open by default; set `ADMIN_KEY` to protect it. The app does not automatically load `.env`; use shell environment variables or `node --env-file=.env src/server.js`.

```sh
ADMIN_KEY='your-long-private-organizer-key' npm start
```

1. Enter a competition name and select Binary search, Fast I/O, BFS, or your own snippet.
2. Create the competition and copy the link.
3. Competitors enter a display name and join, then type in the input below the code.
4. A wrong key counts as an error and must be corrected before advancing. Leading spaces and tabs are inserted automatically, including on the first line and blank lines. Type the code and press Enter for each line break. Spaces inside code still count; Tab types an inline tab when required, otherwise it moves focus. Shift+Tab moves focus out of the typing box.
5. The final matching character stops the timer. The saved record displays time, WPM, accuracy, CPM, and errors. The leaderboard refreshes every ten seconds; competitors can attempt again.

The timer continues when the tab is unfocused. A reload discards an unfinished attempt; the browser warns before leaving. Completed scores remain on the leaderboard. If saving fails, keep the page open and use **Retry saving result**; submissions are idempotent.

## Deploy on Google Cloud with Terraform

The complete deployment is in [`infra/`](infra/README.md). It provisions Cloud Run, Firestore and its index/security rules, Artifact Registry, Cloud Build storage/IAM, and the organizer secret. During apply it builds the app in Cloud Build and deploys the resulting image; no local Docker is needed.

```sh
gcloud auth login
gcloud auth application-default login
cd infra
cp terraform.tfvars.example terraform.tfvars
# Set project_id to your existing billing-enabled GCP project.
terraform init
terraform plan -out=deploy.tfplan
terraform apply deploy.tfplan
terraform output -raw app_url
terraform output -raw organizer_key_command
```

See the [deployment guide](infra/README.md) for prerequisites, updates, existing-resource imports, key rotation, state security, and cleanup. Terraform state contains the generated secret and must stay private. Cloud resources have not been provisioned by this repository.

Firestore stores `competitions/{id}` and `competitions/{id}/attempts/{attemptId}`. Completed attempts include the display name, duration, score, error count, and completion time. Cloud Run uses Firestore exclusively; local SQLite is refused on Cloud Run because its filesystem is ephemeral. Application errors go to Cloud Logging. Records have no automatic expiry; deleting a competition also requires deleting its attempts subcollection.

## Scoring and scope

- Automatic indentation is excluded from WPM, CPM, accuracy, and progress. Existing saved scores remain unchanged.
- WPM = manually typed characters / 5 / elapsed minutes. CPM = manually typed characters / elapsed minutes.
- Accuracy = manually typed characters / (manually typed characters + incorrect keystrokes) × 100. Forced correction means all target characters must be entered correctly. Mistakes reduce speed through correction time.
- Snippets accept 20–5,000 ASCII characters, tabs, and newlines. CRLF is normalized to LF. Code is displayed as text and never executed.
- Timing uses the browser's monotonic clock so network latency is excluded. The server checks completion, duration bounds, token ownership, and first-start/first-finish transitions, and calculates scores itself.
- This is an honor-system training app. Paste/drop are blocked in the UI, but scripted clients can fabricate timing and errors. It is not suitable as tamper-proof judging for prizes.
- Names are display names, not verified accounts. Multiple attempts and duplicate names are allowed. Top 100 **attempts**, rather than unique people, are ranked by WPM. Ties have no guaranteed ranking.
- Anyone with a competition link can join and see its leaderboard. No synchronized starting gun, round closing, user accounts, or organizer dashboard is included.
- Request rate limits are per process and IP, not distributed abuse protection. Large clubs sharing a NAT or public events may need adjusted limits or an edge policy.

## Verify

```sh
npm test
npx playwright install chromium
npm run test:browser
```

API tests cover authentication, validation, competition isolation, timing state, retry idempotency, score calculation, and persistence across SQLite reopen. Browser tests cover creating/joining/typing/saving, wrong first keys, whitespace, frozen completion time, score persistence on reload, lost-response retries, mobile width, and missing competitions.

For a Firestore check, install Java and Firebase CLI, then run:

```sh
firebase emulators:exec --only firestore --project demo-code-sprint \
  'FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 GCLOUD_PROJECT=demo-code-sprint node --test test/firestore.integration.js'
```

The emulator test checks the actual Firestore storage adapter; production still requires the composite index above.
