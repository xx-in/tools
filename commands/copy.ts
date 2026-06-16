import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
import { dirname, resolve, join, basename } from "jsr:@std/path@^1.0.0";

// 递归复制核心逻辑
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

export function registerCopyCommand(program: Command) {
  program
    .command("copy <source> <target>") // 👈 已移除 .alias("cp")
    .description("复制文件或目录（支持递归复制）")
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

        console.log(pc.cyan(`📦 正在复制: ${source} ➡️ ${target}...`));
        await copyRecursive(absSource, finalTarget);
        console.log(pc.green(`✨ 复制成功: ${source} ➡️ ${target}`));
      } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
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
