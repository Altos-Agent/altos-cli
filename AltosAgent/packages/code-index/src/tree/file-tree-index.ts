import { FileEntry, FileTreeNode } from "../types";

export class FileTreeIndex {
  private root: FileTreeNode;
  private nodeMap: Map<string, FileTreeNode>;

  constructor() {
    this.root = {} as FileTreeNode;
    this.nodeMap = new Map();
  }

  build(rootPath: string, entries: FileEntry[]): FileTreeNode {
    // Initialize root node
    const rootName = rootPath.split("/").filter(Boolean).pop() || rootPath;
    this.root = {
      name: rootName,
      path: rootPath,
      type: "directory",
      children: [],
    };
    this.nodeMap = new Map();
    this.nodeMap.set(rootPath, this.root);

    // Build tree from entries
    for (const entry of entries) {
      const absolutePath = entry.absolutePath;
      const relativePath = absolutePath.startsWith(rootPath + "/")
        ? absolutePath.slice(rootPath.length + 1)
        : absolutePath;

      const parts = relativePath.split("/").filter(Boolean);
      let currentPath = rootPath;
      let currentNode = this.root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        currentPath = currentPath + "/" + part;

        let node = this.nodeMap.get(currentPath);
        if (!node) {
          node = {
            name: part,
            path: currentPath,
            type: isLast ? "file" : "directory",
            children: isLast ? undefined : [],
            language: isLast ? entry.language : undefined,
          };

          if (!currentNode.children) {
            currentNode.children = [];
          }
          currentNode.children.push(node);
          this.nodeMap.set(currentPath, node);
        }

        currentNode = node;
      }
    }

    // Sort children: directories first, then alphabetically by name
    const sortChildren = (node: FileTreeNode): void => {
      if (node.children) {
        node.children.sort((a, b) => {
          if (a.type === "directory" && b.type !== "directory") return -1;
          if (a.type !== "directory" && b.type === "directory") return 1;
          return a.name.localeCompare(b.name);
        });
        for (const child of node.children) {
          sortChildren(child);
        }
      }
    };

    sortChildren(this.root);
    return this.root;
  }

  getNode(path: string): FileTreeNode | undefined {
    return this.nodeMap.get(path);
  }

  getChildren(path: string): FileTreeNode[] {
    const node = this.nodeMap.get(path);
    if (!node) return [];
    return node.children ?? [];
  }

  getRoot(): FileTreeNode {
    return this.root;
  }

  toJSON(): FileTreeNode {
    return this.root;
  }
}
