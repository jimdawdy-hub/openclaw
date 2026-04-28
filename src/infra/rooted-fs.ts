import path from "node:path";
import { BOUNDARY_PATH_ALIAS_POLICIES, resolveBoundaryPath } from "./boundary-path.js";
import {
  appendFileWithinRoot,
  copyFileWithinRoot,
  mkdirPathWithinRoot,
  removePathWithinRoot,
  writeFileWithinRoot,
} from "./fs-safe.js";

export type RootedFsScope =
  | "workspace"
  | "browser-downloads"
  | "browser-uploads"
  | "plugin-state"
  | "plugin-cache"
  | "plugin-temp"
  | "media"
  | "session-store"
  | (string & {});

export type RootedFs = {
  readonly rootDir: string;
  readonly scope: RootedFsScope;
  resolvePath(relativePath: string, opts?: { allowRoot?: boolean }): Promise<string>;
  writeFile(
    relativePath: string,
    data: string | Buffer,
    opts?: { encoding?: BufferEncoding; mkdir?: boolean },
  ): Promise<void>;
  appendFile(
    relativePath: string,
    data: string | Buffer,
    opts?: { encoding?: BufferEncoding; mkdir?: boolean },
  ): Promise<void>;
  mkdir(relativePath: string, opts?: { allowRoot?: boolean }): Promise<void>;
  remove(relativePath: string): Promise<void>;
  copyIn(params: {
    sourcePath: string;
    relativePath: string;
    maxBytes?: number;
    mkdir?: boolean;
  }): Promise<void>;
};

export function createRootedFs(params: { rootDir: string; scope: RootedFsScope }): RootedFs {
  const rootDir = path.resolve(params.rootDir);
  return {
    rootDir,
    scope: params.scope,
    async resolvePath(relativePath, opts) {
      const normalized = normalizeRootRelativePath(relativePath, opts);
      return path.join(rootDir, normalized);
    },
    async writeFile(relativePath, data, opts) {
      await writeFileWithinRoot({
        rootDir,
        relativePath: normalizeRootRelativePath(relativePath),
        data,
        encoding: opts?.encoding,
        mkdir: opts?.mkdir,
      });
    },
    async appendFile(relativePath, data, opts) {
      await appendFileWithinRoot({
        rootDir,
        relativePath: normalizeRootRelativePath(relativePath),
        data,
        encoding: opts?.encoding,
        mkdir: opts?.mkdir,
      });
    },
    async mkdir(relativePath, opts) {
      await mkdirPathWithinRoot({
        rootDir,
        relativePath: normalizeRootRelativePath(relativePath, opts),
        allowRoot: opts?.allowRoot,
      });
    },
    async remove(relativePath) {
      await removePathWithinRoot({
        rootDir,
        relativePath: normalizeRootRelativePath(relativePath),
      });
    },
    async copyIn(copyParams) {
      await copyFileWithinRoot({
        rootDir,
        sourcePath: copyParams.sourcePath,
        relativePath: normalizeRootRelativePath(copyParams.relativePath),
        maxBytes: copyParams.maxBytes,
        mkdir: copyParams.mkdir,
      });
    },
  };
}

export async function toRootRelativePath(params: {
  rootDir: string;
  absolutePath: string;
  scopeLabel: string;
}): Promise<string> {
  const rootDir = path.resolve(params.rootDir);
  const resolved = await resolveBoundaryPath({
    rootPath: rootDir,
    absolutePath: params.absolutePath,
    boundaryLabel: params.scopeLabel,
    intent: "write",
    policy: BOUNDARY_PATH_ALIAS_POLICIES.strict,
  });
  const relativePath = resolved.relativePath;
  if (!isSafeRelativePath(relativePath)) {
    throw new Error(`Path is outside the allowed ${params.scopeLabel}`);
  }
  return relativePath;
}

function normalizeRootRelativePath(relativePath: string, opts?: { allowRoot?: boolean }): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error("RootedFs paths must be relative to the declared root");
  }
  const normalized = path.normalize(relativePath);
  if (opts?.allowRoot === true && (normalized === "." || normalized === "")) {
    return ".";
  }
  if (!isSafeRelativePath(normalized)) {
    throw new Error("RootedFs path is outside the declared root");
  }
  return normalized;
}

function isSafeRelativePath(relativePath: string): boolean {
  return (
    relativePath !== "" &&
    relativePath !== "." &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}
