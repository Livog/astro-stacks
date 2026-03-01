interface StackEntry {
  items: string[];
  once: Set<string>;
  joined: string | null;
}

export function createStackStore() {
  const stacks: Record<string, StackEntry> = Object.create(null);

  function ensure(stack: string): StackEntry {
    return (stacks[stack] ??= { items: [], once: new Set(), joined: null });
  }

  return {
    push(stack: string, content: string) {
      const s = ensure(stack);
      s.items.push(content);
      s.joined = null;
    },

    pushOnce(stack: string, key: string, content: string) {
      const s = ensure(stack);
      if (s.once.has(key)) return;
      s.once.add(key);
      s.items.push(content);
      s.joined = null;
    },

    get(stack: string): string {
      const s = stacks[stack];
      if (!s) return "";
      return (s.joined ??= s.items.join("\n"));
    },

    has(stack: string): boolean {
      const s = stacks[stack];
      return !!s && s.items.length > 0;
    },
  };
}

export type StackStore = ReturnType<typeof createStackStore>;

const STACK_PLACEHOLDER = /<!--@stack\(([^)]+)\)-->/g;

export function renderStacks(html: string, store: StackStore): string {
  return html.replace(STACK_PLACEHOLDER, (_, name) => store.get(name));
}

export async function renderStacksResponse(
  response: Response,
  store: StackStore,
): Promise<Response> {
  const type = response.headers.get("content-type");
  if (!type?.includes("text/html")) return response;

  const html = await response.text();
  if (!STACK_PLACEHOLDER.test(html)) {
    STACK_PLACEHOLDER.lastIndex = 0;
    return new Response(html, {
      status: response.status,
      headers: response.headers,
    });
  }
  STACK_PLACEHOLDER.lastIndex = 0;

  return new Response(renderStacks(html, store), {
    status: response.status,
    headers: response.headers,
  });
}

