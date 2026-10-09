import { describe, expect, it } from "vitest";
import { relativePath, resolvePath, rewriteIncludes } from "@/lib/fs/includePaths";

describe("resolvePath", () => {
  it("resolves relative to the including file's folder", () => {
    expect(resolvePath("/", "components/test.scad")).toBe("/components/test.scad");
    expect(resolvePath("/a/b", "../c.scad")).toBe("/a/c.scad");
    expect(resolvePath("/a", "./b/../c.scad")).toBe("/a/c.scad");
  });

  it("keeps absolute paths", () => {
    expect(resolvePath("/a", "/lib/x.scad")).toBe("/lib/x.scad");
  });
});

describe("relativePath", () => {
  it("builds paths with .. where needed", () => {
    expect(relativePath("/", "/parts/test.scad")).toBe("parts/test.scad");
    expect(relativePath("/sub", "/components/test.scad")).toBe("../components/test.scad");
    expect(relativePath("/a/b", "/a/c.scad")).toBe("../c.scad");
    expect(relativePath("/a", "/a/c.scad")).toBe("c.scad");
  });
});

describe("rewriteIncludes", () => {
  const rewrite = (
    content: string,
    file: string,
    oldPath: string,
    newPath: string,
    existing: string[],
  ) => rewriteIncludes(content, file, oldPath, newPath, new Set(existing));

  it("updates references to a moved file", () => {
    expect(
      rewrite(
        "use <components/test.scad>;",
        "/main.scad",
        "/components/test.scad",
        "/parts/test.scad",
        ["/main.scad", "/parts/test.scad"],
      ),
    ).toBe("use <parts/test.scad>;");
  });

  it("updates references into a moved folder", () => {
    expect(
      rewrite("include <components/test.scad>", "/main.scad", "/components", "/lib/components", [
        "/main.scad",
        "/lib/components/test.scad",
      ]),
    ).toBe("include <lib/components/test.scad>");
  });

  it("updates relative references made from inside a moved folder", () => {
    expect(
      rewrite(
        "include <../shared.scad>",
        "/lib/components/test.scad",
        "/components",
        "/lib/components",
        ["/shared.scad", "/lib/components/test.scad"],
      ),
    ).toBe("include <../../shared.scad>");
  });

  it("updates references from a moved including file", () => {
    expect(
      rewrite("use <components/test.scad>", "/sub/main.scad", "/main.scad", "/sub/main.scad", [
        "/sub/main.scad",
        "/components/test.scad",
      ]),
    ).toBe("use <../components/test.scad>");
  });

  it("leaves sibling references inside a moved folder alone", () => {
    expect(rewrite("use <b.scad>", "/x/a.scad", "/c", "/x", ["/x/a.scad", "/x/b.scad"])).toBe(
      "use <b.scad>",
    );
  });

  it("leaves library and broken references alone", () => {
    const content = "include <BOSL2/std.scad>\nuse <missing.scad>";
    expect(
      rewrite(content, "/sub/main.scad", "/main.scad", "/sub/main.scad", ["/sub/main.scad"]),
    ).toBe(content);
  });

  it("keeps absolute references absolute", () => {
    expect(
      rewrite("use </components/test.scad>", "/main.scad", "/components", "/parts", [
        "/main.scad",
        "/parts/test.scad",
      ]),
    ).toBe("use </parts/test.scad>");
  });

  it("rewrites every matching statement and keeps the surrounding code", () => {
    const content = [
      "include  <components/a.scad>",
      "use<components/b.scad>",
      "// use <components/a.scad>",
      "cube(10);",
    ].join("\n");
    expect(
      rewrite(content, "/main.scad", "/components", "/parts", [
        "/main.scad",
        "/parts/a.scad",
        "/parts/b.scad",
      ]),
    ).toBe(
      ["include  <parts/a.scad>", "use<parts/b.scad>", "// use <parts/a.scad>", "cube(10);"].join(
        "\n",
      ),
    );
  });
});
