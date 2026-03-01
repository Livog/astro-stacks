# astro-stacks

A Laravel Blade-style `@stack` / `@push` / `@pushOnce` system for Astro SSR. Lets deeply nested components push content (scripts, styles, SVG symbols, preconnects, meta tags) to named stacks, which are collected and emitted at designated output points in your layout.

## Streaming and Buffering

> **Important tradeoff:** The middleware **buffers the full HTML response** to replace `<!--@stack(name)-->` placeholders. This disables streaming for that request.
>
> If a response contains no placeholders, it passes through untouched — no buffering, no overhead.
>
> In practice, this tradeoff is acceptable for most Astro SSR apps: Astro's island architecture means interactivity comes from client-side hydration, not from streaming the initial HTML faster.

## The Problem

In Astro SSR, the HTML stream is generated top-to-bottom. A component's frontmatter executes at the moment the renderer reaches that component in the output. This means a `<slot />` and all of its children render **before** any sibling that comes after the slot in the layout.

This creates a problem: how does a deeply nested child component contribute a `<link rel="preconnect">`, a `<script>`, or structured data to `<head>` — which has already been emitted before the child even runs?

`astro-stacks` solves this with a middleware that buffers the response and replaces `<!--@stack(name)-->` placeholder comments with the collected stack content after the full page has rendered. Use the `<Stack>` component to place these placeholders anywhere in your layout.

## Installation

```bash
bun add astro-stacks
```

## Setup

### Using the Astro Integration (recommended)

```bash
npx astro add astro-stacks
```

Or manually add to your Astro config:

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import astroStacks from "astro-stacks";

export default defineConfig({
  integrations: [astroStacks()],
});
```

### Typed Stack Names

Types are auto-injected by the integration — no manual `env.d.ts` needed. The integration scans your `.astro` files for `<Stack name="..." />` usage and generates typed stack names, giving you autocomplete on `push`, `pushOnce`, `get`, and `has`.

You can also declare additional stack names via the `stacks` config option:

```ts
export default defineConfig({
  integrations: [astroStacks({ stacks: ["head", "beforeBodyEnd"] })],
});
```

Other integrations (or your own code) can augment `StackNames` via declaration merging:

```ts
declare module "astro-stacks" {
  interface StackNames {
    "myCustomStack": true;
  }
}
```

### Layout

Use the `<Stack>` component to place output points in your layout:

```astro
---
import Stack from "astro-stacks/stack.astro";
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>My Site</title>
    <Stack name="head" />
  </head>
  <body>
    <slot />
    <Stack name="beforeBodyEnd" />
  </body>
</html>
```

## API Reference

### `createStackStore()`

Creates a new stack store instance. You only need this directly if you're building custom middleware.

```ts
import { createStackStore } from "astro-stacks";
const store = createStackStore();
```

### `.push(stack, content)`

Push a string of HTML content to a named stack.

```ts
Astro.locals.stacks.push("head", '<link rel="preconnect" href="https://cdn.example.com">');
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `stack` | `string` | The stack name |
| `content` | `string` | HTML string to append |

### `.pushOnce(stack, key, content)`

Push content only if the given key has not already been pushed to this stack.

```ts
Astro.locals.stacks.pushOnce(
  "beforeBodyEnd",
  "accordion-js",
  `<script>/* accordion behavior */</script>`,
);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `stack` | `string` | The stack name |
| `key` | `string` | Unique deduplication key |
| `content` | `string` | HTML string to append (skipped if key already seen) |

### `.get(stack)`

Returns all content pushed to the named stack, joined with newlines. Returns an empty string if the stack has no items. Does **not** consume the stack.

```ts
const html = store.get("head"); // string
```

### `.has(stack)`

Returns `true` if the named stack has any items.

```ts
if (store.has("beforeBodyEnd")) { /* ... */ }
```

### `renderStacks(html, store)`

Replaces all `<!--@stack(name)-->` placeholders in a string. Low-level — prefer the integration.

```ts
import { renderStacks } from "astro-stacks";
const finalHtml = renderStacks(rawHtml, store);
```

### `renderStacksResponse(response, store)`

Takes a `Response` and returns a new `Response` with placeholders replaced. Non-HTML responses pass through untouched. HTML without placeholders passes through untouched.

```ts
import { renderStacksResponse } from "astro-stacks";
const response = await renderStacksResponse(await next(), store);
```

### `Stack` Component

Emits a `<!--@stack(name)-->` placeholder that the middleware replaces with collected stack content. Works anywhere in your layout.

```astro
---
import Stack from "astro-stacks/stack.astro";
---

<Stack name="head" />
```

| Prop | Type | Description |
|------|------|-------------|
| `name` | `string` | The stack to output |

### `StackStore` Type

```ts
import type { StackStore } from "astro-stacks";
```

## Usage Example

A deeply nested component that pushes a preconnect to `<head>` and a script to `beforeBodyEnd`:

```astro
---
// src/components/VideoPlayer.astro
Astro.locals.stacks.push("head", '<link rel="preconnect" href="https://cdn.video.com">');

Astro.locals.stacks.pushOnce(
  "beforeBodyEnd",
  "video-player-js",
  `<script src="/video-player.js" defer></script>`,
);
---

<div data-video-player>
  <slot />
</div>
```

The preconnect appears in `<head>` and the script appears at end of `<body>`, both via `<Stack>` placeholder replacement. Both work regardless of how deeply the component is nested.

## Exports

| Export Path | Contents |
|---|---|
| `astro-stacks` | `createStackStore`, `renderStacks`, `renderStacksResponse`, `StackStore` / `StackNames` / `StackName` types, integration default export |
| `astro-stacks/stack.astro` | `Stack` component |
| `astro-stacks/middleware` | Middleware (auto-registered by integration) |
