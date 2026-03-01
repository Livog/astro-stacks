import type { AstroIntegration } from "astro";

export default function astroStacks(): AstroIntegration {
  return {
    name: "astro-stacks",
    hooks: {
      "astro:config:setup": ({ addMiddleware }) => {
        addMiddleware({
          entrypoint: "astro-stacks/middleware",
          order: "pre",
        });
      },
    },
  };
}
