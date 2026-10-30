import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {ignores: ['dist/', 'node_modules/']},
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The public API is deliberately loosely typed (services, hooks and
      // validators are user-supplied); tighten incrementally.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_'},
      ],
    },
  },
  {
    // Plain Node fixture apps used by the integration tests.
    files: ['test/fixtures/**/*.{cjs,mjs}'],
    languageOptions: {
      globals: {process: 'readonly', Buffer: 'readonly'},
    },
  },
  {
    files: ['test/fixtures/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {require: 'readonly', module: 'writable'},
    },
    rules: {'@typescript-eslint/no-require-imports': 'off'},
  }
);
