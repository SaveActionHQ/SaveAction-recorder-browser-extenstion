// vite.config.ts
import { defineConfig } from "file:///C:/Users/zozaz/Documents/Downloads/SaveAction-recorder-browser-extenstion/node_modules/vite/dist/node/index.js";
import { resolve } from "path";
import webExtension from "file:///C:/Users/zozaz/Documents/Downloads/SaveAction-recorder-browser-extenstion/node_modules/vite-plugin-web-extension/dist/index.js";
var __vite_injected_original_dirname = "C:\\Users\\zozaz\\Documents\\Downloads\\SaveAction-recorder-browser-extenstion";
var vite_config_default = defineConfig(({ mode }) => {
  return {
    root: "src",
    plugins: [
      webExtension({
        manifest: "manifest.json",
        watchFilePaths: ["manifest.json"],
        browser: mode === "firefox" ? "firefox" : "chrome",
        additionalInputs: [
          "background/index.ts",
          "content/index.ts"
        ],
        scriptViteConfig: {
          build: {
            rollupOptions: {
              output: {
                entryFileNames: (chunkInfo) => {
                  const facadeModuleId = chunkInfo.facadeModuleId;
                  if (facadeModuleId) {
                    const relativePath = facadeModuleId.replace(/.*\/src\//, "");
                    return relativePath.replace(/\.ts$/, ".js");
                  }
                  return "[name].js";
                }
              }
            }
          }
        }
      })
    ],
    resolve: {
      alias: {
        "@": resolve(__vite_injected_original_dirname, "./src"),
        "@/types": resolve(__vite_injected_original_dirname, "./src/types"),
        "@/utils": resolve(__vite_injected_original_dirname, "./src/utils"),
        "@/content": resolve(__vite_injected_original_dirname, "./src/content"),
        "@/background": resolve(__vite_injected_original_dirname, "./src/background"),
        "@/popup": resolve(__vite_injected_original_dirname, "./src/popup")
      }
    },
    build: {
      outDir: resolve(__vite_injected_original_dirname, `dist/${mode || "chrome"}`),
      emptyOutDir: true,
      copyPublicDir: false,
      rollupOptions: {
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "[name].js",
          assetFileNames: (assetInfo) => {
            if (assetInfo.name && /\.(png|jpe?g|svg|gif|ico)$/i.test(assetInfo.name)) {
              return "icons/[name][extname]";
            }
            return "[name].[ext]";
          }
        }
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFx6b3phelxcXFxEb2N1bWVudHNcXFxcRG93bmxvYWRzXFxcXFNhdmVBY3Rpb24tcmVjb3JkZXItYnJvd3Nlci1leHRlbnN0aW9uXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFx6b3phelxcXFxEb2N1bWVudHNcXFxcRG93bmxvYWRzXFxcXFNhdmVBY3Rpb24tcmVjb3JkZXItYnJvd3Nlci1leHRlbnN0aW9uXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy96b3phei9Eb2N1bWVudHMvRG93bmxvYWRzL1NhdmVBY3Rpb24tcmVjb3JkZXItYnJvd3Nlci1leHRlbnN0aW9uL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICdwYXRoJztcclxuaW1wb3J0IHdlYkV4dGVuc2lvbiBmcm9tICd2aXRlLXBsdWdpbi13ZWItZXh0ZW5zaW9uJztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoeyBtb2RlIH0pID0+IHtcclxuICByZXR1cm4ge1xyXG4gICAgcm9vdDogJ3NyYycsXHJcbiAgICBwbHVnaW5zOiBbXHJcbiAgICAgIHdlYkV4dGVuc2lvbih7XHJcbiAgICAgICAgbWFuaWZlc3Q6ICdtYW5pZmVzdC5qc29uJyxcclxuICAgICAgICB3YXRjaEZpbGVQYXRoczogWydtYW5pZmVzdC5qc29uJ10sXHJcbiAgICAgICAgYnJvd3NlcjogbW9kZSA9PT0gJ2ZpcmVmb3gnID8gJ2ZpcmVmb3gnIDogJ2Nocm9tZScsXHJcbiAgICAgICAgYWRkaXRpb25hbElucHV0czogW1xyXG4gICAgICAgICAgJ2JhY2tncm91bmQvaW5kZXgudHMnLFxyXG4gICAgICAgICAgJ2NvbnRlbnQvaW5kZXgudHMnLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgc2NyaXB0Vml0ZUNvbmZpZzoge1xyXG4gICAgICAgICAgYnVpbGQ6IHtcclxuICAgICAgICAgICAgcm9sbHVwT3B0aW9uczoge1xyXG4gICAgICAgICAgICAgIG91dHB1dDoge1xyXG4gICAgICAgICAgICAgICAgZW50cnlGaWxlTmFtZXM6IChjaHVua0luZm8pID0+IHtcclxuICAgICAgICAgICAgICAgICAgY29uc3QgZmFjYWRlTW9kdWxlSWQgPSBjaHVua0luZm8uZmFjYWRlTW9kdWxlSWQ7XHJcbiAgICAgICAgICAgICAgICAgIGlmIChmYWNhZGVNb2R1bGVJZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlbGF0aXZlUGF0aCA9IGZhY2FkZU1vZHVsZUlkLnJlcGxhY2UoLy4qXFwvc3JjXFwvLywgJycpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZWxhdGl2ZVBhdGgucmVwbGFjZSgvXFwudHMkLywgJy5qcycpO1xyXG4gICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgIHJldHVybiAnW25hbWVdLmpzJztcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgfSksXHJcbiAgICBdLFxyXG4gICAgcmVzb2x2ZToge1xyXG4gICAgICBhbGlhczoge1xyXG4gICAgICAgICdAJzogcmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYycpLFxyXG4gICAgICAgICdAL3R5cGVzJzogcmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYy90eXBlcycpLFxyXG4gICAgICAgICdAL3V0aWxzJzogcmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYy91dGlscycpLFxyXG4gICAgICAgICdAL2NvbnRlbnQnOiByZXNvbHZlKF9fZGlybmFtZSwgJy4vc3JjL2NvbnRlbnQnKSxcclxuICAgICAgICAnQC9iYWNrZ3JvdW5kJzogcmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYy9iYWNrZ3JvdW5kJyksXHJcbiAgICAgICAgJ0AvcG9wdXAnOiByZXNvbHZlKF9fZGlybmFtZSwgJy4vc3JjL3BvcHVwJyksXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gICAgYnVpbGQ6IHtcclxuICAgICAgb3V0RGlyOiByZXNvbHZlKF9fZGlybmFtZSwgYGRpc3QvJHttb2RlIHx8ICdjaHJvbWUnfWApLFxyXG4gICAgICBlbXB0eU91dERpcjogdHJ1ZSxcclxuICAgICAgY29weVB1YmxpY0RpcjogZmFsc2UsXHJcbiAgICAgIHJvbGx1cE9wdGlvbnM6IHtcclxuICAgICAgICBvdXRwdXQ6IHtcclxuICAgICAgICAgIGVudHJ5RmlsZU5hbWVzOiAnW25hbWVdLmpzJyxcclxuICAgICAgICAgIGNodW5rRmlsZU5hbWVzOiAnW25hbWVdLmpzJyxcclxuICAgICAgICAgIGFzc2V0RmlsZU5hbWVzOiAoYXNzZXRJbmZvKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChhc3NldEluZm8ubmFtZSAmJiAvXFwuKHBuZ3xqcGU/Z3xzdmd8Z2lmfGljbykkL2kudGVzdChhc3NldEluZm8ubmFtZSkpIHtcclxuICAgICAgICAgICAgICByZXR1cm4gJ2ljb25zL1tuYW1lXVtleHRuYW1lXSc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuICdbbmFtZV0uW2V4dF0nO1xyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICB9O1xyXG59KTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUF5WixTQUFTLG9CQUFvQjtBQUN0YixTQUFTLGVBQWU7QUFDeEIsT0FBTyxrQkFBa0I7QUFGekIsSUFBTSxtQ0FBbUM7QUFJekMsSUFBTyxzQkFBUSxhQUFhLENBQUMsRUFBRSxLQUFLLE1BQU07QUFDeEMsU0FBTztBQUFBLElBQ0wsTUFBTTtBQUFBLElBQ04sU0FBUztBQUFBLE1BQ1AsYUFBYTtBQUFBLFFBQ1gsVUFBVTtBQUFBLFFBQ1YsZ0JBQWdCLENBQUMsZUFBZTtBQUFBLFFBQ2hDLFNBQVMsU0FBUyxZQUFZLFlBQVk7QUFBQSxRQUMxQyxrQkFBa0I7QUFBQSxVQUNoQjtBQUFBLFVBQ0E7QUFBQSxRQUNGO0FBQUEsUUFDQSxrQkFBa0I7QUFBQSxVQUNoQixPQUFPO0FBQUEsWUFDTCxlQUFlO0FBQUEsY0FDYixRQUFRO0FBQUEsZ0JBQ04sZ0JBQWdCLENBQUMsY0FBYztBQUM3Qix3QkFBTSxpQkFBaUIsVUFBVTtBQUNqQyxzQkFBSSxnQkFBZ0I7QUFDbEIsMEJBQU0sZUFBZSxlQUFlLFFBQVEsYUFBYSxFQUFFO0FBQzNELDJCQUFPLGFBQWEsUUFBUSxTQUFTLEtBQUs7QUFBQSxrQkFDNUM7QUFDQSx5QkFBTztBQUFBLGdCQUNUO0FBQUEsY0FDRjtBQUFBLFlBQ0Y7QUFBQSxVQUNGO0FBQUEsUUFDRjtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0g7QUFBQSxJQUNBLFNBQVM7QUFBQSxNQUNQLE9BQU87QUFBQSxRQUNMLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsUUFDL0IsV0FBVyxRQUFRLGtDQUFXLGFBQWE7QUFBQSxRQUMzQyxXQUFXLFFBQVEsa0NBQVcsYUFBYTtBQUFBLFFBQzNDLGFBQWEsUUFBUSxrQ0FBVyxlQUFlO0FBQUEsUUFDL0MsZ0JBQWdCLFFBQVEsa0NBQVcsa0JBQWtCO0FBQUEsUUFDckQsV0FBVyxRQUFRLGtDQUFXLGFBQWE7QUFBQSxNQUM3QztBQUFBLElBQ0Y7QUFBQSxJQUNBLE9BQU87QUFBQSxNQUNMLFFBQVEsUUFBUSxrQ0FBVyxRQUFRLFFBQVEsUUFBUSxFQUFFO0FBQUEsTUFDckQsYUFBYTtBQUFBLE1BQ2IsZUFBZTtBQUFBLE1BQ2YsZUFBZTtBQUFBLFFBQ2IsUUFBUTtBQUFBLFVBQ04sZ0JBQWdCO0FBQUEsVUFDaEIsZ0JBQWdCO0FBQUEsVUFDaEIsZ0JBQWdCLENBQUMsY0FBYztBQUM3QixnQkFBSSxVQUFVLFFBQVEsOEJBQThCLEtBQUssVUFBVSxJQUFJLEdBQUc7QUFDeEUscUJBQU87QUFBQSxZQUNUO0FBQ0EsbUJBQU87QUFBQSxVQUNUO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
