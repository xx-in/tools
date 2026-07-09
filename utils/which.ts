import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { platform } from "node:process";

export interface WhichOptions {
  /** 列出 PATH 中所有匹配项，等同 which -a */
  all?: boolean;
}

function normalizeDir(dir: string): string {
  return path.resolve(dir.replace(/^~(?=\/|$)/, os.homedir()));
}

function getPathEntries(): string[] {
  const value = process.env.PATH || process.env.Path;
  if (!value) {
    return [];
  }
  return value.split(path.delimiter).filter(Boolean);
}

function getCandidateNames(name: string): string[] {
  if (platform !== "win32") {
    return [name];
  }

  const names = new Set<string>([name]);
  const pathext = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((ext) => ext.trim())
    .filter(Boolean);

  if (path.extname(name.toLowerCase()) === "") {
    for (const ext of pathext) {
      names.add(`${name}${ext}`);
    }
  }

  return [...names];
}

function findExecutableInDir(dir: string, name: string): string | null {
  for (const candidate of getCandidateNames(name)) {
    const fullPath = path.join(dir, candidate);
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile() && !stat.isSymbolicLink()) {
        continue;
      }

      if (platform !== "win32") {
        fs.accessSync(fullPath, fs.constants.X_OK);
      }

      return fullPath;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * 按 PATH 顺序查找命令，行为对齐 which（macOS/Linux）并兼容 Windows PATHEXT。
 */
export function findInPath(
  command: string,
  options: WhichOptions = {},
): string[] {
  const name = path.basename(command);
  if (!name) {
    return [];
  }

  const results: string[] = [];

  for (const entry of getPathEntries()) {
    let found: string | null = null;
    try {
      found = findExecutableInDir(normalizeDir(entry), name);
    } catch {
      continue;
    }

    if (!found) {
      continue;
    }

    results.push(found);
    if (!options.all) {
      break;
    }
  }

  return results;
}
