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

// 获取黑名单规则（优先查找源目录，其次查找当前工作目录，否则使用默认规则）
async function getBlacklist(absSrcDir: string): Promise<string[]> {
  const targetIgnorePath = join(absSrcDir, IGNORE_FILE_NAME);
  const cwdIgnorePath = join(Deno.cwd(), IGNORE_FILE_NAME);

  // 1. 尝试读取打包目标文件夹内的忽略文件
  try {
    const content = await Deno.readTextFile(targetIgnorePath);
    console.log(`[cpzip] 找到目标目录下的忽略文件: ${targetIgnorePath}`);
    return parseIgnoreContent(content);
  } catch {
    // 忽略错误，继续寻找
  }

  // 2. 尝试读取当前工作目录 (CWD) 下的忽略文件
  try {
    const content = await Deno.readTextFile(cwdIgnorePath);
    console.log(`[cpzip] 找到当前目录下的忽略文件: ${cwdIgnorePath}`);
    return parseIgnoreContent(content);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      // 未找到任何配置文件，直接应用内置默认规则，不再本地创建文件
      console.log(`[cpzip] 未找到忽略文件，将直接使用内置默认过滤规则。`);
      return parseIgnoreContent(DEFAULT_BLACKLIST.join("\n"));
    }
    console.error(`[cpzip] 读取忽略文件失败，将使用内置默认规则。`, err);
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

    // a. 匹配路径节点（如 "node_modules"）
    if (segments.includes(trimmed)) {
      return true;
    }

    // b. 匹配后缀（如 "*.zip"）
    if (trimmed.startsWith("*.")) {
      const ext = trimmed.slice(1);
      if (normalized.endsWith(ext)) {
        return true;
      }
    }

    // c. 匹配相对子路径（如 "dist/build"）
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

async function main() {
  const args = Deno.args;

  // 帮助信息
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
cpzip - 极简的目录复制与打包 ZIP 工具

用法:
  cpzip [目录路径]

选项:
  -h, --help  显示帮助信息

功能说明:
  1. 运行后会在 [目标目录] 或 [当前工作目录] 寻找并读取 .cpzipignore 文件。
  2. 如果两个位置都没有该文件，将直接使用内置的默认规则进行过滤（默认忽略 node_modules、.git 等），不再主动生成任何配置文件。
  3. 复制源目录时自动过滤忽略列表中匹配的项目，将其临时存储。
  4. 打包为与目录同名的 ZIP 压缩包，并彻底清理临时工作区。
`);
    Deno.exit(0);
  }

  let srcDir = args[0];
  if (!srcDir) {
    const input = prompt("请输入要打包的目录路径 (Enter directory path):");
    if (!input) {
      console.error("[cpzip] 错误: 未指定有效的输入目录。");
      Deno.exit(1);
    }
    srcDir = input.trim();
  }

  const absSrcDir = resolve(srcDir);

  try {
    const stat = await Deno.stat(absSrcDir);
    if (!stat.isDirectory) {
      console.error(`[cpzip] 错误: '${srcDir}' 不是一个有效的目录。`);
      Deno.exit(1);
    }
  } catch {
    console.error(`[cpzip] 错误: 找不到目录 '${srcDir}'。`);
    Deno.exit(1);
  }

  const dirName = basename(absSrcDir);
  const outputZip = join(Deno.cwd(), `${dirName}.zip`);

  // 获取黑名单（优先检查目标目录，其次检查 CWD）
  const blacklist = await getBlacklist(absSrcDir);

  const tempDir = await Deno.makeTempDir({ prefix: "cpzip_temp_" });
  const tempCopyTarget = join(tempDir, dirName);

  try {
    console.log(`[cpzip] 正在复制目录并过滤忽略项...`);
    await copyRecursive(absSrcDir, tempCopyTarget, absSrcDir, blacklist);

    console.log(`[cpzip] 正在打包为 ZIP 压缩包...`);
    await zip.compress(tempCopyTarget, outputZip);

    console.log(`[cpzip] 打包成功！压缩包保存为: ${outputZip}`);
  } catch (error) {
    console.error("[cpzip] 打包失败:", error);
  } finally {
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // 忽略临时目录清理错误
    }
  }
}

if (import.meta.main) {
  main();
}
