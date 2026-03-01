import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { scanStackNames, generateDts } from "./integration";

describe("scanStackNames", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "astro-stacks-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("finds <Stack name=\"head\" /> in a single .astro file", async () => {
    await writeFile(
      join(tempDir, "Layout.astro"),
      '<html><head><Stack name="head" /></head></html>',
    );
    const names = await scanStackNames(pathToFileURL(tempDir + "/"));
    expect(names).toEqual(new Set(["head"]));
  });

  it("finds multiple names across multiple .astro files", async () => {
    await writeFile(
      join(tempDir, "Layout.astro"),
      '<Stack name="head" /><Stack name="body" />',
    );
    await mkdir(join(tempDir, "components"));
    await writeFile(
      join(tempDir, "components", "Footer.astro"),
      '<Stack name="footer" />',
    );
    const names = await scanStackNames(pathToFileURL(tempDir + "/"));
    expect(names).toEqual(new Set(["head", "body", "footer"]));
  });

  it("handles single quotes, double quotes, and JSX expression syntax", async () => {
    await writeFile(
      join(tempDir, "Test.astro"),
      `<Stack name="double" /><Stack name='single' /><Stack name={"jsx"} />`,
    );
    const names = await scanStackNames(pathToFileURL(tempDir + "/"));
    expect(names).toEqual(new Set(["double", "single", "jsx"]));
  });

  it("ignores non-.astro files", async () => {
    await writeFile(join(tempDir, "utils.ts"), '<Stack name="head" />');
    await writeFile(join(tempDir, "App.tsx"), '<Stack name="head" />');
    const names = await scanStackNames(pathToFileURL(tempDir + "/"));
    expect(names.size).toBe(0);
  });

  it("ignores node_modules directories", async () => {
    await mkdir(join(tempDir, "node_modules", "some-pkg"), { recursive: true });
    await writeFile(
      join(tempDir, "node_modules", "some-pkg", "Layout.astro"),
      '<Stack name="head" />',
    );
    const names = await scanStackNames(pathToFileURL(tempDir + "/"));
    expect(names.size).toBe(0);
  });

  it("returns empty set when no <Stack> usage found", async () => {
    await writeFile(join(tempDir, "Page.astro"), "<html><body>Hello</body></html>");
    const names = await scanStackNames(pathToFileURL(tempDir + "/"));
    expect(names.size).toBe(0);
  });

  it("handles self-closing and non-self-closing variants", async () => {
    await writeFile(
      join(tempDir, "Layout.astro"),
      '<Stack name="head" /><Stack name="body"></Stack>',
    );
    const names = await scanStackNames(pathToFileURL(tempDir + "/"));
    expect(names).toEqual(new Set(["head", "body"]));
  });

  it("handles JSX expression with single quotes", async () => {
    await writeFile(
      join(tempDir, "Test.astro"),
      `<Stack name={'jsxSingle'} />`,
    );
    const names = await scanStackNames(pathToFileURL(tempDir + "/"));
    expect(names).toEqual(new Set(["jsxSingle"]));
  });

  it("handles spaced JSX expressions", async () => {
    await writeFile(
      join(tempDir, "Test.astro"),
      `<Stack name={ "spaced" } /><Stack name={ 'spacedSingle' } />`,
    );
    const names = await scanStackNames(pathToFileURL(tempDir + "/"));
    expect(names).toEqual(new Set(["spaced", "spacedSingle"]));
  });
});

describe("generateDts", () => {
  it("generates App.Locals declaration when no stack names", () => {
    const dts = generateDts(new Set());
    expect(dts).toContain("export {}");
    expect(dts).toContain("declare global");
    expect(dts).toContain("namespace App");
    expect(dts).toContain('stacks: import("astro-stacks").StackStore');
    expect(dts).not.toContain("StackNames");
  });

  it("generates App.Locals + StackNames augmentation when names provided", () => {
    const dts = generateDts(new Set(["head", "body"]));
    expect(dts).toContain("export {}");
    expect(dts).toContain("declare global");
    expect(dts).toContain("namespace App");
    expect(dts).toContain('stacks: import("astro-stacks").StackStore');
    expect(dts).toContain('declare module "astro-stacks"');
    expect(dts).toContain("interface StackNames");
    expect(dts).toContain('"body": true;');
    expect(dts).toContain('"head": true;');
  });

  it("handles names with special characters", () => {
    const dts = generateDts(new Set(["before-body-end", "my_stack"]));
    expect(dts).toContain('"before-body-end": true;');
    expect(dts).toContain('"my_stack": true;');
  });

  it("sorts names alphabetically", () => {
    const dts = generateDts(new Set(["z-stack", "a-stack", "m-stack"]));
    const aIdx = dts.indexOf('"a-stack"');
    const mIdx = dts.indexOf('"m-stack"');
    const zIdx = dts.indexOf('"z-stack"');
    expect(aIdx).toBeLessThan(mIdx);
    expect(mIdx).toBeLessThan(zIdx);
  });

  it("escapes names containing double quotes", () => {
    const dts = generateDts(new Set(['a"b']));
    expect(dts).toContain('"a\\"b": true;');
    expect(dts).toContain("interface StackNames");
  });
});
