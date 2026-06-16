import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
import { autoInstallCompletion } from "./completion.ts"; // 👈 引入补全脚本写入逻辑

export function registerUpgradeCommand(program: Command) {
  program
    .command("upgrade")
    .description("检查并自动更新 xx 命令行工具至最新版本")
    .action(async () => {
      console.log(pc.cyan("🤖 正在为您检查并更新 xx 命令行工具..."));
      console.log(
        pc.dim(
          "执行命令: deno install --global -n xx -A -f jsr:@xxin/tools/bin\n",
        ),
      );

      try {
        const command = new Deno.Command("deno", {
          args: [
            "install",
            "--global",
            "-n",
            "xx",
            "-A",
            "-f",
            "jsr:@xxin/tools/bin",
          ],
          stdout: "inherit",
          stderr: "inherit",
        });

        const process = command.spawn();
        const status = await process.status;

        if (status.success) {
          // 👈 覆盖重装二进制成功后，直接强制执行补全文件的写入（无视之前是否存在，强行刷新）
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
            "\n❌ 无法执行更新命令，请确认系统环境变量中是否已正确配置 Deno。",
          ),
        );
        if (err instanceof Error) {
          console.error(pc.red("错误详情:"), err.message);
        }
      }
    });
}
