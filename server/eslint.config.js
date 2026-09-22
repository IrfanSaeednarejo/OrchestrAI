import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**']
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  prettierConfig,
  {
    files: ['src/**/*.ts'],
    ignores: [
      'src/state/identity-update.ts',
      'src/state/identity-update.test.ts',
      'src/state/identity-update-boundary.test.ts',
      'src/agents/specialists/account-access/**',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/state/identity-update.js', '**/state/identity-update'],
          message: 'identity-update.js may only be imported by the Account Access specialist ' +
            '(src/agents/specialists/account-access/**). See decisions-and-principles: only ' +
            'Account Access may mutate identity.',
        }],
      }],
    },
  }
);
