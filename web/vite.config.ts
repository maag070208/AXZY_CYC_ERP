import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "path";
import pkg from "./package.json";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [tailwindcss(), react()],
  build: {
    modulePreload: false,
    target: "esnext",
    minify: false,
    cssCodeSplit: false,
  },
  resolve: {
    alias: {
      // El UI System publica `dist/layered.css` (todo en `@layer axzy-ui-system`)
      // para que las utilidades de Tailwind de sus componentes no pisen las de
      // la app. Se resuelve al checkout local mientras se publica la versión.
      // Se resuelve al checkout local del UI System mientras se publica la
      // versión con `dist/layered.css` (todo en `@layer axzy-ui-system`).
      "@axzydev/axzy_ui_system/layered.css": path.resolve(
        __dirname,
        "../../AXZY/AXZY_UI_SYSTEM/dist/layered.css"
      ),
      "@app": path.resolve(__dirname, "./src/app"),
      "@shared": path.resolve(__dirname, "./src/shared"),
      "@entities": path.resolve(__dirname, "./src/entities"),
      "@features": path.resolve(__dirname, "./src/features"),
      "@widgets": path.resolve(__dirname, "./src/widgets"),
      "@pages": path.resolve(__dirname, "./src/pages"),
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
  },
});
