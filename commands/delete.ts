import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
import { dirname, resolve, join, basename } from "jsr:@std/path@^1.0.0";

function getHomeDir(): string {
  return Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || Deno.cwd();
}

// 检查系统命令是否可用 (例如 which snap)
async function isCommandAvailable(cmd: string): Promise<boolean> {
  try {
    const command = new Deno.Command("which", { args: [cmd] });
    const { success } = await command.output();
    return success;
  } catch {
    return false;
  }
}

// 检查应用是否由 Snap 托管安装
async function isSnapInstalled(packageName: string): Promise<boolean> {
  if (!(await isCommandAvailable("snap"))) return false;
  try {
    const command = new Deno.Command("snap", { args: ["list", packageName] });
    const { success } = await command.output();
    return success;
  } catch {
    return false;
  }
}

// 检查是否为已安装的系统级 DEB/RPM 软件包
async function isSystemPackageInstalled(packageName: string): Promise<boolean> {
  try {
    const osRelease = await Deno.readTextFile("/etc/os-release");
    if (
      osRelease.includes("fedora") ||
      osRelease.includes("rhel") ||
      osRelease.includes("centos")
    ) {
      const cmd = new Deno.Command("rpm", { args: ["-q", packageName] });
      const { success } = await cmd.output();
      return success;
    } else {
      const cmd = new Deno.Command("dpkg-query", {
        args: ["-W", "-f=${Status}", packageName],
      });
      const { success, stdout } = await cmd.output();
      if (success) {
        const status = new TextDecoder().decode(stdout).trim();
        return status.includes("installed");
      }
      return false;
    }
  } catch {
    return false;
  }
}

// ---------------- 子系统模糊检索逻辑 ----------------

// A. 搜寻绿色应用候选
async function searchGreenApps(query: string): Promise<string[]> {
  const home = getHomeDir();
  const greenAppDir = join(home, "GreenApp");
  const candidates: string[] = [];
  try {
    for await (const entry of Deno.readDir(greenAppDir)) {
      if (entry.name.toLowerCase().includes(query.toLowerCase())) {
        // 去除 .AppImage 后缀以供清洁显示
        const cleanName = entry.name.replace(/\.appimage/i, "");
        candidates.push(cleanName);
      }
    }
  } catch {
    // 目录不存在
  }
  return candidates;
}

