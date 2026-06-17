import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
import { dirname, resolve, join, basename } from "jsr:@std/path@^1.0.0";

function getHomeDir(): string {
  return Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || Deno.cwd();
}

// 核心快捷方式生成函数 (供直接调用或安装后自动调用)
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

// AppImage 绿色部署逻辑
async function installAppImage(absPath: string) {
  const home = getHomeDir();
  const greenAppDir = join(home, "GreenApp");
  const fileName = basename(absPath);
  const destPath = join(greenAppDir, fileName);

  try {
    await Deno.mkdir(greenAppDir, { recursive: true });
    console.log(
      pc.cyan(`📦 正在将 AppImage 部署至绿色软件目录: ${destPath}...`),
    );
    await Deno.copyFile(absPath, destPath);
    await Deno.chmod(destPath, 0o755); // 赋予执行权限
    await createShortcut(destPath);
    console.log(pc.green(`✨ AppImage 部署完成！`));
  } catch (err) {
    console.error(
      pc.red("❌ AppImage 部署失败:"),
      err instanceof Error ? err.message : err,
    );
  }
}

// DEB 本地包安装
async function installDeb(absPath: string) {
  console.log(pc.cyan(`📦 正在通过 dpkg 本地安装 DEB 软件包: ${absPath}...`));
  const command = new Deno.Command("sudo", {
    args: ["dpkg", "-i", absPath],
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await command.spawn().status;
  if (status.success) {
    console.log(pc.green("✔ DEB 软件包部署成功！"));
  } else {
    console.error(pc.red(`❌ 安装失败，进程退出码: ${status.code}`));
  }
}

// RPM 本地包安装
async function installRpm(absPath: string) {
  console.log(pc.cyan(`📦 正在通过 dnf 本地安装 RPM 软件包: ${absPath}...`));
  const command = new Deno.Command("sudo", {
    args: ["dnf", "install", "-y", absPath],
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await command.spawn().status;
  if (status.success) {
    console.log(pc.green("✔ RPM 软件包部署成功！"));
  } else {
    console.error(pc.red(`❌ 安装失败，进程退出码: ${status.code}`));
  }
}

// tar.gz 绿色包解压并智能生成图标
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
          "⚠️ 未能在解压目录下定位到明确的可执行二进制文件，请后续手动为其创建快捷方式。",
        ),
      );
    }
  } catch (err) {
    console.error(
      pc.red("❌ 绿色软件安装失败:"),
      err instanceof Error ? err.message : err,
    );
  }
}

export function registerInstallCommand(program: Command) {
  program
    .command("install [path]") // 👈 统一注册为 xx install [path] 命令
    .description(
      "通用应用部署安装（自动分发适配 AppImage、Flatpak ID、tar.gz、deb 及 rpm 格式包）",
    )
    .action(async (target: string | undefined) => {
      if (!target) {
        console.error(pc.red("❌ 请提供有效的安装包文件路径或 Flatpak ID。"));
        return;
      }

      // 1. 判断是否为 Flatpak ID
      const isFlatpak =
        !target.includes("/") &&
        !target.includes("\\") &&
        target.split(".").length >= 3;
      if (isFlatpak) {
        await createShortcut(target);
        return;
      }

      // 2. 本地文件解析逻辑
      const absPath = resolve(Deno.cwd(), target);
      try {
        await Deno.stat(absPath);
      } catch {
        console.error(pc.red(`❌ 错误: 找不到指定文件或包路径 '${target}'。`));
        return;
      }

      const lowerPath = target.toLowerCase();
      if (lowerPath.endsWith(".appimage")) {
        await installAppImage(absPath);
      } else if (lowerPath.endsWith(".deb")) {
        await installDeb(absPath);
      } else if (lowerPath.endsWith(".rpm")) {
        await installRpm(absPath);
      } else if (lowerPath.endsWith(".tar.gz") || lowerPath.endsWith(".tgz")) {
        await installTarGz(absPath);
      } else {
        console.log(
          pc.cyan(`📦 检测到通用本地可执行文件，正在直接为其配置桌面图标...`),
        );
        await createShortcut(absPath);
      }
    });
}
