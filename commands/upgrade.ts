import { spawnCommand } from "../utils/spawn.ts";
import {
  compareVersions,
  fetchRemoteVersionForManager,
  getCliRealPath,
  getLocalVersion,
  getManagerLabel,
  getUpgradeInstallEnv,
  getUpgradePlan,
  isRemoteNewer,
} from "../utils/package-manager.ts";
import { Command } from "commander";
import c from "../utils/colors.ts";
import { autoInstallCompletion } from "./completion.ts";

const INSTALL_RETRY_DELAYS_MS = [0, 60_000, 120_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runUpgradeInstall(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) {
  let lastStatus = { success: false, code: 1 as number | null };

  for (let attempt = 0; attempt < INSTALL_RETRY_DELAYS_MS.length; attempt++) {
    const delay = INSTALL_RETRY_DELAYS_MS[attempt];
    if (delay > 0) {
      console.log(
        c.dim(
          `\n新版本安装包可能仍在 npm 全球同步中，${delay / 1000} 秒后重试 (${attempt + 1}/${INSTALL_RETRY_DELAYS_MS.length})...`,
        ),
      );
      await sleep(delay);
    }

    lastStatus = await spawnCommand(command, args, { env });
    if (lastStatus.success) {
      return lastStatus;
    }
  }

  return lastStatus;
}

export function registerUpgradeCommand(program: Command) {
  program
    .command("upgrade")
    .description(
      "检查并自动更新 xx 命令行工具至最新版本（自动检测 npm / Bun / Deno 安装来源，使用 npm 官方源）",
    )
    .action(async () => {
      const plan = getUpgradePlan();
      const managerLabel = getManagerLabel(plan.manager);

      console.log(
        c.info(`🤖 检测到当前通过 ${managerLabel} 安装，正在检查更新...`),
      );

      if (!plan.canUpgrade) {
        console.error(c.warn(`\n⚠️ ${plan.hint}`));
        return;
      }

      const localVersion = getLocalVersion();
      if (!localVersion) {
        console.error(c.error("\n❌ 无法读取当前安装版本，已取消更新。"));
        console.error(
          c.dim(
            `尝试从 ${getCliRealPath() || process.argv[1] || "未知路径"} 向上查找 package.json。`,
          ),
        );
        return;
      }

      let remoteVersion: string;
      try {
        remoteVersion = await fetchRemoteVersionForManager(
          plan.manager,
          plan.registry,
        );
      } catch (err) {
        console.error(
          c.error("\n❌ 无法获取远程版本信息，已取消更新。"),
          err instanceof Error ? err.message : err,
        );
        return;
      }

      console.log(
        c.dim(
          `当前版本: ${localVersion}  |  远程版本: ${remoteVersion}  |  源: ${plan.registry}`,
        ),
      );

      if (compareVersions(remoteVersion, localVersion) < 0) {
        console.log(
          c.warn(
            `\n⚠️ 远程版本 (${remoteVersion}) 低于当前本地版本 (${localVersion})，已跳过更新，避免降级覆盖。`,
          ),
        );
        return;
      }

      if (!isRemoteNewer(remoteVersion, localVersion)) {
        console.log(
          c.success(`\n✅ 当前已是最新版本 (${localVersion})，无需更新。`),
        );
        return;
      }

      const installPlan = getUpgradePlan({ targetVersion: remoteVersion });

      console.log(c.bold(c.info(`\n⬆️  即将升级至 ${remoteVersion}`)));
      console.log(c.dim(`当前版本: ${localVersion}`));
      console.log(
        c.dim(
          `执行命令: ${installPlan.command} ${installPlan.args.join(" ")}\n`,
        ),
      );

      try {
        const status = await runUpgradeInstall(
          installPlan.command,
          installPlan.args,
          getUpgradeInstallEnv(installPlan.registry!),
        );

        if (status.success) {
          console.log("\n正在刷新终端自动补全脚本...");
          await autoInstallCompletion({ fromUpgrade: true });
          console.log(`\nxx 已更新至 ${remoteVersion}。`);
        } else {
          console.error(
            c.error(`\n❌ 更新失败，退出代码 (Exit Code): ${status.code}`),
          );
          console.error(
            c.dim(
              "npm 版本元数据通常比安装包更早可用，请稍等几分钟后重试 xx upgrade。",
            ),
          );
        }
      } catch (err) {
        console.error(
          c.error(
            `\n❌ 无法执行 ${managerLabel} 更新命令，请确认 ${installPlan.command} 已正确安装并配置在 PATH 中。`,
          ),
        );
        if (err instanceof Error) {
          console.error(c.error("错误详情:"), err.message);
        }
      }
    });
}
