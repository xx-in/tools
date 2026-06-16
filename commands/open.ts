import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
import { resolve } from "jsr:@std/path@^1.0.0";

export function registerOpenCommand(program: Command) {
  program
    .command("open [path]")
    .description("在系统文件管理器中打开指定目录（默认当前工作目录）")
    .action(async (targetPath: string | undefined) => {
      const inputPath = targetPath || ".";
      const absolutePath = resolve(Deno.cwd(), inputPath);

      // 验证目标路径是否存在且确实是一个目录
      try {
        const stat = await Deno.stat(absolutePath);
        if (!stat.isDirectory) {
          console.error(pc.red(`❌ 错误: '${inputPath}' 不是一个有效的目录。`));
          return;
        }
      } catch {
        console.error(pc.red(`❌ 错误: 找不到目录 '${inputPath}'。`));
        return;
      }

      const os = Deno.build.os;
      let cmd = "";
      let args: string[] = [];

      // 根据平台分发打开管理器指令
      if (os === "darwin") {
        cmd = "open";
        args = [absolutePath];
      } else if (os === "windows") {
        cmd = "explorer";
        args = [absolutePath];
      } else if (os === "linux") {
        cmd = "xdg-open";
        args = [absolutePath];
      } else {
        console.error(pc.red("❌ 暂不支持在当前系统下调起文件管理器。"));
        return;
      }

      try {
        console.log(pc.cyan(`📂 正在打开文件夹: ${absolutePath}...`));
        const command = new Deno.Command(cmd, {
          args: args,
          stdout: "null",
          stderr: "null",
        });
        await command.spawn().status;
        console.log(pc.green("✨ 成功调起文件管理器！"));
      } catch (err) {
        console.error(
          pc.red("❌ 无法打开管理器:"),
          err instanceof Error ? err.message : err,
        );
      }
    });
}
