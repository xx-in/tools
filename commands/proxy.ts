import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";

export function registerProxyCommand(program: Command) {
  program
    .command("proxy [action] [port]")
    .description(
      "管理终端临时代理 (支持 proxy on [port] 或 proxy off，默认端口 7890)",
    )
    .action((action: string | undefined, port: string | undefined) => {
      if (action === "on") {
        const p = port || "7890";
        console.log(
          pc.yellow(
            `⚠️  警告: 直接运行二进制无法直接修改当前终端的主环境变量。`,
          ),
        );
        console.log(pc.cyan(`👉 请运行以下命令来手动启用代理：`));
        console.log(pc.bold(`   export http_proxy="http://127.0.0.1:${p}"`));
        console.log(pc.bold(`   export https_proxy="http://127.0.0.1:${p}"`));
        console.log(pc.bold(`   export all_proxy="socks5://127.0.0.1:${p}"`));
        console.log(
          pc.dim(
            `\n💡 提示：执行一次 'xx completion' 并重开终端后，即可直接运行 'xx proxy on' 一键开启！`,
          ),
        );
      } else if (action === "off") {
        console.log(
          pc.yellow(
            `⚠️  警告: 直接运行二进制无法直接修改当前终端的主环境变量。`,
          ),
        );
        console.log(pc.cyan(`👉 请运行以下命令来手动关闭代理：`));
        console.log(
          pc.bold(
            `   unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY`,
          ),
        );
      } else {
        console.log(pc.cyan("💡 终端临时代理工具。用法："));
        console.log("  xx proxy on [port]  - 开启代理 (默认端口 7890)");
        console.log("  xx proxy off        - 关闭代理");
      }
    });
}
