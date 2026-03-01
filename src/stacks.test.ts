import { describe, it, expect } from "vitest";
import { createStackStore, renderStacks, renderStacksResponse } from "./stacks";

describe("createStackStore", () => {
  describe("push", () => {
    it("adds content to a named stack", () => {
      const store = createStackStore();
      store.push("head", "<link rel='stylesheet' href='/a.css'>");
      expect(store.get("head")).toBe("<link rel='stylesheet' href='/a.css'>");
    });

    it("appends multiple items joined with newlines", () => {
      const store = createStackStore();
      store.push("head", "<meta name='a'>");
      store.push("head", "<meta name='b'>");
      expect(store.get("head")).toBe("<meta name='a'>\n<meta name='b'>");
    });

    it("keeps stacks independent", () => {
      const store = createStackStore();
      store.push("head", "<meta>");
      store.push("body", "<script>");
      expect(store.get("head")).toBe("<meta>");
      expect(store.get("body")).toBe("<script>");
    });
  });

  describe("pushOnce", () => {
    it("adds content on first call", () => {
      const store = createStackStore();
      store.pushOnce("icons", "search", "<symbol id='search'/>");
      expect(store.get("icons")).toBe("<symbol id='search'/>");
    });

    it("deduplicates by key", () => {
      const store = createStackStore();
      store.pushOnce("icons", "search", "<symbol id='search'/>");
      store.pushOnce("icons", "search", "<symbol id='search'/>");
      store.pushOnce("icons", "search", "<symbol id='search'/>");
      expect(store.get("icons")).toBe("<symbol id='search'/>");
    });

    it("allows different keys", () => {
      const store = createStackStore();
      store.pushOnce("icons", "search", "<symbol id='search'/>");
      store.pushOnce("icons", "close", "<symbol id='close'/>");
      expect(store.get("icons")).toBe(
        "<symbol id='search'/>\n<symbol id='close'/>",
      );
    });

    it("can mix push and pushOnce on the same stack", () => {
      const store = createStackStore();
      store.push("body", "<script src='a.js'></script>");
      store.pushOnce("body", "dialog", "<script src='dialog.js'></script>");
      store.pushOnce("body", "dialog", "<script src='dialog.js'></script>");
      expect(store.get("body")).toBe(
        "<script src='a.js'></script>\n<script src='dialog.js'></script>",
      );
    });
  });

  describe("get", () => {
    it("returns empty string for unknown stack", () => {
      const store = createStackStore();
      expect(store.get("nonexistent")).toBe("");
    });

    it("caches joined result", () => {
      const store = createStackStore();
      store.push("x", "a");
      store.push("x", "b");
      const first = store.get("x");
      const second = store.get("x");
      expect(first).toBe(second);
    });

    it("invalidates cache after new push", () => {
      const store = createStackStore();
      store.push("x", "a");
      expect(store.get("x")).toBe("a");
      store.push("x", "b");
      expect(store.get("x")).toBe("a\nb");
    });
  });

  describe("has", () => {
    it("returns false for empty/unknown stack", () => {
      const store = createStackStore();
      expect(store.has("nothing")).toBe(false);
    });

    it("returns true after push", () => {
      const store = createStackStore();
      store.push("head", "content");
      expect(store.has("head")).toBe(true);
    });

    it("returns true after pushOnce", () => {
      const store = createStackStore();
      store.pushOnce("icons", "x", "content");
      expect(store.has("icons")).toBe(true);
    });
  });
});

