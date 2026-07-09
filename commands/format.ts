import fs from "node:fs/promises";
import { Command } from "commander";
import c from "../utils/colors.ts";
import { resolve, join } from "node:path";
// 👈 使用具名导入 getFileInfo, resolveConfig, format
import { getFileInfo, resolveConfig, format } from "prettier";

// 递归获取所有文件路径（过滤常见无需遍历的文件夹）
async function getFilesRecursively(dirPath: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for await (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === "dist"
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await getFilesRecursively(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

export function registerFormatCommand(program: Command) {
  program
    .command("format [path]")
    .alias("fmt")
    .description("使用 Prettier 自动格式化代码文件或目录中的所有文件")
    .action(async (targetPath: string | undefined) => {
      const inputPath = targetPath || ".";
      const absolutePath = resolve(process.cwd(), inputPath);

      let targetFiles: string[] = [];

      try {
        const stat = await fs.stat(absolutePath);
        if (stat.isDirectory()) {
          console.log(c.info(`🔍 正在扫描目录中的文件: ${absolutePath}...`));
          targetFiles = await getFilesRecursively(absolutePath);
        } else if (stat.isFile()) {
          targetFiles = [absolutePath];
        }
      } catch {
        console.error(c.error(`❌ 错误: 找不到指定的路径 '${inputPath}'。`));
        return;
      }

      if (targetFiles.length === 0) {
        console.log(c.warn("⚠️ 未找到任何可供格式化的文件。"));
        return;
      }

      console.log(
        c.info(`✨ 开始使用 Prettier 格式化 ${targetFiles.length} 个文件...`),
      );
      let successCount = 0;
      let errorCount = 0;
      let ignoredCount = 0;

      for (const filePath of targetFiles) {
        try {
          // 1. 利用 Prettier API getFileInfo 判断文件是否被忽略或不被支持
          const fileInfo = await getFileInfo(filePath); // 👈 修复为 getFileInfo
          if (!fileInfo || fileInfo.ignored || !fileInfo.inferredParser) {
            ignoredCount++;
            continue;
          }

          // 2. 读取源文件
          const content = await fs.readFile(filePath, "utf-8");

          // 3. 尝试解析当前文件适用的本地 Prettier 配置文件 (e.g. .prettierrc)
          const config = (await resolveConfig(filePath)) || {}; // 👈 直接调用 resolveConfig

          // 4. 执行格式化
          const formatted = await format(content, {
            // 👈 直接调用 format
            ...config,
            filepath: filePath, // 关键：指定 filepath 以便 Prettier 自动加载对应的 Parser
          });

          // 5. 若有改动则写回文件
          if (content !== formatted) {
            await fs.writeFile(filePath, formatted, "utf-8");
            console.log(c.success(`✔ 已格式化: ${filePath}`));
          } else {
            console.log(c.dim(`➖ 无需修改: ${filePath}`));
          }
          successCount++;
        } catch (err) {
          errorCount++;
          console.error(
            c.error(`❌ 格式化失败 [${filePath}]:`),
            err instanceof Error ? err.message : err,
          );
        }
      }

      console.log(
        c.info(
          `\n🏁 格式化流程结束! 成功: ${c.success(String(successCount))} 个, 忽略/不适配: ${c.dim(String(ignoredCount))} 个, 失败: ${c.error(String(errorCount))} 个。`,
        ),
      );
    });
}
