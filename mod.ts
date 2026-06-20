#!/usr/bin/env deno

import { Command } from "npm:commander@^11.0.0";
import process from "node:process";

// 使用静态 JSON 导入安全地动态读取配置
import denoConfig from "./deno.json" with { type: "json" };

// --- 按 A-Z 字母顺序导入所有子命令模块 ---
import { registerCompletionCommand } from "./commands/completion.ts";
import { registerCopyCommand } from "./commands/copy.ts";
import { registerCreateCommand } from "./commands/create.ts";
import { registerFormatCommand } from "./commands/format.ts";
import { registerInstallCommand } from "./commands/install.ts";
import { registerIpCommand } from "./commands/ip.ts";
import { registerLsCommand } from "./commands/list.ts";
import { registerMoveCommand } from "./commands/move.ts";
import { registerOpenCommand } from "./commands/open.ts";
import { registerParkCommand } from "./commands/park.ts";
import { registerProxyCommand } from "./commands/proxy.ts"; // 👈 新增引入
import { registerRemoveCommand } from "./commands/remove.ts";
import { registerSearchCommand } from "./commands/search.ts";
import { registerTanslateCommand } from "./commands/translate.ts";
import { registerUninstallCommand } from "./commands/uninstall.ts";
import { registerUnzipCommand } from "./commands/unzip.ts";
import { registerUpgradeCommand } from "./commands/upgrade.ts";
import { registerZipCommand } from "./commands/zip.ts";

const program = new Command();

program
  .name("xx")
  .description("一个实用的多功能系统命令行工具")
  .version(denoConfig.version, "-V, --version", "显示版本号")
  .helpOption("-h, --help", "显示命令帮助")
  .addHelpCommand("help [command]", "显示指定命令的帮助信息");

// --- 按 A-Z 字母顺序依次注册子命令 ---
registerCompletionCommand(program);
registerCopyCommand(program);
registerCreateCommand(program);
registerFormatCommand(program);
registerInstallCommand(program);
registerIpCommand(program);
registerLsCommand(program);
registerMoveCommand(program);
registerOpenCommand(program);
registerParkCommand(program);
registerProxyCommand(program); // 👈 新增注册
registerRemoveCommand(program);
registerSearchCommand(program);
registerTanslateCommand(program);
registerUninstallCommand(program);
registerUnzipCommand(program);
registerUpgradeCommand(program);
registerZipCommand(program);

// 解析命令行参数并执行
program.parse(process.argv);

// 如果未输入任何命令，则输出帮助信息
if (Deno.args.length === 0) {
  program.outputHelp();
}
