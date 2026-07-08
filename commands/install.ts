import fs from "node:fs/promises";
import { Command } from "commander";
import pc from "picocolors";
import { resolve, join, basename } from "node:path";
import {
  createLinks,
  ensureBinDirOnPath,
  ensureSupportedDesktopOS,
  ensureToolDirectories,
  extractArchiveToDir,
  findExecutablesRecursively,
  getAppsDir,
  getShellReloadCommand,
  removeDirectoryContents,
  stripArchiveSuffix,
  writeManifest,
} from "../utils/macos-apps.ts";

function printReloadHint() {
  const reloadCommand = getShellReloadCommand();
  console.log(
    pc.yellow(`💡 如果当前终端还不能直接运行新命令，请执行: ${reloadCommand}`),
  );
}

async function installBinary(absPath: string) {
  const appName = basename(absPath);
  const installDir = join(getAppsDir(), appName);
  const targetDir = join(installDir, "bin");
  const targetPath = join(targetDir, appName);

  await fs.mkdir(targetDir, { recursive: true });
  await fs.copyFile(absPath, targetPath);
  await fs.chmod(targetPath, 0o755);

  const links = await createLinks(appName, [targetPath]);
  await writeManifest({
    appName,
    installDir,
    links,
    type: "binary",
  });

  console.log(pc.green(`✨ 安装成功！可直接在终端中运行: ${pc.bold(appName)}`));
  console.log(pc.cyan(`👉 卸载命令: ${pc.bold(`xx uninstall ${appName}`)}`));
  printReloadHint();
}

async function installArchive(absPath: string) {
  const appName = stripArchiveSuffix(absPath);
  const installDir = join(getAppsDir(), appName);

  await removeDirectoryContents(installDir);
  console.log(pc.cyan(`📦 正在解压软件包至: ${installDir}...`));

  const extracted = await extractArchiveToDir(absPath, installDir);
  if (!extracted) {
    console.error(
      pc.red("❌ 当前仅支持 .tar.gz、.tgz、.tar.xz、.txz、.tar 格式。"),
    );
    return;
  }

  const executables = await findExecutablesRecursively(installDir);
  if (executables.length === 0) {
    console.error(pc.red("❌ 解压完成，但未找到可执行文件。"));
    return;
  }

  const links = await createLinks(appName, executables);
  await writeManifest({
    appName,
    installDir,
    links,
    type: "archive",
  });

  console.log(
    pc.green(`✨ 安装成功！可直接在终端中运行: ${pc.bold(links.join(", "))}`),
  );
  console.log(pc.cyan(`👉 卸载命令: ${pc.bold(`xx uninstall ${appName}`)}`));
  printReloadHint();
}

export function registerInstallCommand(program: Command) {
  program
    .command("install [path]")
    .description(
      "macOS/Windows 本地工具安装器（支持可执行文件、.zip、.tar.gz、.tgz、.tar.xz、.txz、.tar）",
    )
    .action(async (target: string | undefined) => {
      if (!ensureSupportedDesktopOS()) return;
      if (!target) {
        console.error(pc.red("❌ 请提供有效的本地文件路径。"));
        return;
      }

      const absPath = resolve(process.cwd(), target);
      try {
        const stat = await fs.stat(absPath);
        if (!stat.isFile()) {
          console.error(pc.red(`❌ 错误: '${target}' 不是一个有效的文件。`));
          return;
        }
      } catch {
        console.error(pc.red(`❌ 错误: 找不到指定文件或包路径 '${target}'。`));
        return;
      }

      await ensureToolDirectories();
      await ensureBinDirOnPath();

      const lowerPath = target.toLowerCase();
      if (
        lowerPath.endsWith(".zip") ||
        lowerPath.endsWith(".tar.gz") ||
        lowerPath.endsWith(".tgz") ||
        lowerPath.endsWith(".tar.xz") ||
        lowerPath.endsWith(".txz") ||
        lowerPath.endsWith(".tar")
      ) {
        await installArchive(absPath);
      } else {
        await installBinary(absPath);
      }
    });
}
