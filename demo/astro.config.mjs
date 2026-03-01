// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";
import astroStacks from "astro-stacks";
import astroIconSprite from "astro-icon-sprite";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  integrations: [
    astroStacks(),
    astroIconSprite({
      local: "src/icons",
      resolve: { lu: "lucide-static/icons" },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
