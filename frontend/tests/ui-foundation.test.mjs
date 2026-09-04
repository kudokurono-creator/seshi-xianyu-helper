import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('authenticated shell collapses the sidebar below the desktop breakpoint', async () => {
  const [app, sidebar] = await Promise.all([
    read('App.tsx'),
    read('components/Sidebar.tsx'),
  ]);

  assert.match(app, /md:ml-64/);
  assert.match(app, /aria-label="打开主导航"/);
  assert.match(sidebar, /mobileOpen/);
  assert.match(sidebar, /-translate-x-full/);
  assert.match(sidebar, /md:translate-x-0/);
});

test('login fields expose labels, names and autocomplete hints', async () => {
  const app = await read('App.tsx');

  assert.match(app, /htmlFor="login-username"/);
  assert.match(app, /id="login-username"/);
  assert.match(app, /name="username"/);
  assert.match(app, /autoComplete="username"/);
  assert.match(app, /htmlFor="login-password"/);
  assert.match(app, /id="login-password"/);
  assert.match(app, /name="password"/);
  assert.match(app, /autoComplete="current-password"/);
  assert.match(app, /aria-live="polite"/);
});

test('shared visual foundation keeps text readable and motion scoped', async () => {
  const css = await read('index.css');

  assert.match(css, /--text-muted:\s*#869e9e/);
  assert.match(css, /overscroll-behavior:\s*contain/);
  assert.doesNotMatch(css, /transition:\s*all/);
  assert.match(css, /animation:\s*fadeIn\s+0\.22s/);
});

test('source components do not use transition-all utilities', async () => {
  const files = [
    'App.tsx',
    'components/AccountList.tsx',
    'components/CardList.tsx',
    'components/Dashboard.tsx',
    'components/ItemList.tsx',
    'components/Keywords.tsx',
    'components/OrderList.tsx',
    'components/Rules.tsx',
    'components/Settings.tsx',
  ];
  const sources = await Promise.all(files.map(read));

  for (const [index, source] of sources.entries()) {
    assert.equal(source.includes('transition-all'), false, files[index]);
  }
});

test('settings toggles expose their checked state to assistive technology', async () => {
  const settings = await read('components/Settings.tsx');

  for (const value of [
    'settings.registration_enabled',
    'settings.show_default_login_info',
    'settings.login_captcha_enabled',
    'settings.item_sync_enabled',
  ]) {
    assert.match(settings, new RegExp(`aria-checked=\\{${value.replaceAll('.', '\\\.')}\\}`));
  }
  assert.equal((settings.match(/role="switch"/g) || []).length >= 4, true);
});

test('standard modal panels identify themselves as named dialogs', async () => {
  const files = [
    'components/AccountList.tsx',
    'components/CardList.tsx',
    'components/OrderList.tsx',
    'components/Rules.tsx',
  ];
  const sources = await Promise.all(files.map(read));

  for (const [index, source] of sources.entries()) {
    const containers = source.match(/<div[^>]+className="modal-container[^>]*>/g) || [];
    assert.notEqual(containers.length, 0, files[index]);
    for (const container of containers) {
      assert.match(container, /role="dialog"/, files[index]);
      assert.match(container, /aria-modal="true"/, files[index]);
      assert.match(container, /aria-label=/, files[index]);
    }
  }
});
