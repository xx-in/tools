import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
import { resolve } from "jsr:@std/path@^1.0.0";

export function registerLsCommand(program: Command) {
  program
    .command("list [path]")
    .description("列出目录中的所有文件和目录（含隐藏项）")
    .action(async (targetPath: string | undefined) => {
      const inputPath = targetPath || ".";
      const absolutePath = resolve(Deno.cwd(), inputPath);

      try {
        const stat = await Deno.stat(absolutePath);
        if (!stat.isDirectory) {
          console.error(pc.red(`❌ 错误: '${inputPath}' 不是一个有效的目录。`));
          return;
        }

        const entries: Deno.DirEntry[] = [];
        for await (const entry of Deno.readDir(absolutePath)) {
          entries.push(entry);
        }

        if (entries.length === 0) {
          console.log(pc.dim("（空目录）"));
          return;
        }

        // 排序规则：文件夹排在前面，普通项排在隐藏项前面，字母升序排序
        entries.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

        // 逐项彩色打印输出
        for (const entry of entries) {
          const isHidden = entry.name.startsWith(".");

          if (entry.isDirectory) {
            if (isHidden) {
              console.log(pc.dim(`📁 ${pc.blue(entry.name)}/`));
            } else {
              console.log(`📁 ${pc.blue(pc.bold(entry.name))}/`);
            }
          } else {
            if (isHidden) {
              console.log(pc.dim(`📄 ${entry.name}`));
            } else {
              console.log(`📄 ${entry.name}`);
            }
          }
        }
      } catch (err) {
        console.error(
          pc.red(`❌ 无法读取目录内容:`),
          err instanceof Error ? err.message : err,
        );
      }
    });
}
