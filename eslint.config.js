import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Conventional underscore prefix marks "intentionally unused" — let
      // the lint rule honour it instead of forcing us to delete params
      // that are part of a public signature.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
      // Hot-reload optimization, not a correctness issue. Several of our
      // component files export tiny helpers (addKillFeedEntry,
      // triggerDamageFlash, etc.) used elsewhere — moving them to
      // separate files would just churn imports without any runtime win.
      'react-refresh/only-export-components': 'warn',
    },
  },
])
