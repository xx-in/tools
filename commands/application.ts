import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
import { dirname, resolve, join, basename } from "jsr:@std/path@^1.0.0";

function getHomeDir(): string {
  return Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || Deno.cwd();
}

// 快捷方式创建逻辑 (供单独调用或 install 命令调用)
export async function createShortcut(targetPath: string) {
  const home = getHomeDir();
  const applicationsDir = join(home, ".local/share/applications");

  let name = "";
  let execLine = "";
  let desktopFileName = "";

  const isFlatpak =
    !targetPath.includes("/") &&
    !targetPath.includes("\\") &&
    targetPath.split(".").length >= 3;

  if (isFlatpak) {
    const segments = targetPath.split(".");
    name = segments[segments.length - 1];
    execLine = `flatpak run ${targetPath}`;
    desktopFileName = `flatpak-${targetPath}.desktop`;
  } else {
    const absolutePath = resolve(Deno.cwd(), targetPath);

    try {
      const stat = await Deno.stat(absolutePath);
      if (!stat.isFile) {
        console.error(pc.red(`❌ 错误: '${targetPath}' 不是一个有效的文件。`));
        return;
      }
    } catch {
      console.error(pc.red(`❌ 错误: 找不到文件 '${targetPath}'。`));
      return;
    }

    const isAppImage = targetPath.toLowerCase().endsWith(".appimage");
    name = basename(absolutePath, isAppImage ? ".AppImage" : "");

    try {
      await Deno.chmod(absolutePath, 0o755);
    } catch {
      // ignore
    }

    execLine = isAppImage
      ? `"${absolutePath}" --no-sandbox`
      : `"${absolutePath}"`;
    desktopFileName = `${name.replace(/\s+/g, "-").toLowerCase()}.desktop`;
  }

  const desktopFilePath = join(applicationsDir, desktopFileName);
  const desktopContent = `[Desktop Entry]
Name=${name}
Exec=${execLine}
Type=Application
Terminal=false
Categories=Utility;
`;

  try {
    await Deno.mkdir(applicationsDir, { recursive: true });
    await Deno.writeTextFile(desktopFilePath, desktopContent);
    console.log(pc.green(`✔ 快捷方式已创建: ${desktopFilePath}`));
    console.log(pc.dim(`启动命令: ${execLine}`));
  } catch (err) {
    console.error(
      pc.red("❌ 创建快捷方式失败:"),
      err instanceof Error ? err.message : err,
    );
  }
}

