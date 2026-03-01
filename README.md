# astro-stacks

A Laravel Blade-style `@stack` / `@push` / `@pushOnce` system for Astro SSR. Lets deeply nested components push content (scripts, styles, SVG symbols, preconnects, meta tags) to named stacks, which are collected and emitted at designated output points in your layout.

## Streaming and Buffering

> **Important tradeoff:** When your layout uses `<!--@stack(name)-->` placeholders (for injecting content into positions _before_ `<slot />`), the middleware **buffers the full HTML response** before sending it to the client. This disables streaming for that request.
>
> If a response contains no placeholders, it passes through untouched — no buffering, no overhead.
>
> In practice, this tradeoff is acceptable for most Astro SSR apps: Astro's island architecture means interactivity comes from client-side hydration, not from streaming the initial HTML faster. The `@astrojs/cloudflare` adapter has historically disabled streaming on Cloudflare Pages anyway.
>
> **If you only use `StackOutput` (placed after `<slot />`), streaming is fully preserved.** Buffering only kicks in when the HTML contains `<!--@stack(...)-->` comment placeholders.

## The Problem

In Astro SSR, the HTML stream is generated top-to-bottom. A component's frontmatter executes at the moment the renderer reaches that component in the output. This means a `<slot />` and all of its children render **before** any sibling that comes after the slot in the layout.

This creates a problem: how does a deeply nested child component contribute a `<link rel="preconnect">`, a `<script>`, or structured data to `<head>` — which has already been emitted before the child even runs?

`astro-stacks` solves this with two complementary mechanisms:

- **`StackOutput`** — Reads a stack and emits its content inline. Works for output points that come **after** `<slot />` (e.g. end of `<body>`). No buffering needed.
- **`<!--@stack(name)-->`** — A placeholder comment that `renderStacksResponse` replaces with the stack content after the full page has rendered. Works for **any** position, including `<head>`. Requires buffering.

## Installation

```bash
bun add astro-stacks
```

## Setup

### 1. Middleware

Create middleware that initializes the stack store and post-processes the response:

```ts
// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { createStackStore, renderStacksResponse } from "astro-stacks";

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.stacks = createStackStore();
  const response = await next();

  // Replace <!--@stack(name)--> placeholders in the rendered HTML.
  // Non-HTML responses and HTML without placeholders pass through untouched.
  return renderStacksResponse(response, context.locals.stacks);
});
```

Or use the `stacksMiddleware()` shorthand with `sequence`:

```ts
import { sequence } from "astro:middleware";
import { stacksMiddleware } from "astro-stacks";

export const onRequest = sequence(stacksMiddleware(), otherMiddleware);
```

### 2. Type Declarations

```ts
// src/env.d.ts
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    stacks: import("astro-stacks").StackStore;
  }
}
```

### 3. Layout

Use `<!--@stack(name)-->` placeholders for positions before `<slot />`, and `StackOutput` for positions after it:

```astro
---
import StackOutput from "astro-stacks/stack-output.astro";
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>My Site</title>
    <!--@stack(head)-->
  </head>
  <body>
    <slot />
    <StackOutput name="beforeBodyEnd" />
  </body>
</html>
```

## Two Output Modes

### `StackOutput` — After Slot (streaming preserved)

For stacks that appear **after** `<slot />` in the layout. Content is rendered inline during SSR — streaming works normally.

```astro
<slot />
<StackOutput name="beforeBodyEnd" />
```

### `<!--@stack(name)-->` — Anywhere (buffered)

For stacks at **any** position in the document. The placeholder comment is replaced by the middleware after the full page has rendered. **This buffers the response** (see [Streaming and Buffering](#streaming-and-buffering)).

```html
<head>
  <!--@stack(head)-->
</head>
```

The same placeholder can appear in multiple places — the stack content is not consumed, so every occurrence gets the full content.

## API Reference

### `stacksMiddleware()`

Returns an Astro middleware handler that:

1. Creates a fresh `StackStore` on `context.locals.stacks`
2. Calls `next()` to render the page
3. If the HTML response contains `<!--@stack(...)-->` placeholders, buffers and replaces them
4. Returns the response (untouched if no placeholders found)

```ts
import { stacksMiddleware } from "astro-stacks";
export const onRequest = stacksMiddleware();
```

### `createStackStore()`

Creates a new stack store instance. You only need this directly if you're not using `stacksMiddleware()`.

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

Replaces all `<!--@stack(name)-->` placeholders in a string. Low-level — prefer `renderStacksResponse` or `stacksMiddleware`.

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

### `StackOutput` Component

Reads a named stack and emits its collected content as raw HTML. Place **after** `<slot />`.

```astro
---
import StackOutput from "astro-stacks/stack-output.astro";
---

<StackOutput name="beforeBodyEnd" />
```

| Prop | Type | Description |
|------|------|-------------|
| `name` | `string` | The stack to read and emit |

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

The preconnect appears in `<head>` via placeholder replacement. The script appears at end of `<body>` via `StackOutput`. Both work regardless of how deeply the component is nested.

## Exports

| Export Path | Contents |
|---|---|
| `astro-stacks` | `stacksMiddleware`, `createStackStore`, `renderStacks`, `renderStacksResponse`, `StackStore` type |
| `astro-stacks/stack-output.astro` | `StackOutput` component |
