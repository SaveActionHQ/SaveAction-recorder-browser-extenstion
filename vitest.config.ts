import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        '**/*.config.ts',
        '**/*.d.ts',
        'src/manifest.json',
        'src/background/index.ts', // Integration heavy, tested via E2E
        'src/content/index.ts', // Entry point, minimal logic
        'src/popup/popup.ts', // UI component, requires E2E tests
        'src/content/recording-indicator.ts', // DOM manipulation, requires E2E tests
        'src/utils/content-signature.ts', // Helper utility for content analysis
        'src/utils/element-state.ts', // DOM state helper, requires E2E
        'src/utils/modal-tracker.ts', // DOM tracking helper, requires E2E
        'src/utils/toast-notification.ts', // UI notification helper, requires E2E
      ],
      thresholds: {
        lines: 78,
        functions: 86,
        branches: 72,
        statements: 78,
      },
    },
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/types': resolve(__dirname, './src/types'),
      '@/utils': resolve(__dirname, './src/utils'),
      '@/content': resolve(__dirname, './src/content'),
      '@/background': resolve(__dirname, './src/background'),
      '@/popup': resolve(__dirname, './src/popup'),
    },
  },
});
