import { reactRouter } from "@react-router/dev/vite";
import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import netlifyPlugin from "@netlify/vite-plugin-react-router";

export default defineConfig({
  define: { 'process.env.ARCHIVE_RELEASE_REVISION': JSON.stringify(process.env.COMMIT_REF || process.env.GITHUB_SHA || 'local') },
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },
  plugins: [reactRouter(), tsconfigPaths(), netlifyPlugin()],
  optimizeDeps: {
    include: ["currency.js", "posthog-js/react"],
  },
  ssr: {
    noExternal: ['posthog-js', 'posthog-js/react']
  }
});
