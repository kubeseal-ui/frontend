// ESLint v9 flat config for kubeseal-ui frontend.
//
// Mirrors the kubeseal-ui Go convention: gocyclo + gocognit complexity gates
// from .golangci.yml are represented here by eslint-plugin-sonarjs which
// provides both sonarjs/cyclomatic-complexity and sonarjs/cognitive-complexity.
// Thresholds are set to 30 to match the pamawas default, applied per-function.
// Tests are excluded to keep the gate focused on shipping code.
//
// Mirrors the @vue/eslint-config-typescript recommended setup with sensible
// defaults. Future phases add stricter rules (no-unused-vars, no-explicit-any)
// per internal-docs/engineering/frontend/application-design.md.
import vue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import sonarjs from 'eslint-plugin-sonarjs'

const CYCLO_THRESHOLD = 30 // matches pamawas gocyclo default
const COGNITIVE_THRESHOLD = 30 // matches pamawas gocognit default

export default [
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      vue,
      '@typescript-eslint': tsPlugin,
      sonarjs,
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'sonarjs/cyclomatic-complexity': ['error', { threshold: CYCLO_THRESHOLD }],
      'sonarjs/cognitive-complexity': ['error', COGNITIVE_THRESHOLD],
    },
  },
  {
    files: ['**/*.ts', '**/*.js'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      sonarjs,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'sonarjs/cyclomatic-complexity': ['error', { threshold: CYCLO_THRESHOLD }],
      'sonarjs/cognitive-complexity': ['error', COGNITIVE_THRESHOLD],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
]
