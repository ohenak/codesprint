import { test, expect } from '@playwright/test';

test('full competition flow, first wrong key starts clock, last character saves once', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Competition name').fill('Friday sprint');
  await page.getByLabel('Choose your challenge').selectOption('custom');
  const snippet = 'int main() {\n    return 0;\n}';
  await page.getByLabel('Your C++ snippet').fill(snippet);
  await page.getByRole('button', { name: 'Create competition' }).click();
  await expect(page).toHaveURL(/\/c\/[23456789abcdefghjkmnpqrstuvwxyz]{5}\?created=1$/);
  await expect(page.getByRole('heading', { name: 'Friday sprint' })).toBeVisible();
  await expect(page.locator('#typing-input')).toBeDisabled();
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Ada <script>');
  await page.getByRole('button', { name: 'Join round' }).click();
  const input = page.locator('#typing-input');
  await expect(input).toBeEnabled();
  await expect(page.locator('#time')).toHaveText('00:00.0');
  await input.press('x');
  await expect(page.locator('#time')).not.toHaveText('00:00.0');
  await expect(page.locator('#progress')).toHaveText('0%');
  await input.pressSequentially('int main() {', { delay: 15 });
  await input.press('Enter');
  await input.pressSequentially('return 0;', { delay: 15 });
  await input.press('Enter');
  await expect(page.locator('#race-status')).toHaveText('SPRINT IN PROGRESS');
  await input.press('}');
  await expect(page.locator('#result')).toContainText('RESULT SAVED');
  await expect(page.locator('#progress')).toHaveText('100%');
  await expect(page.locator('#result')).toContainText('1 incorrect keystrokes');
  await expect(page.locator('#board tbody tr')).toHaveCount(1);
  await expect(page.locator('#board')).toContainText('Ada <script>');
  const time = await page.locator('#time').textContent();
  await page.waitForTimeout(250);
  await expect(page.locator('#time')).toHaveText(time);
  await page.reload();
  await expect(page.locator('#board')).toContainText('Ada <script>');
  expect(errors).toEqual([]);
});

test('mobile layout and invalid competition', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Create a competition' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/c/does-not-exist');
  await expect(page.getByText('Competition not found.')).toBeVisible();
});

test('a lost finish response can be retried without duplicating the result', async ({ page, request }) => {
  const text = 'int main(){return 0;}';
  const response = await request.post('/api/competitions', { data: { title: 'Retry round', text } });
  const competition = await response.json();
  await page.goto(`/c/${competition.id}`);
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Grace');
  await page.getByRole('button', { name: 'Join round' }).click();
  await expect(page.locator('#typing-input')).toBeEnabled();
  await page.route('**/finish', async route => { await route.fetch(); await route.abort(); }, { times: 1 });
  await page.locator('#typing-input').pressSequentially(text, { delay: 15 });
  await expect(page.getByRole('button', { name: 'Retry saving result' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry saving result' }).click();
  await expect(page.locator('#result')).toContainText('RESULT SAVED');
  await expect(page.locator('#board tbody tr')).toHaveCount(1);
});

test('auto-indent handles first line, mixed tabs, nested blocks and blank lines without counting them', async ({ page, request }) => {
  const text = ' \tint main() {\n\tif (true) {\n \t\treturn 0;\n    }\n\t \n}';
  const manualText = text.replace(/^[ \t]+/gm, '');
  const response = await request.post('/api/competitions', { data: { title: 'Auto indent', text } });
  const competition = await response.json();
  await page.goto(`/c/${competition.id}`);
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Ada');
  await page.getByRole('button', { name: 'Join round' }).click();
  const input = page.locator('#typing-input');
  await expect(input).toBeEnabled();
  await expect(page.locator('#target .cursor')).toHaveText('i');
  await expect(page.locator('#time')).toHaveText('00:00.0');
  await expect(page.locator('#progress')).toHaveText('0%');
  const savedResponse = page.waitForResponse(r => r.url().endsWith('/finish'));
  const lines = manualText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i) await input.press('Enter');
    await input.pressSequentially(lines[i], { delay: 15 });
  }
  const finishResponse = await savedResponse;
  const saved = await finishResponse.json();
  const measuredDuration = finishResponse.request().postDataJSON().durationMs;
  await expect(page.locator('#result')).toContainText('RESULT SAVED');
  await expect(page.locator('#progress')).toHaveText('100%');
  await expect(page.locator('#accuracy')).toHaveText('100%');
  expect(saved.errors).toBe(0);
  expect(saved.cpm).toBe(Math.round(manualText.length / (measuredDuration / 60000)));
  await page.getByRole('button', { name: 'Start a new attempt' }).click();
  await expect(input).toBeEnabled();
  await expect(page.locator('#target .cursor')).toHaveText('i');
  await expect(page.locator('#progress')).toHaveText('0%');
  await expect(page.locator('#time')).toHaveText('00:00.0');
});
