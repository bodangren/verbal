import { defineConfig } from "vite";
import vinext from "vinext";
import { workspaceAliases } from "../../aliases.ts";

export default defineConfig({
  // vinext registers @vitejs/plugin-react itself; adding it here duplicates
  // React transforms and fails the build.
  plugins: [vinext()],
  resolve: {
    alias: workspaceAliases,
  },
});
