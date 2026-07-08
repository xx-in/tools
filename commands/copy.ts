import {
  isNotFoundError,
  runCommand,
  spawnCommand,
  isCommandAvailable,
  decodeOutput,
} from "../utils/spawn.ts";
import fs from "node:fs/promises";
import { Command } from "commander";
import pc from "picocolors";
import { dirname, resolve, join, basename } from "node:path";

// 递归复制核心逻辑
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

export function registerCopyCommand(program: Command) {
  program
    .command("copy <source> <target>") // 👈 已移除 .alias("cp")
    .description("复制文件或目录（支持递归复制）")
    .action(async (source: string, target: string) => {
      if (!source || !target) {
        console.error(pc.red("❌ 请提供源路径和目标路径"));
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

        console.log(pc.cyan(`📦 正在复制: ${source} ➡️ ${target}...`));
        await copyRecursive(absSource, finalTarget);
        console.log(pc.green(`✨ 复制成功: ${source} ➡️ ${target}`));
      } catch (err) {
        if (isNotFoundError(err)) {
          console.error(pc.red(`❌ 错误: 源路径不存在: ${absSource}`));
        } else {
          console.error(
            pc.red("❌ 复制失败:"),
            err instanceof Error ? err.message : err,
          );
        }
      }
    });
}
