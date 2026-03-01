import type { AstroIntegration } from "astro";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const INTEGRATION_NAME = "astro-stacks";

export interface AstroStacksOptions {
  stacks?: string[];
}

const STACK_NAME_RE =
  /<Stack\s[^>]*?name\s*=\s*(?:"([^"]+)"|'([^']+)'|\{(?:\s*"([^"]+)"\s*|\s*'([^']+)'\s*)\})[^>]*?\/?>/g;

export async function scanStackNames(srcDir: URL): Promise<Set<string>> {
  const names = new Set<string>();
  const root = fileURLToPath(srcDir);

  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(".astro")) {
        const content = await readFile(full, "utf-8");
        STACK_NAME_RE.lastIndex = 0;
        let match;
        while ((match = STACK_NAME_RE.exec(content))) {
          const name = match[1] ?? match[2] ?? match[3] ?? match[4];
          if (name) names.add(name);
        }
      }
    }
  }

  await walk(root);
  return names;
}

export function generateDts(names: Set<string>): string {
  let dts = `export {}

declare global {
  namespace App {
    interface Locals {
      stacks: import("astro-stacks").StackStore;
    }
  }
}`;

  if (names.size > 0) {
    const entries = [...names]
      .sort()
      .map((n) => `    ${JSON.stringify(n)}: true;`)
      .join("\n");
    dts += `\n\ndeclare module "astro-stacks" {
  interface StackNames {
${entries}
  }
}`;
  }

  return dts;
}

export default function astroStacks(
  options: AstroStacksOptions = {},
): AstroIntegration {
  let dtsPath: string | undefined;
  let configSrcDir: URL | undefined;
  let lastSerialized: string | undefined;

  return {
    name: INTEGRATION_NAME,
    hooks: {
      "astro:config:setup": ({ addMiddleware, updateConfig }) => {
        addMiddleware({
          entrypoint: "astro-stacks/middleware",
          order: "pre",
        });

        updateConfig({
          vite: {
            plugins: [
              {
                name: "astro-stacks-types",
                configureServer(server) {
                  if (!dtsPath || !configSrcDir) return;

                  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

                  const handler = (file: string) => {
                    if (!file.endsWith(".astro")) return;
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(async () => {
                      const names = await scanStackNames(configSrcDir!);
                      if (options.stacks) {
                        for (const s of options.stacks) names.add(s);
                      }
                      const serialized = [...names].sort().join(",");
                      if (serialized === lastSerialized) return;
                      lastSerialized = serialized;
                      await writeFile(dtsPath!, generateDts(names), "utf-8");
                      server.ws.send({ type: "full-reload" });
                    }, 200);
                  };

                  server.watcher.on("change", handler);
                  server.watcher.on("add", handler);
                  server.watcher.on("unlink", handler);
                },
              },
            ],
          },
        });
      },

      "astro:config:done": async ({ config, injectTypes }) => {
        configSrcDir = config.srcDir;
        const names = await scanStackNames(config.srcDir);
        if (options.stacks) {
          for (const s of options.stacks) names.add(s);
        }

        const result = injectTypes({
          filename: "types.d.ts",
          content: generateDts(names),
        });
        dtsPath = fileURLToPath(result);
        lastSerialized = [...names].sort().join(",");
      },
    },
  };
}
