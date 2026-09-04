import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const { transform } = require('../node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild');

const loadTsx = async (relativePath) => {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const result = await transform(source, { format: 'cjs', jsx: 'automatic', loader: 'tsx', target: 'es2022' });
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', result.code)(require, loaded, loaded.exports);
  return loaded.exports;
};

test('SpectralHook exposes the approved primary-action whitelist', async () => {
  const { SPECTRAL_ACTIONS, isSpectralActionAllowed } = await loadTsx('components/brand/SpectralHook.tsx');
  for (const action of [
    'add-account', 'sync-orders', 'import-orders', 'ship-order', 'sync-product', 'add-product',
    'add-card', 'save-card', 'add-keyword', 'save-keyword', 'save-delivery-rule',
    'save-default-reply', 'save-settings', 'save-model-config', 'load-model', 'send-ai-message',
  ]) {
    assert.equal(isSpectralActionAllowed(action), true, action);
    assert.equal(SPECTRAL_ACTIONS.includes(action), true, action);
  }
  for (const action of ['navigate', 'refresh', 'edit', 'delete', 'toggle', 'close', 'cancel', 'paginate', 'unload-model']) {
    assert.equal(isSpectralActionAllowed(action), false, action);
  }
});

test('SpectralHook maps operation results to success and failure', async () => {
  const { getSpectralOutcome, isViewportVisible } = await loadTsx('components/brand/SpectralHook.tsx');
  assert.equal(getSpectralOutcome({ success: true }), 'success');
  assert.equal(getSpectralOutcome({ success: false }), 'failure');
  assert.equal(getSpectralOutcome(undefined), 'success');
  assert.equal(getSpectralOutcome(new Error('failed')), 'failure');
  assert.equal(isViewportVisible({ left: -260, right: -4, top: 0, bottom: 60, width: 256, height: 60 }, 390, 844), false);
  assert.equal(isViewportVisible({ left: 16, right: 60, top: 16, bottom: 60, width: 44, height: 44 }, 390, 844), true);
});

test('SpectralHookLayer is a decorative, reduced-motion-safe SVG overlay', async () => {
  const { SpectralHookLayer } = await loadTsx('components/brand/SpectralHook.tsx');
  const html = renderToStaticMarkup(React.createElement(SpectralHookLayer, { state: null }));
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /pointer-events="none"/);
  assert.match(html, /focusable="false"/);
  assert.match(html, /viewBox=/);
  assert.match(html, /spectral-hook__chain/);
  assert.match(html, /spectral-hook__hook/);
  assert.match(html, /spectral-hook__hook-anchor/);
  assert.match(html, /spectral-hook__soul/);
});

test('SpectralHook source uses the approved phases and one active effect', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../components/brand/SpectralHook.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
  ]);
  for (const phase of ['charging', 'traveling', 'impact', 'tension', 'returning', 'broken']) {
    assert.match(source, new RegExp(phase));
  }
  assert.match(source, /clearTimeout/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /1800/);
  assert.match(css, /data-phase="traveling"[^}]+spectral-hook__chain[^}]*\{[^}]*opacity:\s*0\.88/s);
});

test('primary action integrations use the shared spectral runner without changing API ownership', async () => {
  const files = [
    'components/AccountList.tsx', 'components/OrderList.tsx', 'components/ItemList.tsx',
    'components/CardList.tsx', 'components/Keywords.tsx', 'components/Settings.tsx',
    'components/LocalLLMPlayground.tsx',
  ];
  const sources = await Promise.all(files.map((file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')));
  for (const [index, source] of sources.entries()) {
    assert.match(source, /useSpectralAction/, files[index]);
    assert.match(source, /runSpectralAction/, files[index]);
  }
});

test('authenticated shell mounts one global hook provider and layer with responsive sources', async () => {
  const [app, sidebar] = await Promise.all([
    readFile(new URL('../App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/Sidebar.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /SpectralHookProvider/);
  assert.match(app, /SpectralHookLayer/);
  assert.match(sidebar, /useSpectralSource/);
  assert.match(sidebar, /SeshiMark/);
  assert.match(app, /aria-label="打开主导航"/);
});
