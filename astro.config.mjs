import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import tailwind from "@astrojs/tailwind";
import node from "@astrojs/node";

export default defineConfig({
  site: "https://tableaukit.dev",
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [
    mdx(),
    tailwind({ applyBaseStyles: false }),
  ],
});
