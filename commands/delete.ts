import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
import { resolve, join } from "jsr:@std/path@^1.0.0";

function getHomeDir(): string {
  return Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || Deno.cwd();
}

// 卸载 DEB 包
async function removeDeb(packageName: string) {
  console.log(pc.cyan(`📦 正在通过 apt 卸载 DEB 软件包: ${packageName}...`));
  const command = new Deno.Command("sudo", {
    args: ["apt-get", "remove", "-y", packageName],
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await command.spawn().status;
  if (status.success) {
    console.log(pc.green(`✔ 软件包 ${packageName} 已成功从系统中移除。`));
  } else {
    console.error(pc.red(`❌ 卸载失败，进程退出码: ${status.code}`));
  }
}

// 卸载 RPM 包
async function removeRpm(packageName: string) {
  console.log(pc.cyan(`📦 正在通过 dnf 卸载 RPM 软件包: ${packageName}...`));
  const command = new Deno.Command("sudo", {
    args: ["dnf", "remove", "-y", packageName],
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await command.spawn().status;
  if (status.success) {
    console.log(pc.green(`✔ 软件包 ${packageName} 已成功从系统中移除。`));
  } else {
    console.error(pc.red(`❌ 卸载失败，进程退出码: ${status.code}`));
  }
}

// 智能卸载绿色软件（彻底清理 GreenApp 文件夹以及对应的桌面 .desktop 图标）
async function removeGreenApp(appName: string): Promise<boolean> {
  const home = getHomeDir();
  const greenAppPath = join(home, "GreenApp", appName);

  try {
    const stat = await Deno.stat(greenAppPath);
    if (!stat.isDirectory) return false;
  } catch {
    return false; // 并非绿色软件文件夹
  }

  console.log(
    pc.cyan(`📦 发现绿色应用目录: ${greenAppPath}，正在执行卸载流程...`),
  );

  // 1. 深度检索并清理对应的 .desktop 快捷方式
  const applicationsDir = join(home, ".local/share/applications");
  try {
    for await (const entry of Deno.readDir(applicationsDir)) {
      if (entry.isFile && entry.name.endsWith(".desktop")) {
        const filePath = join(applicationsDir, entry.name);
        const content = await Deno.readTextFile(filePath);
        // 如果快捷方式中包含了该绿色软件路径或名称，判定其关联，进行删除
        if (content.includes(greenAppPath) || content.includes(appName)) {
          await Deno.remove(filePath);
          console.log(pc.green(`✔ 已清除桌面快捷图标: ${filePath}`));
        }
      }
    }
  } catch {
    // 忽略 applications 目录找不到的场景
  }

  // 2. 物理清除绿色文件夹
  try {
    await Deno.remove(greenAppPath, { recursive: true });
    console.log(pc.green(`✔ 已成功清除绿色软件主体目录。`));
    return true;
  } catch (err) {
    console.error(
      pc.red(`❌ 清除软件主体目录失败:`),
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

export function registerDeleteCommand(program: Command) {
  program
    .command("delete <package>") // 👈 统一注册为 xx delete <package> 命令
    .description("通用应用卸载器（支持包名、本地包文件路径、或绿色软件目录名）")
    .action(async (pkg: string) => {
      if (!pkg) {
        console.error(
          pc.red("❌ 请提供要卸载的软件包名称、本地安装包或绿色软件目录名。"),
        );
        return;
      }

      // A. 优先尝试识别并卸载 GreenApp
      const isGreenAppRemoved = await removeGreenApp(pkg);
      if (isGreenAppRemoved) {
        console.log(pc.green("✨ 绿色应用及桌面快捷方式清理完成！"));
        return;
      }

      let packageName = pkg;
      const lowerPkg = pkg.toLowerCase();

      // B. 智能解析本地 DEB 文件获取包名并卸载
      if (lowerPkg.endsWith(".deb")) {
        const absPath = resolve(Deno.cwd(), pkg);
        try {
          const stat = await Deno.stat(absPath);
          if (stat.isFile) {
            console.log(
              pc.cyan(`🔍 检测到本地 DEB 安装包，正在深度提取包名...`),
            );
            const dpkgCmd = new Deno.Command("dpkg-deb", {
              args: ["-f", absPath, "Package"],
            });
            const { success, stdout } = await dpkgCmd.output();
            if (success) {
              packageName = new TextDecoder().decode(stdout).trim();
              console.log(pc.green(`✔ 成功提取到底层包名: ${packageName}`));
            }
          }
        } catch {
          // ignore
        }
        await removeDeb(packageName);
        return;
      }

      // C. 智能解析本地 RPM 文件获取包名并卸载
      if (lowerPkg.endsWith(".rpm")) {
        const absPath = resolve(Deno.cwd(), pkg);
        try {
          const stat = await Deno.stat(absPath);
          if (stat.isFile) {
            console.log(
              pc.cyan(`🔍 检测到本地 RPM 安装包，正在深度提取包名...`),
            );
            const rpmCmd = new Deno.Command("rpm", {
              args: ["-qp", "--queryformat", "%{NAME}", absPath],
            });
            const { success, stdout } = await rpmCmd.output();
            if (success) {
              packageName = new TextDecoder().decode(stdout).trim();
              console.log(pc.green(`✔ 成功提取到底层包名: ${packageName}`));
            }
          }
        } catch {
          // ignore
        }
        await removeRpm(packageName);
        return;
      }

      // D. 分发卸载常规系统级包
      const osType = Deno.build.os;
      if (osType === "linux") {
        try {
          const osRelease = await Deno.readTextFile("/etc/os-release");
          if (
            osRelease.includes("fedora") ||
            osRelease.includes("rhel") ||
            osRelease.includes("centos")
          ) {
            await removeRpm(packageName);
          } else {
            await removeDeb(packageName);
          }
        } catch {
          await removeDeb(packageName);
        }
      } else {
        console.error(
          pc.red("❌ 当前应用卸载指令仅支持在 Linux 系统环境下运行。"),
        );
      }
    });
}
