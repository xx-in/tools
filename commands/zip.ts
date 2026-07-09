import fs from "node:fs/promises";
import { Command } from "commander";
import os from "node:os";
import c from "../utils/colors.ts";
import { join, basename, relative, resolve } from "node:path";
import { compressZip } from "../utils/archive.ts";
import { isNotFoundError } from "../utils/spawn.ts";

const IGNORE_FILE_NAME = ".cpzipignore";
const DEFAULT_BLACKLIST = [
  "# cpzip 忽略配置文件",
  "# 支持文件夹名、文件名、以及带有 *.ext 后缀的通配符",
  "node_modules",
  ".git",
  ".DS_Store",
  "dist",
  "*.zip",
];

function parseIgnoreContent(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

async function getBlacklist(absSrcDir: string): Promise<string[]> {
  const targetIgnorePath = join(absSrcDir, IGNORE_FILE_NAME);
  const cwdIgnorePath = join(process.cwd(), IGNORE_FILE_NAME);

  try {
    const content = await fs.readFile(targetIgnorePath, "utf-8");
    console.log(c.info(`[zip] 找到目标目录下的忽略文件: ${targetIgnorePath}`));
    return parseIgnoreContent(content);
  } catch {
    // 忽略错误，继续寻找下一个
  }

  try {
    const content = await fs.readFile(cwdIgnorePath, "utf-8");
    console.log(c.info(`[zip] 找到当前目录下的忽略文件: ${cwdIgnorePath}`));
    return parseIgnoreContent(content);
  } catch (err) {
    if (isNotFoundError(err)) {
      console.log(c.dim(`[zip] 未找到忽略文件，将使用内置默认过滤规则。`));
      return parseIgnoreContent(DEFAULT_BLACKLIST.join("\n"));
    }
    console.error(c.error(`[zip] 读取忽略文件失败，将使用内置默认规则。`), err);
    return parseIgnoreContent(DEFAULT_BLACKLIST.join("\n"));
  }
}

function isBlacklisted(pathStr: string, blacklist: string[]): boolean {
  const normalized = pathStr.replace(/\\/g, "/");
  const segments = normalized.split("/");

  for (const pattern of blacklist) {
    const trimmed = pattern.trim();
    if (!trimmed) continue;

    if (segments.includes(trimmed)) {
      return true;
    }

    if (trimmed.startsWith("*.")) {
      const ext = trimmed.slice(1);
      if (normalized.endsWith(ext)) {
        return true;
      }
    }

    const patternNormalized = trimmed.replace(/\\/g, "/");
    if (
      normalized.endsWith(patternNormalized) ||
      normalized.includes("/" + patternNormalized + "/")
    ) {
      return true;
    }
  }
  return false;
}

async function copyRecursive(
  src: string,
  dest: string,
  baseSrc: string,
  blacklist: string[],
) {
  const relPath = relative(baseSrc, src);
  if (relPath && isBlacklisted(relPath, blacklist)) {
    return;
  }

  const fileInfo = await fs.stat(src);

  if (fileInfo.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    for (const entry of await fs.readdir(src, { withFileTypes: true })) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      await copyRecursive(srcPath, destPath, baseSrc, blacklist);
    }
  } else if (fileInfo.isFile()) {
    await fs.copyFile(src, dest);
  }
}

export function registerZipCommand(program: Command) {
  program
    .command("zip [directory]")
    .description("递归复制目录并根据忽略规则过滤并打包为 ZIP")
    .action(async (directory: string | undefined) => {
      let srcDir = directory;
      if (!srcDir) {
        const input = prompt("请输入要打包的目录路径 (Enter directory path):");
        if (!input) {
          console.error(c.error("❌ 错误: 未指定有效的输入目录。"));
          return;
        }
        srcDir = input.trim();
      }

      const absSrcDir = resolve(srcDir);

      try {
        const stat = await fs.stat(absSrcDir);
        if (!stat.isDirectory()) {
          console.error(c.error(`❌ 错误: '${srcDir}' 不是一个有效的目录。`));
          return;
        }
      } catch {
        console.error(c.error(`❌ 错误: 找不到目录 '${srcDir}'。`));
        return;
      }

      const dirName = basename(absSrcDir);
      const outputZip = join(process.cwd(), `${dirName}.zip`);
      const blacklist = await getBlacklist(absSrcDir);
      const tempDir = await fs.mkdtemp(join(os.tmpdir(), "cpzip_temp_"));
      const tempCopyTarget = join(tempDir, dirName);

      try {
        console.log(c.info(`📦 正在复制目录并过滤忽略项...`));
        await copyRecursive(absSrcDir, tempCopyTarget, absSrcDir, blacklist);

        console.log(c.info(`⚡ 正在打包为 ZIP 压缩包...`));
        await compressZip(tempCopyTarget, outputZip);

        console.log(c.success(`✨ 打包成功！压缩包保存为: ${outputZip}`));
      } catch (error) {
        console.error(c.error("❌ 打包失败:"), error);
      } finally {
        try {
          await fs.rm(tempDir, { recursive: true });
        } catch {
          // 忽略临时目录清理时的错
        }
      }
    });
}
