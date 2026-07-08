import fs from "node:fs/promises";
import { Command } from "commander";
import pc from "picocolors";
import { join, basename, extname, resolve } from "node:path";
import {
  uncompressZip,
  uncompressTar,
  uncompressTgz,
} from "../utils/archive.ts";
import { isCommandAvailable, spawnCommand } from "../utils/spawn.ts";

async function uncompressRar(src: string, dest: string): Promise<void> {
  const hasUnrar = isCommandAvailable("unrar");
  if (hasUnrar) {
    console.log(pc.cyan(`📦 正在调用系统 unrar 提取 RAR 压缩包...`));
    const status = await spawnCommand("unrar", ["x", "-y", src, dest]);
    if (!status.success) {
      throw new Error(`unrar 执行失败，进程退出码: ${status.code}`);
    }
    return;
  }

  const hasRar = isCommandAvailable("rar");
  if (hasRar) {
    console.log(pc.cyan(`📦 正在调用系统 rar 提取 RAR 压缩包...`));
    const status = await spawnCommand("rar", ["x", "-y", src, dest]);
    if (!status.success) {
      throw new Error(`rar 执行失败，进程退出码: ${status.code}`);
    }
    return;
  }

  throw new Error(
    "您的系统中未检测到 'unrar' 或 'rar' 提取程序。\n👉 提示：请在终端中运行 'sudo dnf install unrar' 或 'brew install unrar' 安装后重试。",
  );
}

export function registerUnzipCommand(program: Command) {
  program
    .command("unzip [zipfile]")
    .description(
      "通用压缩包解压器（支持 .zip, .tar.gz, .tgz, .tar, .rar 格式）",
    )
    .option("-d, --dir <directory>", "指定解压到的目标目录路径")
    .action(async (zipfile: string | undefined, options: { dir?: string }) => {
      let srcFile = zipfile;
      if (!srcFile) {
        const input = prompt(
          "请输入要解压的压缩包文件路径 (Enter compressed file path):",
        );
        if (!input) {
          console.error(pc.red("❌ 错误: 未指定有效的压缩包文件。"));
          return;
        }
        srcFile = input.trim();
      }

      const absSrcFile = resolve(srcFile);

      try {
        const stat = await fs.stat(absSrcFile);
        if (!stat.isFile()) {
          console.error(pc.red(`❌ 错误: '${srcFile}' 不是一个有效的文件。`));
          return;
        }
      } catch {
        console.error(pc.red(`❌ 错误: 找不到文件 '${srcFile}'。`));
        return;
      }

      const lowerSrc = absSrcFile.toLowerCase();

      let folderName = "";
      if (lowerSrc.endsWith(".tar.gz")) {
        folderName = basename(absSrcFile, ".tar.gz");
      } else if (lowerSrc.endsWith(".tgz")) {
        folderName = basename(absSrcFile, ".tgz");
      } else {
        folderName = basename(absSrcFile, extname(absSrcFile));
      }

      let destDir = options.dir;
      if (!destDir) {
        destDir = join(process.cwd(), folderName);
      } else {
        destDir = resolve(process.cwd(), destDir);
      }

      try {
        console.log(pc.cyan(`📦 正在准备解压: ${absSrcFile}...`));
        console.log(pc.cyan(`📥 目标输出目录: ${destDir}`));

        await fs.mkdir(destDir, { recursive: true });

        if (lowerSrc.endsWith(".tar.gz") || lowerSrc.endsWith(".tgz")) {
          await uncompressTgz(absSrcFile, destDir);
        } else if (lowerSrc.endsWith(".tar")) {
          await uncompressTar(absSrcFile, destDir);
        } else if (lowerSrc.endsWith(".zip")) {
          await uncompressZip(absSrcFile, destDir);
        } else if (lowerSrc.endsWith(".rar")) {
          await uncompressRar(absSrcFile, destDir);
        } else {
          console.log(
            pc.yellow(
              "⚠️ 未能识别的压缩包格式后缀。将默认尝试作为标准 ZIP 进行提取...",
            ),
          );
          await uncompressZip(absSrcFile, destDir);
        }

        console.log(pc.green(`✨ 提取成功！已保存到: ${destDir}`));
      } catch (error) {
        console.error(
          pc.red("❌ 提取失败:"),
          error instanceof Error ? error.message : error,
        );
      }
    });
}
