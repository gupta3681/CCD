import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Each test gets its own temp dir; isolate to avoid cross-test pollution.
    isolate: true
  }
})
