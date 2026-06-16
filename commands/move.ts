import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
import { dirname, resolve, join, basename } from "jsr:@std/path@^1.0.0";

// 递归复制逻辑
async function copyRecursive(src: string, dest: string) {
  const fileInfo = await Deno.stat(src);
  if (fileInfo.isDirectory) {
    await Deno.mkdir(dest, { recursive: true });
    for await (const entry of Deno.readDir(src)) {
      await copyRecursive(join(src, entry.name), join(dest, entry.name));
    }
  } else if (fileInfo.isFile) {
    await Deno.mkdir(dirname(dest), { recursive: true });
    await Deno.copyFile(src, dest);
  }
}

export function registerMoveCommand(program: Command) {
  program
    .command("move <source> <target>") // 👈 已移除 .alias("mv")
    .description("移动或重命名文件及目录")
    .action(async (source: string, target: string) => {
      if (!source || !target) {
        console.error(pc.red("❌ 请提供源路径和目标路径"));
        return;
      }

      const absSource = resolve(Deno.cwd(), source);
      const absTarget = resolve(Deno.cwd(), target);

      try {
        await Deno.stat(absSource);

        let finalTarget = absTarget;
        try {
          const targetStat = await Deno.stat(absTarget);
          if (targetStat.isDirectory) {
            finalTarget = join(absTarget, basename(absSource));
          }
        } catch {
          // ignore
        }

        const targetParentDir = dirname(finalTarget);
        await Deno.mkdir(targetParentDir, { recursive: true });

        console.log(pc.cyan(`📦 正在移动: ${source} ➡️ ${target}...`));
        try {
          await Deno.rename(absSource, finalTarget);
        } catch {
          await copyRecursive(absSource, finalTarget);
          await Deno.remove(absSource, { recursive: true });
        }
        console.log(pc.green(`✨ 移动成功: ${source} ➡️ ${target}`));
      } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
          console.error(pc.red(`❌ 错误: 源路径不存在: ${absSource}`));
        } else {
          console.error(
            pc.red("❌ 移动失败:"),
            err instanceof Error ? err.message : err,
          );
        }
      }
    });
}