// B. 搜寻 Flatpak 候选
async function searchFlatpaks(
  query: string,
): Promise<{ id: string; name: string }[]> {
  const candidates: { id: string; name: string }[] = [];
  if (!(await isCommandAvailable("flatpak"))) return candidates;

  try {
    const command = new Deno.Command("flatpak", {
      args: ["list", "--columns=application,name"],
    });
    const { success, stdout } = await command.output();
    if (success) {
      const output = new TextDecoder().decode(stdout).trim();
      const lines = output.split("\n");
      for (const line of lines) {
        const parts = line.split("\t").map((p) => p.trim());
        if (parts.length >= 2) {
          const [id, name] = parts;
          if (
            id.toLowerCase().includes(query.toLowerCase()) ||
            name.toLowerCase().includes(query.toLowerCase())
          ) {
            candidates.push({ id, name });
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return candidates;
}

// C. 搜寻 Bash (Debian/Ubuntu) 软件包
async function searchDebPackages(query: string): Promise<string[]> {
  const pkgs: string[] = [];
  try {
    const command = new Deno.Command("dpkg-query", {
      args: ["-W", "-f=${Package}\n", `*${query}*`],
    });
    const { success, stdout } = await command.output();
    if (success) {
      const output = new TextDecoder().decode(stdout).trim();
      const lines = output.split("\n");
      for (const line of lines) {
        const name = line.trim();
        if (name && !name.startsWith("-f=")) {
          pkgs.push(name);
        }
      }
    }
  } catch {
    // ignore
  }
  return pkgs;
}

// D. 搜寻 RPM (Fedora/RHEL) 软件包
async function searchRpmPackages(query: string): Promise<string[]> {
  const pkgs: string[] = [];
  try {
    const command = new Deno.Command("rpm", {
      args: ["-qa", `*${query}*`],
    });
    const { success, stdout } = await command.output();
    if (success) {
      const output = new TextDecoder().decode(stdout).trim();
      const lines = output.split("\n");
      for (const line of lines) {
        const name = line.trim();
        if (name) {
          pkgs.push(name);
        }
      }
    }
  } catch {
    // ignore
  }
  return pkgs;
}

// ---------------- 系统级卸载指令 ----------------

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

// 卸载 Snap 软件包
async function removeSnap(packageName: string) {
  console.log(pc.cyan(`📦 正在通过 snap 卸载软件包: ${packageName}...`));
  const command = new Deno.Command("sudo", {
    args: ["snap", "remove", packageName],
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await command.spawn().status;
  if (status.success) {
    console.log(pc.green(`✔ Snap 软件包 ${packageName} 已成功从系统中移除。`));
  } else {
    console.error(pc.red(`❌ 卸载失败，进程退出码: ${status.code}`));
  }
}

// 智能卸载绿色软件
async function removeGreenApp(appName: string): Promise<boolean> {
  const home = getHomeDir();
  const greenAppDir = join(home, "GreenApp");

  let targetPath = "";

  const dirPath = join(greenAppDir, appName);
  try {
    const stat = await Deno.stat(dirPath);
    if (stat.isDirectory) targetPath = dirPath;
  } catch {
    // ignore
  }

  if (!targetPath) {
    const appImagePath = join(greenAppDir, `${appName}.AppImage`);
    const appImageLowerPath = join(greenAppDir, `${appName}.appimage`);
    try {
      const stat = await Deno.stat(appImagePath);
      if (stat.isFile) targetPath = appImagePath;
    } catch {
      try {
        const stat = await Deno.stat(appImageLowerPath);
        if (stat.isFile) targetPath = appImageLowerPath;
      } catch {
        // ignore
      }
    }
  }

  if (!targetPath && appName.toLowerCase().endsWith(".appimage")) {
    const directPath = join(greenAppDir, appName);
    try {
      const stat = await Deno.stat(directPath);
      if (stat.isFile) targetPath = directPath;
    } catch {
      // ignore
    }
  }

  if (!targetPath) return false;

  console.log(
    pc.cyan(`📦 发现绿色应用路径: ${targetPath}，正在执行卸载流程...`),
  );

  const applicationsDir = join(home, ".local/share/applications");
  try {
    for await (const entry of Deno.readDir(applicationsDir)) {
      if (entry.isFile && entry.name.endsWith(".desktop")) {
        const filePath = join(applicationsDir, entry.name);
        const content = await Deno.readTextFile(filePath);
        if (content.includes(targetPath) || content.includes(appName)) {
          await Deno.remove(filePath);
          console.log(pc.green(`✔ 已清除桌面快捷图标: ${filePath}`));
        }
      }
    }
  } catch {
    // ignore
  }

  try {
    await Deno.remove(targetPath, { recursive: true });
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
    .command("delete <package>")
    .description(
      "通用应用卸载器（支持模糊搜索推荐，可直接按包名、Flatpak、Snap或绿色应用卸载）",
    )
    .action(async (pkg: string) => {
      if (!pkg) {
        console.error(
          pc.red("❌ 请提供要卸载的软件包名称、安装包或绿色软件名。"),
        );
        return;
      }

      // 1. 精确判定一：绿色应用检测
      const isGreenAppRemoved = await removeGreenApp(pkg);
      if (isGreenAppRemoved) {
        console.log(pc.green("✨ 绿色应用及关联快捷方式清理完成！"));
        return;
      }

      // 2. 精确判定二：Flatpak ID 检测
      const isFlatpak =
        !pkg.includes("/") && !pkg.includes("\\") && pkg.split(".").length >= 3;
      if (isFlatpak) {
        if (await isCommandAvailable("flatpak")) {
          console.log(pc.cyan(`📦 正在通过 flatpak 卸载应用: ${pkg}...`));
          const command = new Deno.Command("flatpak", {
            args: ["uninstall", "-y", pkg],
            stdout: "inherit",
            stderr: "inherit",
          });
          const status = await command.spawn().status;
          if (status.success) {
            const home = getHomeDir();
            const desktopPath = join(
              home,
              ".local/share/applications",
              `flatpak-${pkg}.desktop`,
            );
            try {
              await Deno.remove(desktopPath);
              console.log(pc.green(`✔ 已清除 Flatpak 关联桌面快捷图标。`));
            } catch {
              /* ignore */
            }
            console.log(pc.green("✨ Flatpak 应用及图标清理完成！"));
          }
        } else {
          console.error(pc.red("❌ 当前系统中未检测到已安装的 flatpak 工具。"));
        }
        return;
      }

      // 3. 检查输入是否为本地安装文件路径，是的话智能提取其底层包名
      let packageName = pkg;
      const lowerPkg = pkg.toLowerCase();

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
          /* ignore */
        }
      } else if (lowerPkg.endsWith(".rpm")) {
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
          /* ignore */
        }
      }

      // 4. 精确判定三：Snap 托管包检测
      if (await isSnapInstalled(packageName)) {
        await removeSnap(packageName);
        return;
      }

      // 5. 精确判定四：常规系统包检测
      if (await isSystemPackageInstalled(packageName)) {
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
        return;
      }

      // 6. ⚠️ 终极退守：如果名字没有被任何系统或目录精准匹配，启动【全自动模糊检索与卸载推荐】
      console.log(
        pc.yellow(`\n🔍 未能在系统中找到精确名为 "${pkg}" 的已安装应用。`),
      );
      console.log(pc.dim("正在为您进行全系统模糊搜索，请稍候...\n"));

      const [greenCands, flatpakCands, snapCands] = await Promise.all([
        searchGreenApps(pkg),
        searchFlatpaks(pkg),
        isCommandAvailable("snap")
          ? (async () => {
              // 仅在有 snap 环境时搜索，避免重复读取无用信息
              const candidates: string[] = [];
              try {
                const command = new Deno.Command("snap", { args: ["list"] });
                const { success, stdout } = await command.output();
                if (success) {
                  const lines = new TextDecoder().decode(stdout).split("\n");
                  for (let i = 1; i < lines.length; i++) {
                    const name = lines[i].trim().split(/\s+/)[0];
                    if (
                      name &&
                      name.toLowerCase().includes(pkg.toLowerCase())
                    ) {
                      candidates.push(name);
                    }
                  }
                }
              } catch {
                /* ignore */
              }
              return candidates;
            })()
          : Promise.resolve([]),
      ]);

      // 系统包模糊匹配搜索 (按操作系统智能区分)
      let systemCands: string[] = [];
      try {
        const osRelease = await Deno.readTextFile("/etc/os-release");
        if (
          osRelease.includes("fedora") ||
          osRelease.includes("rhel") ||
          osRelease.includes("centos")
        ) {
          systemCands = await searchRpmPackages(pkg);
        } else {
          systemCands = await searchDebPackages(pkg);
        }
      } catch {
        systemCands = await searchDebPackages(pkg);
      }

      const totalCands =
        greenCands.length +
        flatpakCands.length +
        snapCands.length +
        systemCands.length;

      if (totalCands > 0) {
        console.log(
          pc.cyan(
            `💡 帮您在系统中搜寻到以下 ${totalCands} 个包含 "${pkg}" 的相关匹配项：\n`,
          ),
        );

        // 展示绿色应用推荐
        if (greenCands.length > 0) {
          console.log(pc.bold(pc.green("📁 [绿色应用] 候选：")));
          for (const cand of greenCands) {
            console.log(
              `  - ${cand}  ${pc.dim(`(卸载命令: xx delete ${cand})`)}`,
            );
          }
        }

        // 展示 Flatpak 推荐
        if (flatpakCands.length > 0) {
          console.log(pc.bold(pc.magenta("\n📦 [Flatpak] 候选：")));
          for (const cand of flatpakCands) {
            console.log(
              `  - ${cand.id} [${cand.name}]  ${pc.dim(`(卸载命令: xx delete ${cand.id})`)}`,
            );
          }
        }

        // 展示 Snap 推荐
        if (snapCands.length > 0) {
          console.log(pc.bold(pc.yellow("\n⚡ [Snap] 候选：")));
          for (const cand of snapCands) {
            console.log(
              `  - ${cand}  ${pc.dim(`(卸载命令: xx delete ${cand})`)}`,
            );
          }
        }

        // 展示系统安装包推荐（为避免刷屏，仅限展示前 15 个）
        if (systemCands.length > 0) {
          console.log(pc.bold(pc.blue("\n⚙ [系统软件包 (Deb/Rpm)] 候选：")));
          const limitedSystemCands = systemCands.slice(0, 15);
          for (const cand of limitedSystemCands) {
            console.log(
              `  - ${cand}  ${pc.dim(`(卸载命令: xx delete ${cand})`)}`,
            );
          }
          if (systemCands.length > 15) {
            console.log(
              pc.dim(
                `  ... 还有 ${systemCands.length - 15} 个系统软件包匹配项已省略`,
              ),
            );
          }
        }
        console.log("");
      } else {
        console.error(
          pc.red(
            `❌ 未能在您的系统中检索到任何与关键词 "${pkg}" 相关的已安装应用。`,
          ),
        );
      }
    });
}
