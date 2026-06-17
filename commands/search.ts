import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
import { resolve } from "jsr:@std/path@^1.0.0";
import { walk } from "jsr:@std/fs@^1.0.0"; // 👈 引入 Deno 高性能目录遍历工具

export function registerSearchCommand(program: Command) {
  program
    .command("search <keyword> [directory]")
    .description(
      "递归搜索目录下包含指定关键词的文件或目录（支持 Ctrl+点击 快捷打开）",
    )
    .action(async (keyword: string, directory: string | undefined) => {
      if (!keyword) {
        console.error(pc.red("❌ 请提供要搜索的文件名关键词"));
        return;
      }

      const startDir = directory || ".";
      const absoluteStartDir = resolve(Deno.cwd(), startDir);

      try {
        const stat = await Deno.stat(absoluteStartDir);
        if (!stat.isDirectory) {
          console.error(pc.red(`❌ 错误: '${startDir}' 不是一个有效的目录。`));
          return;
        }
      } catch {
        console.error(pc.red(`❌ 错误: 找不到起点目录 '${startDir}'。`));
        return;
      }

      console.log(
        pc.cyan(
          `🔍 正在目录 ${absoluteStartDir} 中递归搜寻包含 "${keyword}" 的项目...\n`,
        ),
      );

      let matchCount = 0;

      try {
        // 使用 walk 高效递归，并排除无关干扰的大型文件夹
        for await (const entry of walk(absoluteStartDir, {
          skip: [/node_modules/, /\.git/, /dist/, /build/, /\.cache/],
        })) {
          // 模糊匹配文件名（忽略大小写）
          if (entry.name.toLowerCase().includes(keyword.toLowerCase())) {
            matchCount++;
            const absolutePath = resolve(entry.path);
            const typeIcon = entry.isDirectory ? "📁" : "📄";

            // 格式：\u001b]8;;URI\u001b\显示文本\u001b]8;;\u001b\
            const fileUri = `file://${absolutePath}`;
            const hyperlink = `\u001b]8;;${fileUri}\u001b\\${pc.bold(entry.name)}\u001b]8;;\u001b\\`;

            // 在其后方以暗淡颜色附加标准 file:// 绝对路径，作为老旧终端不支持超链接时的兼容兜底（同样可双击/Ctrl点击）
            console.log(`${typeIcon} ${hyperlink}  ->  ${pc.dim(fileUri)}`);
          }
        }

        console.log(
          pc.green(`\n✨ 搜索完成！共找到 ${matchCount} 个匹配的项目。`),
        );
      } catch (err) {
        console.error(
          pc.red("❌ 搜寻过程中发生错误:"),
          err instanceof Error ? err.message : err,
        );
      }
    });
}
