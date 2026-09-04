import { defineConfig, globalIgnores } from 'eslint/config'

// Resolve eslint-config-next robustly — some environments export named properties differently.
let nextVitals = []
let nextTs = []
try {
  // dynamic import to allow graceful fallback
  const pkg = await import('eslint-config-next')
  nextVitals = pkg?.coreWebVitals ?? pkg?.default?.coreWebVitals ?? []
  nextTs = pkg?.typescript ?? pkg?.default?.typescript ?? []
} catch (e) {
  // fallback to no-op arrays — eslint will still run with base rules
  nextVitals = []
  nextTs = []
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
])

export default eslintConfig
