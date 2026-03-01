export interface StackNames {}

export type StackName = keyof StackNames extends never
  ? string
  : Extract<keyof StackNames, string> | (string & {});

export interface StackStore {
  push(stack: StackName, content: string): void;
  pushOnce(stack: StackName, key: string, content: string): void;
  get(stack: StackName): string;
  has(stack: StackName): boolean;
}

interface StackEntry {
  items: string[];
  once: Set<string>;
  joined: string | null;
}

export function createStackStore(): StackStore {
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

const STACK_PLACEHOLDER = /<!--@stack\(([^)]+)\)-->/g;

export function renderStacks(html: string, store: StackStore): string {
  return html.replace(STACK_PLACEHOLDER, (_, name) => store.get(name));
}

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

export async function renderStacksResponse(
  response: Response,
  store: StackStore,
): Promise<Response> {
  if (NULL_BODY_STATUSES.has(response.status)) return response;
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

