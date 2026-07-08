import { Command } from "commander";
import process from "node:process";
import packageJson from "./package.json" with { type: "json" };

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
import { registerProxyCommand } from "./commands/proxy.ts";
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
  .version(packageJson.version, "-V, --version", "显示版本号")
  .helpOption("-h, --help", "显示命令帮助")
  .addHelpCommand("help [command]", "显示指定命令的帮助信息");

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
registerProxyCommand(program);
registerRemoveCommand(program);
registerSearchCommand(program);
registerTanslateCommand(program);
registerUninstallCommand(program);
registerUnzipCommand(program);
registerUpgradeCommand(program);
registerZipCommand(program);

program.parse(process.argv);

if (process.argv.slice(2).length === 0) {
  program.outputHelp();
}
