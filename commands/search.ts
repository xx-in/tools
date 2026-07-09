import fs from "node:fs/promises";
import { Command } from "commander";
import c from "../utils/colors.ts";
import { resolve, basename, relative } from "node:path";
import fg from "fast-glob";

export function registerSearchCommand(program: Command) {
  program
    .command("search <keyword> [directory]")
    .alias("find")
    .description(
      "递归搜索目录下包含指定关键词的文件或目录（支持 Ctrl+点击 快捷打开）",
    )
    .action(async (keyword: string, directory: string | undefined) => {
      if (!keyword) {
        console.error(c.error("❌ 请提供要搜索的文件名关键词"));
        return;
      }

      const startDir = directory || ".";
      const absoluteStartDir = resolve(process.cwd(), startDir);

      try {
        const stat = await fs.stat(absoluteStartDir);
        if (!stat.isDirectory()) {
          console.error(c.error(`❌ 错误: '${startDir}' 不是一个有效的目录。`));
          return;
        }
      } catch {
        console.error(c.error(`❌ 错误: 找不到起点目录 '${startDir}'。`));
        return;
      }

      console.log(
        c.info(
          `🔍 正在目录 ${absoluteStartDir} 中递归搜寻包含 "${keyword}" 的项目...\n`,
        ),
      );

      let matchCount = 0;

      try {
        const entries = await fg("**/*", {
          cwd: absoluteStartDir,
          absolute: true,
          onlyFiles: false,
          dot: true,
          ignore: [
            "**/node_modules/**",
            "**/.git/**",
            "**/dist/**",
            "**/build/**",
            "**/.cache/**",
          ],
        });

        for (const entryPath of entries) {
          const name = basename(entryPath);
          if (name.toLowerCase().includes(keyword.toLowerCase())) {
            matchCount++;
            const relativePath = relative(absoluteStartDir, entryPath);
            const isDirectory = !name.includes(".") || entryPath.endsWith("/");
            let isDir = isDirectory;
            try {
              const entryStat = await fs.stat(entryPath);
              isDir = entryStat.isDirectory();
            } catch {
              // ignore
            }

            const typeIcon = isDir ? "📁" : "📄";
            const fileUri = `file://${entryPath}`;
            const hyperlink = `\u001b]8;;${fileUri}\u001b\\${c.bold(name)}\u001b]8;;\u001b\\`;

            console.log(`${typeIcon} ${hyperlink}  ->  ${c.dim(fileUri)}`);
          }
        }

        console.log(
          c.success(`\n✨ 搜索完成！共找到 ${matchCount} 个匹配的项目。`),
        );
      } catch (err) {
        console.error(
          c.error("❌ 搜寻过程中发生错误:"),
          err instanceof Error ? err.message : err,
        );
      }
    });
}
