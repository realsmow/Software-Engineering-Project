// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Generated code is not ours to lint. `src/generated/trpc/server.ts` is
    // rewritten by `npm run trpc:generate` and the Prisma client by
    // `prisma generate`, so every complaint here is unfixable and drowns the
    // real ones: `npm run lint` reported 157 errors, all of them from one
    // generated file, which is how an actual error goes unnoticed.
    ignores: ['eslint.config.mjs', 'src/generated/**', 'dist/**', 'dist-tools/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // A leading underscore is the standard "deliberately unused" marker.
      // Needed for procedures that take a typed input but cannot act on it
      // yet (see the notImplemented() stubs in admin.service.ts).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
);
