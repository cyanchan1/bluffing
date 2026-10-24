import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts'],
    reporters: ['default', 'junit'],
    outputFile: { junit: 'reports/unit.xml' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      // The VM-isolated store suite runs separately; measure these UI boundaries here.
      include: ['src/presentation.ts', 'src/Modal.tsx', 'src/Leaderboards.tsx', 'src/GameFeedback.tsx'],
      thresholds: { lines: 80, statements: 80, functions: 75, branches: 70 },
    },
  },
})
