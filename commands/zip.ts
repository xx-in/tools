import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
import { join, basename, relative, resolve } from "jsr:@std/path@^1.0.0";
import { zip } from "jsr:@deno-library/compress@^0.5.5";

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

// 解析忽略文件内容
function parseIgnoreContent(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

// 获取黑名单规则
async function getBlacklist(absSrcDir: string): Promise<string[]> {
  const targetIgnorePath = join(absSrcDir, IGNORE_FILE_NAME);
  const cwdIgnorePath = join(Deno.cwd(), IGNORE_FILE_NAME);

  try {
    const content = await Deno.readTextFile(targetIgnorePath);
    console.log(pc.cyan(`[zip] 找到目标目录下的忽略文件: ${targetIgnorePath}`));
    return parseIgnoreContent(content);
  } catch {
    // 忽略错误，继续寻找下一个
  }

  try {
    const content = await Deno.readTextFile(cwdIgnorePath);
    console.log(pc.cyan(`[zip] 找到当前目录下的忽略文件: ${cwdIgnorePath}`));
    return parseIgnoreContent(content);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      console.log(pc.dim(`[zip] 未找到忽略文件，将使用内置默认过滤规则。`));
      return parseIgnoreContent(DEFAULT_BLACKLIST.join("\n"));
    }
    console.error(pc.red(`[zip] 读取忽略文件失败，将使用内置默认规则。`), err);
    return parseIgnoreContent(DEFAULT_BLACKLIST.join("\n"));
  }
}

// 检查是否符合黑名单
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

// 递归复制
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

  const fileInfo = await Deno.stat(src);

  if (fileInfo.isDirectory) {
    await Deno.mkdir(dest, { recursive: true });
    for await (const entry of Deno.readDir(src)) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      await copyRecursive(srcPath, destPath, baseSrc, blacklist);
    }
  } else if (fileInfo.isFile) {
    await Deno.copyFile(src, dest);
  }
}

// 注册 zip 子命令
export function registerZipCommand(program: Command) {
  program
    .command("zip [directory]")
    .description("递归复制目录并根据忽略规则过滤并打包为 ZIP")
    .action(async (directory: string | undefined) => {
      let srcDir = directory;
      if (!srcDir) {
        const input = prompt("请输入要打包的目录路径 (Enter directory path):");
        if (!input) {
          console.error(pc.red("❌ 错误: 未指定有效的输入目录。"));
          return;
        }
        srcDir = input.trim();
      }

      const absSrcDir = resolve(srcDir);

      try {
        const stat = await Deno.stat(absSrcDir);
        if (!stat.isDirectory) {
          console.error(pc.red(`❌ 错误: '${srcDir}' 不是一个有效的目录。`));
          return;
        }
      } catch {
        console.error(pc.red(`❌ 错误: 找不到目录 '${srcDir}'。`));
        return;
      }

      const dirName = basename(absSrcDir);
      const outputZip = join(Deno.cwd(), `${dirName}.zip`);

      // 获取黑名单规则
      const blacklist = await getBlacklist(absSrcDir);

      // 创建临时处理目录
      const tempDir = await Deno.makeTempDir({ prefix: "cpzip_temp_" });
      const tempCopyTarget = join(tempDir, dirName);

      try {
        console.log(pc.cyan(`📦 正在复制目录并过滤忽略项...`));
        await copyRecursive(absSrcDir, tempCopyTarget, absSrcDir, blacklist);

        console.log(pc.cyan(`⚡ 正在打包为 ZIP 压缩包...`));
        await zip.compress(tempCopyTarget, outputZip);

        console.log(pc.green(`✨ 打包成功！压缩包保存为: ${outputZip}`));
      } catch (error) {
        console.error(pc.red("❌ 打包失败:"), error);
      } finally {
        try {
          await Deno.remove(tempDir, { recursive: true });
        } catch {
          // 忽略临时目录清理时的错
        }
      }
    });
}
