import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'dist/', 'extension/fonts/'] },
  js.configs.recommended,
  {
    files: ['extension/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.webextensions },
    },
    rules: { 'no-unused-vars': ['error', { caughtErrors: 'none' }] },
  },
  {
    // e2e code is Node, but its page.evaluate callbacks run in the browser or
    // the extension service worker.
    files: ['e2e/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser, ...globals.webextensions },
    },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.{js,mjs}', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
  },
];
