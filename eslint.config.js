import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const noDefaultExport = {
  selector: 'ExportDefaultDeclaration',
  message: 'Use named exports (CLAUDE.md conventions).',
};

const noEmitOutsideBroadcaster = [
  {
    selector: "CallExpression[callee.property.name='emit']",
    message: 'Only transport/broadcaster.ts may emit to sockets (ARCHITECTURE §8, layer 1).',
  },
  {
    selector: "CallExpression[callee.property.name='to']",
    message: 'Never address Socket.IO rooms; the broadcaster sends to each member socket.',
  },
];

export default defineConfig(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // Shared package: imported by the browser, so no secrets and no server-only content.
  {
    files: ['packages/shared/src/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', noDefaultExport] },
  },

  // Server
  {
    files: ['apps/server/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/server/src/**/*.ts'],
    ignores: ['apps/server/src/transport/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'socket.io', message: 'Only transport/ may import socket.io.' }] },
      ],
    },
  },
  {
    files: ['apps/server/src/**/*.ts'],
    ignores: ['apps/server/src/transport/broadcaster.ts'],
    rules: { 'no-restricted-syntax': ['error', noDefaultExport, ...noEmitOutsideBroadcaster] },
  },
  // Games are pure plugins: time and randomness come from ctx; no room/transport/socket access.
  {
    files: ['apps/server/src/games/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', { name: 'Date', message: 'Use ctx.now (games are pure).' }],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use ctx.rng (games are pure).' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'socket.io', message: 'Games never touch sockets.' }],
          patterns: [
            { group: ['**/rooms/**', '**/transport/**'], message: 'Games must not depend on rooms or transport.' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/server/src/transport/broadcaster.ts'],
    rules: { 'no-restricted-syntax': ['error', noDefaultExport] },
  },

  // Web
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@party/content', '@party/content/*'], message: 'Word lists are server-only.' }] },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        noDefaultExport,
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Never render raw HTML.',
        },
      ],
    },
  },
);
