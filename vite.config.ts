import { defineConfig } from 'vite';
import { resolve } from 'path';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig(({ mode }) => {
  return {
    root: 'src',
    plugins: [
      webExtension({
        manifest: 'manifest.json',
        watchFilePaths: ['manifest.json'],
        browser: mode === 'firefox' ? 'firefox' : 'chrome',
        additionalInputs: [
          'background/index.ts',
          'content/index.ts',
        ],
        scriptViteConfig: {
          build: {
            rollupOptions: {
              output: {
                entryFileNames: (chunkInfo) => {
                  const facadeModuleId = chunkInfo.facadeModuleId;
                  if (facadeModuleId) {
                    const relativePath = facadeModuleId.replace(/.*\/src\//, '');
                    return relativePath.replace(/\.ts$/, '.js');
                  }
                  return '[name].js';
                },
              },
            },
          },
        },
      }),
    ],
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
    build: {
      outDir: resolve(__dirname, `dist/${mode || 'chrome'}`),
      emptyOutDir: true,
      copyPublicDir: false,
      rollupOptions: {
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name && /\.(png|jpe?g|svg|gif|ico)$/i.test(assetInfo.name)) {
              return 'icons/[name][extname]';
            }
            return '[name].[ext]';
          },
        },
      },
    },
  };
});
