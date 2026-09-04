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
  const result = await transform(source, {
    format: 'cjs',
    jsx: 'automatic',
    loader: 'tsx',
    target: 'es2022',
  });
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', result.code)(require, loaded, loaded.exports);
  return loaded.exports;
};

test('SeshiMark remains legible at the three supported compact sizes', async () => {
  const { default: SeshiMark } = await loadTsx('components/brand/SeshiMark.tsx');

  for (const size of [24, 32, 40]) {
    const html = renderToStaticMarkup(React.createElement(SeshiMark, { size, label: 'seshi' }));
    assert.match(html, new RegExp(`width="${size}"`));
    assert.match(html, new RegExp(`height="${size}"`));
    assert.match(html, /viewBox="0 0 40 40"/);
    assert.match(html, /aria-label="seshi"/);
    assert.equal((html.match(/<path/g) || []).length >= 3, true);
    assert.equal((html.match(/<circle/g) || []).length, 1);
  }
});

test('SpectralBackdrop is inert, subtle SVG decoration', async () => {
  const { default: SpectralBackdrop } = await loadTsx('components/brand/SpectralBackdrop.tsx');
  const html = renderToStaticMarkup(React.createElement(SpectralBackdrop));

  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /pointer-events-none/);
  assert.match(html, /opacity-\[0\.0[2-6]\]/);
  assert.equal((html.match(/<path/g) || []).length >= 2, true);
  assert.equal((html.match(/<circle/g) || []).length >= 2, true);
  assert.doesNotMatch(html, /yellow|amber|#[0-9a-f]{3,8}/i);
});

test('AI Core derives and exposes the four real model states', async () => {
  const { default: AICore, resolveAICoreState } = await loadTsx('components/brand/AICore.tsx');
  const cases = [
    [{ loading: true, action: null, loaded: false, error: '' }, 'loading', '加载中'],
    [{ loading: false, action: 'load', loaded: false, error: '' }, 'loading', '加载中'],
    [{ loading: false, action: null, loaded: true, error: '' }, 'online', '已加载'],
    [{ loading: false, action: null, loaded: false, error: '' }, 'offline', '未加载'],
    [{ loading: true, action: null, loaded: true, error: '连接失败' }, 'error', '错误'],
  ];

  for (const [input, expectedState, expectedLabel] of cases) {
    assert.equal(resolveAICoreState(input), expectedState);
    const html = renderToStaticMarkup(React.createElement(AICore, { state: expectedState, size: 48 }));
    assert.match(html, new RegExp(`data-state="${expectedState}"`));
    assert.match(html, new RegExp(`aria-label="AI Core：${expectedLabel}"`));
  }
});

test('SystemStatus derives only observable dashboard conditions', async () => {
  const { default: SystemStatus, deriveSystemStatus } = await loadTsx('components/brand/SystemStatus.tsx');
  const derivedCases = [
    [{ loading: true, error: false }, 'loading'],
    [{ loading: false, error: true }, 'error'],
    [{ loading: false, error: false, accountCount: 0 }, 'warning'],
    [{ loading: false, error: false, accountCount: 2 }, 'healthy'],
  ];

  for (const [input, expectedState] of derivedCases) {
    assert.equal(deriveSystemStatus(input), expectedState);
  }

  const renderCases = [
    ['loading', '数据准备中'],
    ['warning', '尚未接入账号'],
    ['error', '系统异常'],
    ['healthy', '系统运行正常'],
  ];
  for (const [expectedState, expectedLabel] of renderCases) {
    const html = renderToStaticMarkup(React.createElement(SystemStatus, {
      status: expectedState,
      accountCount: 2,
    }));
    assert.match(html, new RegExp(`data-state="${expectedState}"`));
    assert.match(html, new RegExp(expectedLabel));
    assert.match(html, /role="status"/);
  }
});

test('SpectralState provides accessible, compact feedback states', async () => {
  const { default: SpectralState } = await loadTsx('components/brand/SpectralState.tsx');
  for (const state of ['empty', 'loading', 'error', 'offline']) {
    const html = renderToStaticMarkup(React.createElement(SpectralState, {
      state,
      type: 'orders',
      title: '暂无订单',
      description: '同步订单后，交易记录会显示在这里',
    }));
    assert.match(html, new RegExp(`data-state="${state}"`));
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, new RegExp(state === 'error' ? 'role="alert"' : 'role="status"'));
    assert.match(html, /max-w/);
    assert.doesNotMatch(html, /yellow|amber|neon|glow|#(?:[0-9a-f]{3,8})/i);
  }
});
