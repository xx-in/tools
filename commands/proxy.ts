import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";

export function registerProxyCommand(program: Command) {
  program
    .command("proxy [action] [port]")
    .description(
      "管理终端临时代理 (支持 proxy on [port] 或 proxy off，无参数时查看当前状态)",
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
        // 👈 无参数时的检测逻辑
        const httpProxy =
          Deno.env.get("http_proxy") || Deno.env.get("HTTP_PROXY");
        const httpsProxy =
          Deno.env.get("https_proxy") || Deno.env.get("HTTPS_PROXY");
        const allProxy = Deno.env.get("all_proxy") || Deno.env.get("ALL_PROXY");

        if (httpProxy || httpsProxy || allProxy) {
          console.log(pc.yellow("🔍 [xx] 检测到当前终端已配置临时代理："));
          if (httpProxy) console.log(`  http_proxy  = ${pc.bold(httpProxy)}`);
          if (httpsProxy) console.log(`  https_proxy = ${pc.bold(httpsProxy)}`);
          if (allProxy) console.log(`  all_proxy   = ${pc.bold(allProxy)}`);
        } else {
          console.log(pc.green("🔍 [xx] 当前终端未配置任何代理 (直连模式)"));
        }
        console.log(
          pc.dim(
            "\n💡 提示：您可以使用 'xx proxy on [port]' 开启或 'xx proxy off' 关闭临时代理。",
          ),
        );
      }
    });
}
