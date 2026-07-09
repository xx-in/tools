import { Command } from "commander";
import c from "../utils/colors.ts";
import {
  ensureSupportedDesktopOS,
  listInstalledApps,
  removeInstalledApp,
} from "../utils/macos-apps.ts";

export function registerUninstallCommand(program: Command) {
  program
    .command("uninstall <package>")
    .description("macOS/Windows 本地工具卸载器（移除安装目录和终端命令入口）")
    .action(async (pkg: string) => {
      if (!ensureSupportedDesktopOS()) return;
      if (!pkg) {
        console.error(c.error("❌ 请提供要卸载的应用名。"));
        return;
      }

      const removed = await removeInstalledApp(pkg);
      if (removed) {
        console.log(c.success("✨ 卸载完成！相关终端命令入口也已清理。"));
        return;
      }

      const candidates = (await listInstalledApps()).filter((name) =>
        name.toLowerCase().includes(pkg.toLowerCase()),
      );

      if (candidates.length > 0) {
        console.log(c.warn("❌ 未找到精确匹配的已安装应用。"));
        console.log(c.info("你可能想卸载以下项目："));
        for (const candidate of candidates) {
          console.log(
            `  - ${candidate}  ${c.dim(`(xx uninstall ${candidate})`)}`,
          );
        }
      } else {
        console.error(
          c.error(`❌ 未找到已安装应用 '${pkg}'。请先运行 xx install 安装。`),
        );
      }
    });
}
