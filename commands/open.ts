import { spawnCommand } from "../utils/spawn.ts";
import fs from "node:fs/promises";
import { Command } from "commander";
import c from "../utils/colors.ts";
import { resolve } from "node:path";

export function registerOpenCommand(program: Command) {
  program
    .command("open [path]")
    .description("在系统文件管理器中打开指定目录（默认当前工作目录）")
    .action(async (targetPath: string | undefined) => {
      const inputPath = targetPath || ".";
      const absolutePath = resolve(process.cwd(), inputPath);

      // 验证目标路径是否存在且确实是一个目录
      try {
        const stat = await fs.stat(absolutePath);
        if (!stat.isDirectory()) {
          console.error(
            c.error(`❌ 错误: '${inputPath}' 不是一个有效的目录。`),
          );
          return;
        }
      } catch {
        console.error(c.error(`❌ 错误: 找不到目录 '${inputPath}'。`));
        return;
      }

      const os = process.platform;
      let cmd = "";
      let args: string[] = [];

      // 根据平台分发打开管理器指令
      if (os === "darwin") {
        cmd = "open";
        args = [absolutePath];
      } else if (os === "win32") {
        cmd = "explorer";
        args = [absolutePath];
      } else if (os === "linux") {
        cmd = "xdg-open";
        args = [absolutePath];
      } else {
        console.error(c.error("❌ 暂不支持在当前系统下调起文件管理器。"));
        return;
      }

      try {
        console.log(c.info(`📂 正在打开文件夹: ${absolutePath}...`));
        await spawnCommand(cmd, args);
        console.log(c.success("✨ 成功调起文件管理器！"));
      } catch (err) {
        console.error(
          c.error("❌ 无法打开管理器:"),
          err instanceof Error ? err.message : err,
        );
      }
    });
}
