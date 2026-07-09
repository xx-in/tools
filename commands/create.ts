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
import { dirname, resolve } from "node:path";

export function registerCreateCommand(program: Command) {
  program
    .command("create <paths...>")
    .alias("touch")
    .description("递归创建多个文件或目录（以 / 结尾则创建目录，否则创建文件）")
    .action(async (paths: string[]) => {
      if (!paths || paths.length === 0) {
        console.error(c.error("❌ 请提供至少一个要创建的路径"));
        return;
      }

      for (const targetPath of paths) {
        // 1. 判断用户意图：是否以斜杠结尾
        const isDir = targetPath.endsWith("/") || targetPath.endsWith("\\");
        // 2. 解析为绝对路径
        const absolutePath = resolve(process.cwd(), targetPath);

        try {
          if (isDir) {
            // 创建目录
            await fs.mkdir(absolutePath, { recursive: true });
            console.log(c.success(`✨ 成功递归创建目录: ${absolutePath}`));
          } else {
            // 创建文件：先确保其父级目录存在
            const parentDir = dirname(absolutePath);
            await fs.mkdir(parentDir, { recursive: true });

            // 检查文件是否已存在，避免意外覆盖
            try {
              await fs.stat(absolutePath);
              console.log(c.warn(`⚠️  文件已存在: ${absolutePath}`));
            } catch (err) {
              if (isNotFoundError(err)) {
                await fs.writeFile(absolutePath, "", "utf-8");
                console.log(c.success(`✨ 成功创建文件: ${absolutePath}`));
              } else {
                throw err;
              }
            }
          }
        } catch (err) {
          console.error(
            c.error(`❌ 创建失败 [${targetPath}]:`),
            err instanceof Error ? err.message : err,
          );
        }
      }
    });
}