// 本地 DEB 包安装逻辑
async function installDeb(absPath: string) {
  console.log(pc.cyan(`📦 正在安装 DEB 软件包: ${absPath}...`));
  const command = new Deno.Command("sudo", {
    args: ["dpkg", "-i", absPath],
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await command.spawn().status;
  if (status.success) {
    console.log(pc.green("✔ DEB 安装包部署成功！"));
  } else {
    console.error(pc.red(`❌ 安装失败，进程退出码: ${status.code}`));
  }
}

// 绿色软件解压与快捷方式全自动配置逻辑
async function installTarGz(absPath: string) {
  const home = getHomeDir();
  if (!home) {
    console.error(pc.red("❌ 错误: 无法获取用户根目录。"));
    return;
  }

  const greenAppDir = join(home, "GreenApp");
  const folderName = basename(absPath, ".tar.gz").replace(".tar", "");
  const destDir = join(greenAppDir, folderName);

  try {
    await Deno.mkdir(destDir, { recursive: true });
    console.log(pc.cyan(`📦 正在解压绿色软件至: ${destDir}...`));

    const tarCommand = new Deno.Command("tar", {
      args: ["-xzf", absPath, "-C", destDir],
      stdout: "inherit",
      stderr: "inherit",
    });
    const tarStatus = await tarCommand.spawn().status;

    if (!tarStatus.success) {
      console.error(pc.red("❌ 解压失败。"));
      return;
    }

    console.log(
      pc.green("✔ 解压完成。正在扫描主执行文件以自动配置快捷方式..."),
    );

    let exePath = "";
    for await (const entry of Deno.readDir(destDir)) {
      if (entry.isFile) {
        const fullPath = join(destDir, entry.name);
        const stat = await Deno.stat(fullPath);
        const isExecutable = stat.mode ? (stat.mode & 0o111) !== 0 : false;

        if (
          isExecutable &&
          !entry.name.endsWith(".sh") &&
          !entry.name.endsWith(".so")
        ) {
          exePath = fullPath;
          break;
        }
      }
    }

    if (exePath) {
      console.log(pc.cyan(`🔍 发现可执行二进制文件: ${exePath}`));
      await createShortcut(exePath);
    } else {
      console.log(
        pc.yellow(
          "⚠️ 未能在根目录下定位到明确的可执行文件，请后续手动调用 shortcut 子命令。",
        ),
      );
    }
  } catch (err) {
    console.error(
      pc.red("❌ 安装失败:"),
      err instanceof Error ? err.message : err,
    );
  }
}

// 卸载包逻辑
async function removeDeb(packageName: string) {
  console.log(pc.cyan(`📦 正在卸载 DEB 软件包: ${packageName}...`));
  const command = new Deno.Command("sudo", {
    args: ["apt-get", "remove", "-y", packageName],
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await command.spawn().status;
  if (status.success) {
    console.log(pc.green(`✔ 软件包 ${packageName} 已成功从系统中移除。`));
  } else {
    console.error(pc.red(`❌ 卸载失败，退出码: ${status.code}`));
  }
}

export function registerApplicationCommand(program: Command) {
  // 1. 创建一级命令 "application" [3]
  const appCmd = program
    .command("application")
    .description("Linux 桌面应用辅助管理工具 (快捷方式、本地包安装及卸载)");

  // 2. 在 application 下嵌套二级子命令 [3]
  appCmd
    .command("shortcut <path>")
    .description("为 AppImage、Flatpak ID 或二进制文件创建 Linux 桌面快捷方式")
    .action(async (path: string) => {
      await createShortcut(path);
    });

  appCmd
    .command("install <path>")
    .description(
      "安装软件（支持本地 .deb 格式，或 .tar.gz 绿色软件解压安装并创建图标）",
    )
    .action(async (path: string) => {
      if (!path) {
        console.error(pc.red("❌ 请提供安装包路径。"));
        return;
      }

      const absPath = resolve(Deno.cwd(), path);
      try {
        await Deno.stat(absPath);
      } catch {
        console.error(pc.red(`❌ 错误: 找不到文件 '${path}'。`));
        return;
      }

      const lowerPath = path.toLowerCase();
      if (lowerPath.endsWith(".deb")) {
        await installDeb(absPath);
      } else if (lowerPath.endsWith(".tar.gz") || lowerPath.endsWith(".tgz")) {
        await installTarGz(absPath);
      } else {
        console.error(
          pc.red("❌ 暂不支持的安装包格式。仅支持 .deb 与 .tar.gz"),
        );
      }
    });

  appCmd
    .command("remove <package>")
    .description(
      "卸载 DEB 软件包（支持直接输入软件包名，或传入本地 .deb 文件路径自动解析）",
    )
    .action(async (pkg: string) => {
      if (!pkg) {
        console.error(pc.red("❌ 请提供要卸载的软件包名称。"));
        return;
      }

      let packageName = pkg;

      if (pkg.toLowerCase().endsWith(".deb")) {
        const absPath = resolve(Deno.cwd(), pkg);
        try {
          const stat = await Deno.stat(absPath);
          if (stat.isFile) {
            console.log(
              pc.cyan(`🔍 检测到输入为本地 DEB 文件，正在读取包名...`),
            );
            const dpkgCmd = new Deno.Command("dpkg-deb", {
              args: ["-f", absPath, "Package"],
            });
            const { success, stdout } = await dpkgCmd.output();
            if (success) {
              packageName = new TextDecoder().decode(stdout).trim();
              console.log(pc.green(`✔ 解析成功，包名为: ${packageName}`));
            }
          }
        } catch {
          // 忽略异常，作为纯包名处理
        }
      }

      await removeDeb(packageName);
    });
}
