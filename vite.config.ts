import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isWebBuild = mode === 'web';

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    define: {
      // Build-time constant for tree-shaking
      __IS_WEB_BUILD__: isWebBuild,
    },
    plugins: [
      react(),
      nodePolyfills({
        globals: {
          Buffer: true,
          global: true,
          process: true,
        }
      }),
      // Exclude Tauri dependencies in web builds
      isWebBuild && {
        name: 'exclude-tauri',
        resolveId(source: string) {
          if (source.includes('@tauri-apps')) {
            return '\0tauri-stub';
          }
          return null;
        },
        load(id: string) {
          if (id === '\0tauri-stub') {
            return 'export default {}; export const invoke = () => Promise.reject("Not available in web mode"); export const listen = () => Promise.resolve(() => {});';
          }
          return null;
        }
      },
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
