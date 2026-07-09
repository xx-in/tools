import {
  isNotFoundError,
  runCommand,
  spawnCommand,
  isCommandAvailable,
  decodeOutput,
} from "../utils/spawn.ts";
import fs from "node:fs/promises";
import { Command } from "commander";
import c from "../utils/colors.ts";
import { dirname, resolve, join, basename } from "node:path";

// 递归复制逻辑
async function copyRecursive(src: string, dest: string) {
  const fileInfo = await fs.stat(src);
  if (fileInfo.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    for (const entry of await fs.readdir(src, { withFileTypes: true })) {
      await copyRecursive(join(src, entry.name), join(dest, entry.name));
    }
  } else if (fileInfo.isFile()) {
    await fs.mkdir(dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }
}

export function registerMoveCommand(program: Command) {
  program
    .command("move <source> <target>")
    .alias("mv")
    .description("移动或重命名文件及目录")
    .action(async (source: string, target: string) => {
      if (!source || !target) {
        console.error(c.error("❌ 请提供源路径和目标路径"));
        return;
      }

      const absSource = resolve(process.cwd(), source);
      const absTarget = resolve(process.cwd(), target);

      try {
        await fs.stat(absSource);

        let finalTarget = absTarget;
        try {
          const targetStat = await fs.stat(absTarget);
          if (targetStat.isDirectory()) {
            finalTarget = join(absTarget, basename(absSource));
          }
        } catch {
          // ignore
        }

        const targetParentDir = dirname(finalTarget);
        await fs.mkdir(targetParentDir, { recursive: true });

        console.log(c.info(`📦 正在移动: ${source} ➡️ ${target}...`));
        try {
          await fs.rename(absSource, finalTarget);
        } catch {
          await copyRecursive(absSource, finalTarget);
          await fs.rm(absSource, { recursive: true });
        }
        console.log(c.success(`✨ 移动成功: ${source} ➡️ ${target}`));
      } catch (err) {
        if (isNotFoundError(err)) {
          console.error(c.error(`❌ 错误: 源路径不存在: ${absSource}`));
        } else {
          console.error(
            c.error("❌ 移动失败:"),
            err instanceof Error ? err.message : err,
          );
        }
      }
    });
}
