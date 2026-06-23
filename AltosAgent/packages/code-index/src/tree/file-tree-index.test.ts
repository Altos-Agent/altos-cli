import { describe, it, expect } from "vitest";
import { FileTreeIndex } from "./file-tree-index";
import { FileEntry } from "../types";

const makeEntry = (
  path: string,
  absolutePath: string,
  language = "typescript" as const,
): FileEntry => ({
  path,
  absolutePath,
  size: 100,
  mtime: Date.now(),
  language,
  isTest: false,
  isConfig: false,
  isBuild: false,
});

describe("FileTreeIndex", () => {
  it("should build a tree from file entries", () => {
    const index = new FileTreeIndex();
    const entries: FileEntry[] = [
      makeEntry("src/index.ts", "/project/src/index.ts"),
      makeEntry("src/utils/helper.ts", "/project/src/utils/helper.ts"),
      makeEntry("package.json", "/project/package.json"),
    ];

    const root = index.build("/project", entries);

    expect(root.name).toBe("project");
    expect(root.type).toBe("directory");
    expect(root.children).toBeDefined();
    expect(root.children!.length).toBe(2); // src and package.json

    const srcNode = root.children!.find((c) => c.name === "src");
    expect(srcNode).toBeDefined();
    expect(srcNode!.type).toBe("directory");
  });

  it("should return a node by path", () => {
    const index = new FileTreeIndex();
    const entries: FileEntry[] = [makeEntry("src/index.ts", "/project/src/index.ts")];

    index.build("/project", entries);

    const node = index.getNode("/project/src/index.ts");
    expect(node).toBeDefined();
    expect(node!.name).toBe("index.ts");
    expect(node!.type).toBe("file");
  });

  it("should return children of a directory", () => {
    const index = new FileTreeIndex();
    const entries: FileEntry[] = [
      makeEntry("src/index.ts", "/project/src/index.ts"),
      makeEntry("src/utils/helper.ts", "/project/src/utils/helper.ts"),
    ];

    index.build("/project", entries);

    // /project/src should have index.ts (file) and utils (directory) as children
    const children = index.getChildren("/project/src");
    expect(children.length).toBe(2);
    expect(children.map((c) => c.name).sort()).toEqual(["index.ts", "utils"]);

    // /project/src/utils should have helper.ts as child
    const utilsChildren = index.getChildren("/project/src/utils");
    expect(utilsChildren.length).toBe(1);
    expect(utilsChildren[0].name).toBe("helper.ts");
  });

  it("should serialize to JSON", () => {
    const index = new FileTreeIndex();
    const entries: FileEntry[] = [makeEntry("src/index.ts", "/project/src/index.ts")];

    index.build("/project", entries);
    const json = index.toJSON();

    expect(json.name).toBe("project");
    expect(JSON.stringify(json)).toBe(JSON.stringify(index.getRoot()));
  });

  it("should return undefined for unknown paths", () => {
    const index = new FileTreeIndex();
    const entries: FileEntry[] = [makeEntry("src/index.ts", "/project/src/index.ts")];

    index.build("/project", entries);

    expect(index.getNode("/project/unknown")).toBeUndefined();
    expect(index.getChildren("/project/unknown")).toEqual([]);
  });

  it("should sort children (directories before files)", () => {
    const index = new FileTreeIndex();
    const entries: FileEntry[] = [
      makeEntry("zfile.txt", "/project/zfile.txt"),
      makeEntry("a-dir/file.ts", "/project/a-dir/file.ts"),
      makeEntry("b-dir/file.ts", "/project/b-dir/file.ts"),
    ];

    const root = index.build("/project", entries);
    const children = root.children!;

    expect(children[0].name).toBe("a-dir");
    expect(children[1].name).toBe("b-dir");
    expect(children[2].name).toBe("zfile.txt");
  });

  it("should return root node", () => {
    const index = new FileTreeIndex();
    const entries: FileEntry[] = [makeEntry("index.ts", "/project/index.ts")];

    const root = index.build("/project", entries);
    expect(index.getRoot()).toBe(root);
  });
});
