import { Command } from "commander";
import c from "../utils/colors.ts";
import process from "node:process";
import { findInPath } from "../utils/which.ts";

export function registerWhichCommand(program: Command) {
  program
    .command("which [cmd]")
    .description(
      "查找命令在 PATH 中的位置（跨平台 which，跳过 shell 函数/别名）",
    )
    .option("-a", "列出 PATH 中所有匹配项（等同 which -a）")
    .action((cmd: string | undefined, options: { a?: boolean }) => {
      const target = cmd?.trim();
      if (!target) {
        console.error(c.error("❌ 请提供要查找的命令名，例如: xx which node"));
        process.exitCode = 1;
        return;
      }

      const paths = findInPath(target, { all: options.a });

      if (paths.length === 0) {
        process.exitCode = 1;
        return;
      }

      for (const resolvedPath of paths) {
        console.log(c.accent(resolvedPath));
      }
    });
}
