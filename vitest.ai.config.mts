import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/lib/pipeline/ai/adapters/real-adapters.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, '.') },
  },
});
