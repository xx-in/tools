import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
import { resolve } from "jsr:@std/path@^1.0.0";
import { expandGlob } from "jsr:@std/fs@^1.0.0";
import trash from "npm:trash@^8.0.0";

export function registerRemoveCommand(program: Command) {
  program
    .command("remove <paths...>")
    .description("安全地将指定的文件或目录移至系统回收站（支持通配符及多选）")
    .action(async (paths: string[]) => {
      if (!paths || paths.length === 0) {
        console.error(pc.red("❌ 请提供要放入回收站的路径或通配符规则"));
        return;
      }

      const resolvedPathsToDelete = new Set<string>();
      const notFoundPaths: string[] = [];

      for (const pattern of paths) {
        const isGlob = /[*?[\]{}]/.test(pattern);

        if (isGlob) {
          try {
            for await (const entry of expandGlob(pattern, {
              root: Deno.cwd(),
            })) {
              resolvedPathsToDelete.add(entry.path);
            }
          } catch (err) {
            console.error(
              pc.red(`❌ 匹配通配符 '${pattern}' 时发生异常:`),
              err instanceof Error ? err.message : err,
            );
          }
        } else {
          const absolutePath = resolve(Deno.cwd(), pattern);
          try {
            await Deno.stat(absolutePath);
            resolvedPathsToDelete.add(absolutePath);
          } catch (err) {
            if (err instanceof Deno.errors.NotFound) {
              notFoundPaths.push(absolutePath);
            } else {
              console.error(
                pc.red(`❌ 获取路径状态失败 [${pattern}]:`),
                err instanceof Error ? err.message : err,
              );
            }
          }
        }
      }

      // 1. 若存在找不到的路径，打印相应的提示
      if (notFoundPaths.length > 0) {
        for (const path of notFoundPaths) {
          console.error(pc.red(`❌ 路径不存在: ${path}`));
        }
      }

      if (resolvedPathsToDelete.size === 0) {
        console.log(pc.yellow("ℹ️ 未能找到任何与指定条件匹配的文件或目录。"));
        return;
      }

      // 2. 直接执行批量移动动作（无中断，极致流畅）
      try {
        console.log(
          pc.cyan(
            `📦 正在将 ${resolvedPathsToDelete.size} 个项移至系统回收站...`,
          ),
        );

        await trash(Array.from(resolvedPathsToDelete));

        // 打印详细的移动路径，让用户明确知晓结果
        for (const path of resolvedPathsToDelete) {
          console.log(pc.dim(`  - 已移入垃圾箱: ${path}`));
        }

        console.log(
          pc.green(
            `✨ 成功！共 ${resolvedPathsToDelete.size} 个文件/目录已安全送至系统回收站。`,
          ),
        );
      } catch (err) {
        console.error(
          pc.red("❌ 移至回收站失败:"),
          err instanceof Error ? err.message : err,
        );
      }
    });
}
