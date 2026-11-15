import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // `const { omitted: _omitted, ...rest } = obj` is the intended way to drop keys.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // eslint-plugin-react-hooks 7 added these checks. The pages fetch with useEffect + setState
      // (see tickers/[symbol]/page.tsx, ControlShell.tsx); keep them visible as warnings until
      // that data fetching moves to TanStack Query, then raise them back to errors.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts']),
]);