describe("renderStacks", () => {
  it("replaces a placeholder with stack content", () => {
    const store = createStackStore();
    store.push("sidebar", "<nav>sidebar links</nav>");

    const raw = `<div class="layout"><!--@stack(sidebar)--><main>content</main></div>`;
    const html = renderStacks(raw, store);

    expect(html).toContain("<nav>sidebar links</nav>");
    expect(html).not.toContain("<!--@stack(sidebar)-->");
  });

  it("replaces multiple different placeholders", () => {
    const store = createStackStore();
    store.push("head", '<link rel="preconnect" href="https://cdn.example.com">');
    store.push("toolbar", "<button>Save</button>");

    const raw = `<html>
<head><!--@stack(head)--></head>
<body>
<div class="toolbar"><!--@stack(toolbar)--></div>
<main>content</main>
</body>
</html>`;

    const html = renderStacks(raw, store);

    expect(html).toContain('<link rel="preconnect" href="https://cdn.example.com">');
    expect(html).toContain("<button>Save</button>");
    expect(html).not.toContain("<!--@stack(head)-->");
    expect(html).not.toContain("<!--@stack(toolbar)-->");
  });

  it("removes placeholder when stack is empty", () => {
    const store = createStackStore();

    const raw = `<head><title>Test</title><!--@stack(head)--></head>`;
    const html = renderStacks(raw, store);

    expect(html).toBe("<head><title>Test</title></head>");
  });

  it("leaves HTML unchanged when there are no placeholders", () => {
    const store = createStackStore();
    store.push("head", "something");

    const raw = `<html><head><title>Test</title></head><body>content</body></html>`;
    const html = renderStacks(raw, store);

    expect(html).toBe(raw);
  });

  it("handles pushOnce deduplication", () => {
    const store = createStackStore();
    store.pushOnce("head", "cdn", '<link rel="preconnect" href="https://cdn.example.com">');
    store.pushOnce("head", "cdn", '<link rel="preconnect" href="https://cdn.example.com">');
    store.pushOnce("head", "cdn", '<link rel="preconnect" href="https://cdn.example.com">');

    const raw = `<head><!--@stack(head)--></head>`;
    const html = renderStacks(raw, store);

    const matches = html.match(/<link rel="preconnect"/g);
    expect(matches).toHaveLength(1);
  });

  it("works for a stack placed before slot content", () => {
    const store = createStackStore();
    store.push("head", '<link rel="preconnect" href="https://api.example.com">');
    store.push("head", '<script type="application/ld+json">{"@type":"WebPage"}</script>');

    const raw = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>My Page</title>
<!--@stack(head)-->
</head>
<body>
<div>page content from slot</div>
</body>
</html>`;

    const html = renderStacks(raw, store);

    const headSection = html.slice(html.indexOf("<head>"), html.indexOf("</head>") + 7);
    expect(headSection).toContain('<meta charset="utf-8">');
    expect(headSection).toContain("<title>My Page</title>");
    expect(headSection).toContain('<link rel="preconnect" href="https://api.example.com">');
    expect(headSection).toContain('<script type="application/ld+json">{"@type":"WebPage"}</script>');
  });

  it("works alongside inline StackOutput content", () => {
    const store = createStackStore();
    store.push("head", '<link rel="preload" href="/font.woff2" as="font">');
    store.pushOnce("beforeBodyEnd", "accordion-js", "<script>/* accordion */</script>");

    const raw = `<!doctype html>
<html>
<head>
<title>Test</title>
<!--@stack(head)-->
</head>
<body>
<div>content</div>
${store.get("beforeBodyEnd")}
</body>
</html>`;

    const html = renderStacks(raw, store);

    const headSection = html.slice(html.indexOf("<head>"), html.indexOf("</head>") + 7);
    expect(headSection).toContain('<link rel="preload" href="/font.woff2" as="font">');
    expect(headSection).not.toContain("accordion");

    const bodySection = html.slice(html.indexOf("<body>"), html.indexOf("</body>") + 7);
    expect(bodySection).toContain("<script>/* accordion */</script>");
  });

  it("handles arbitrary stack names", () => {
    const store = createStackStore();
    store.push("my-custom-stack", "<div>custom content</div>");
    store.push("another_one", "<span>more stuff</span>");

    const raw = `<header><!--@stack(my-custom-stack)--></header><footer><!--@stack(another_one)--></footer>`;
    const html = renderStacks(raw, store);

    expect(html).toContain("<header><div>custom content</div></header>");
    expect(html).toContain("<footer><span>more stuff</span></footer>");
  });

  it("renders the same stack in multiple places", () => {
    const store = createStackStore();
    store.push("alerts", "<div class='alert'>Warning!</div>");

    const raw = `<header><!--@stack(alerts)--></header><main>content</main><footer><!--@stack(alerts)--></footer>`;
    const html = renderStacks(raw, store);

    expect(html).toContain("<header><div class='alert'>Warning!</div></header>");
    expect(html).toContain("<footer><div class='alert'>Warning!</div></footer>");
  });
});

describe("renderStacksResponse", () => {
  function htmlResponse(html: string): Response {
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  it("replaces placeholders in an HTML response", async () => {
    const store = createStackStore();
    store.push("head", '<link rel="preconnect" href="https://cdn.example.com">');

    const raw = `<html><head><!--@stack(head)--></head><body>content</body></html>`;
    const response = await renderStacksResponse(htmlResponse(raw), store);
    const html = await response.text();

    expect(html).toContain('<link rel="preconnect" href="https://cdn.example.com">');
    expect(html).not.toContain("<!--@stack(head)-->");
  });

  it("passes non-HTML responses through unchanged", async () => {
    const store = createStackStore();
    store.push("head", "injected");

    const jsonResponse = new Response('{"key":"value"}', {
      headers: { "content-type": "application/json" },
    });

    const response = await renderStacksResponse(jsonResponse, store);
    const text = await response.text();
    expect(text).toBe('{"key":"value"}');
  });

  it("passes HTML through unchanged when no placeholders exist", async () => {
    const store = createStackStore();

    const raw = `<html><head><title>Test</title></head><body>content</body></html>`;
    const response = await renderStacksResponse(htmlResponse(raw), store);
    const html = await response.text();

    expect(html).toBe(raw);
  });

  it("preserves response status", async () => {
    const store = createStackStore();
    store.push("head", "<meta>");

    const raw = `<html><head><!--@stack(head)--></head><body></body></html>`;
    const response = await renderStacksResponse(
      new Response(raw, {
        status: 404,
        headers: { "content-type": "text/html" },
      }),
      store,
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("<meta>");
  });

  it("preserves response headers", async () => {
    const store = createStackStore();

    const raw = `<html><head><!--@stack(head)--></head><body></body></html>`;
    const response = await renderStacksResponse(
      new Response(raw, {
        headers: {
          "content-type": "text/html",
          "x-custom": "preserved",
        },
      }),
      store,
    );

    expect(response.headers.get("x-custom")).toBe("preserved");
  });

  it("handles streamed responses", async () => {
    const store = createStackStore();
    store.push("head", "<meta name='injected'>");

    const chunks = [
      "<html><head><!--@sta",
      "ck(head)--></head><b",
      "ody>content</body></html>",
    ];

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    const response = await renderStacksResponse(
      new Response(stream, {
        headers: { "content-type": "text/html" },
      }),
      store,
    );

    const html = await response.text();
    expect(html).toContain("<meta name='injected'>");
    expect(html).not.toContain("<!--@stack(head)-->");
  });
});
