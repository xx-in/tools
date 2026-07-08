import { spawnCommand } from "../utils/spawn.ts";
import { Command } from "commander";
import pc from "picocolors";
import { autoInstallCompletion } from "./completion.ts";

export function registerUpgradeCommand(program: Command) {
  program
    .command("upgrade")
    .description("检查并自动更新 xx 命令行工具至最新版本")
    .option("-r, --registry", "强制使用 npm 官方源 https://registry.npmjs.org/")
    .action(async (options: { registry?: boolean }) => {
      const args = ["install", "-g"];
      if (options.registry) {
        args.push("--registry=https://registry.npmjs.org/");
      }
      args.push("@xx-in/tools@latest");

      console.log(pc.cyan("🤖 正在为您检查并更新 xx 命令行工具..."));
      console.log(pc.dim(`执行命令: npm ${args.join(" ")}\n`));

      try {
        const status = await spawnCommand("npm", args);

        if (status.success) {
          console.log(
            pc.cyan("\n🤖 正在为您强制覆盖并刷新终端自动补全脚本..."),
          );
          await autoInstallCompletion();
          console.log(
            pc.green("\n✨ xx 自动更新并重刷补全成功！已成功加载最新版本。"),
          );
        } else {
          console.error(
            pc.red(`\n❌ 更新失败，退出代码 (Exit Code): ${status.code}`),
          );
        }
      } catch (err) {
        console.error(
          pc.red(
            "\n❌ 无法执行更新命令，请确认系统环境变量中是否已正确配置 Node.js 与 npm。",
          ),
        );
        if (err instanceof Error) {
          console.error(pc.red("错误详情:"), err.message);
        }
      }
    });
}
