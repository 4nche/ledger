import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * One flat config for the whole workspace. Rules here are the ones that catch
 * real defects in this codebase — not style, which Prettier already owns.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      'packages/db/migrations/**',
      // Vendored shadcn/ui source. We compose these, we do not edit them.
      'apps/web/components/ui/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
    },
    rules: {
      // Unused code is usually a leftover from a half-finished change.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // `any` defeats the point of typing financial data.
      '@typescript-eslint/no-explicit-any': 'error',
      // Silent failure is the one thing this application must never do.
      'no-empty': ['error', { allowEmptyCatch: false }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    // Floating-point arithmetic on money is the defect this codebase exists to
    // avoid, so make the mistake hard to commit by accident.
    files: ['packages/domain/**/*.ts', 'packages/db/**/*.ts', 'apps/api/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: 'Use parseDecimal from @journal/domain for money.' },
      ],
    },
  },

  {
    // Tests assert on loosely-typed JSON bodies and console output is useful there.
    files: ['**/*.test.ts', '**/*.test.tsx', '**/seed.ts', '**/scripts/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
);
