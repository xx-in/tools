import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
import { dirname, resolve } from "jsr:@std/path@^1.0.0";

export function registerCreateCommand(program: Command) {
  program
    .command("create <path>")
    .description("递归创建文件或目录（以 / 结尾则创建目录，否则创建文件）")
    .action(async (targetPath: string) => {
      if (!targetPath) {
        console.error(pc.red("❌ 请提供要创建的路径"));
        return;
      }

      // 1. 判断用户意图：是否以斜杠结尾
      const isDir = targetPath.endsWith("/") || targetPath.endsWith("\\");
      // 2. 解析为绝对路径
      const absolutePath = resolve(Deno.cwd(), targetPath);

      try {
        if (isDir) {
          // 创建目录
          await Deno.mkdir(absolutePath, { recursive: true });
          console.log(pc.green(`✨ 成功递归创建目录: ${absolutePath}`));
        } else {
          // 创建文件：先确保其父级目录存在
          const parentDir = dirname(absolutePath);
          await Deno.mkdir(parentDir, { recursive: true });

          // 检查文件是否已存在，避免意外覆盖
          try {
            await Deno.stat(absolutePath);
            console.log(pc.yellow(`⚠️  文件已存在: ${absolutePath}`));
          } catch (err) {
            if (err instanceof Deno.errors.NotFound) {
              await Deno.writeTextFile(absolutePath, "");
              console.log(pc.green(`✨ 成功创建文件: ${absolutePath}`));
            } else {
              throw err;
            }
          }
        }
      } catch (err) {
        console.error(
          pc.red("❌ 创建失败:"),
          err instanceof Error ? err.message : err,
        );
      }
    });
}
