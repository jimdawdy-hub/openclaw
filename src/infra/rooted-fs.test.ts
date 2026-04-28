import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createRootedFs, toRootRelativePath } from "./rooted-fs.js";

const tempRoots: string[] = [];

async function makeTempRoot(prefix = "openclaw-rooted-fs-"): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("createRootedFs", () => {
  test("writes, appends, makes directories, copies in, and removes paths under its root", async () => {
    const root = await makeTempRoot();
    const sourceDir = await makeTempRoot("openclaw-rooted-fs-source-");
    const sourcePath = path.join(sourceDir, "source.txt");
    await fs.writeFile(sourcePath, "copied", "utf8");

    const rootedFs = createRootedFs({ rootDir: root, scope: "workspace" });

    await rootedFs.writeFile("nested/file.txt", "hello", { encoding: "utf8" });
    await rootedFs.appendFile("nested/file.txt", " world", { encoding: "utf8" });
    await rootedFs.mkdir("empty/child");
    await rootedFs.copyIn({ sourcePath, relativePath: "copied/source.txt" });

    await expect(fs.readFile(path.join(root, "nested", "file.txt"), "utf8")).resolves.toBe(
      "hello world",
    );
    await expect(fs.stat(path.join(root, "empty", "child"))).resolves.toMatchObject({
      isDirectory: expect.any(Function),
    });
    await expect(fs.readFile(path.join(root, "copied", "source.txt"), "utf8")).resolves.toBe(
      "copied",
    );

    await rootedFs.remove("nested/file.txt");
    await expect(fs.stat(path.join(root, "nested", "file.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("rejects traversal writes outside the root", async () => {
    const root = await makeTempRoot();
    const outside = await makeTempRoot("openclaw-rooted-fs-outside-");
    const rootedFs = createRootedFs({ rootDir: root, scope: "browser-downloads" });

    await expect(rootedFs.writeFile("../outside.txt", "escape")).rejects.toThrow();
    await expect(fs.stat(path.join(outside, "outside.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("converts an absolute path under the root to a relative path", async () => {
    const root = await makeTempRoot();
    const absolutePath = path.join(root, "nested", "file.txt");

    await expect(
      toRootRelativePath({ rootDir: root, absolutePath, scopeLabel: "downloads directory" }),
    ).resolves.toBe(path.join("nested", "file.txt"));
  });

  test("rejects an absolute path outside the root", async () => {
    const root = await makeTempRoot();
    const outside = await makeTempRoot("openclaw-rooted-fs-outside-");

    await expect(
      toRootRelativePath({
        rootDir: root,
        absolutePath: path.join(outside, "file.txt"),
        scopeLabel: "downloads directory",
      }),
    ).rejects.toThrow(/outside/i);
  });

  test.runIf(process.platform !== "win32")(
    "rejects an absolute path whose parent symlink escapes the root",
    async () => {
      const root = await makeTempRoot();
      const outside = await makeTempRoot("openclaw-rooted-fs-outside-");
      const symlinkDir = path.join(root, "link-out");
      await fs.symlink(outside, symlinkDir, "dir");

      await expect(
        toRootRelativePath({
          rootDir: root,
          absolutePath: path.join(symlinkDir, "file.txt"),
          scopeLabel: "downloads directory",
        }),
      ).rejects.toThrow(/outside|symlink/i);
    },
  );
});
