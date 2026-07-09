import { Command } from "commander";
import c from "../utils/colors.ts";

function printProxyExports(port: string): void {
  const http = `http://127.0.0.1:${port}`;
  const socks = `socks5://127.0.0.1:${port}`;
  console.log(`export http_proxy="${http}"`);
  console.log(`export https_proxy="${http}"`);
  console.log(`export all_proxy="${socks}"`);
  console.log(`export HTTP_PROXY="${http}"`);
  console.log(`export HTTPS_PROXY="${http}"`);
  console.log(`export ALL_PROXY="${socks}"`);
}

function printProxyUnsets(): void {
  console.log(
    "unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY",
  );
}

function printProxyStatus(): void {
  const httpProxy = process.env["http_proxy"] || process.env["HTTP_PROXY"];
  const httpsProxy = process.env["https_proxy"] || process.env["HTTPS_PROXY"];
  const allProxy = process.env["all_proxy"] || process.env["ALL_PROXY"];

  if (httpProxy || httpsProxy || allProxy) {
    console.log(c.warn("🔍 [xx] 检测到当前终端已配置临时代理："));
    if (httpProxy)
      console.log(`  ${c.label("http_proxy")}  = ${c.value(httpProxy)}`);
    if (httpsProxy)
      console.log(`  ${c.label("https_proxy")} = ${c.value(httpsProxy)}`);
    if (allProxy)
      console.log(`  ${c.label("all_proxy")}   = ${c.value(allProxy)}`);
  } else {
    console.log(c.success("🔍 [xx] 当前终端未配置任何代理 (直连模式)"));
  }

  console.log(
    c.dim(
      '\n💡 开启: eval "$(xx proxy on -e)"  关闭: eval "$(xx proxy off -e)"',
    ),
  );
}

export function registerProxyCommand(program: Command) {
  program
    .command("proxy [action] [port]")
    .description(
      "管理终端临时代理 (proxy on/off 配合 -e 输出 eval 命令，无参数时查看状态)",
    )
    .option(
      "-e, --export",
      "输出供 eval 使用的 shell 命令到 stdout（不修改当前终端）",
    )
    .action(
      (
        action: string | undefined,
        port: string | undefined,
        options: { export?: boolean },
      ) => {
        if (action === "on") {
          const p = port || "7890";
          if (options.export) {
            printProxyExports(p);
            return;
          }

          console.log(c.info(`👉 在当前终端开启代理，请运行：`));
          console.log(
            c.command(`   eval "$(xx proxy on${port ? ` ${port}` : ""} -e)"`),
          );
          return;
        }

        if (action === "off") {
          if (options.export) {
            printProxyUnsets();
            return;
          }

          console.log(c.info(`👉 在当前终端关闭代理，请运行：`));
          console.log(c.command(`   eval "$(xx proxy off -e)"`));
          return;
        }

        printProxyStatus();
      },
    );
}
