/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    stacks: import("astro-stacks").StackStore;
  }
}

declare module "virtual:icon-registry" {
  const registry: Record<string, { spriteId: string; viewBox: string; symbol: string }>;
  export default registry;
}
