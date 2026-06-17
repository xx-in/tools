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
        args: ["-W", "-f=\${Status}", packageName],
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

// 智能探测并定位绿色应用路径 (单文件/目录)
async function findGreenAppPath(appName: string): Promise<string | null> {
  const home = getHomeDir();
  const greenAppDir = join(home, "GreenApp");

  // a. 探测是否为同名目录
  const dirPath = join(greenAppDir, appName);
  try {
    const stat = await Deno.stat(dirPath);
    if (stat.isDirectory) return dirPath;
  } catch {
    /* ignore */
  }

  // b. 探测是否为带大小写后缀的 AppImage 单文件
  const appImagePath = join(greenAppDir, `${appName}.AppImage`);
  const appImageLowerPath = join(greenAppDir, `${appName}.appimage`);
  try {
    const stat = await Deno.stat(appImagePath);
    if (stat.isFile) return appImagePath;
  } catch {
    try {
      const stat = await Deno.stat(appImageLowerPath);
      if (stat.isFile) return appImageLowerPath;
    } catch {
      /* ignore */
    }
  }

  // c. 兼容用户直接输入带后缀的场景
  if (appName.toLowerCase().endsWith(".appimage")) {
    const directPath = join(greenAppDir, appName);
    try {
      const stat = await Deno.stat(directPath);
      if (stat.isFile) return directPath;
    } catch {
      /* ignore */
    }
  }

  return null;
}

// 深度读取 DEB 官方包名
async function extractDebPackageName(
  absPath: string,
): Promise<string | undefined> {
  try {
    const dpkgCmd = new Deno.Command("dpkg-deb", {
      args: ["-f", absPath, "Package"],
    });
    const { success, stdout } = await dpkgCmd.output();
    if (success) {
      return new TextDecoder().decode(stdout).trim();
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

// 深度读取 RPM 官方包名
async function extractRpmPackageName(
  absPath: string,
): Promise<string | undefined> {
  try {
    const rpmCmd = new Deno.Command("rpm", {
      args: ["-qp", "--queryformat", "%{NAME}", absPath],
    });
    const { success, stdout } = await rpmCmd.output();
    if (success) {
      return new TextDecoder().decode(stdout).trim();
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

// ---------------- 模糊搜索辅助逻辑 ----------------

async function searchGreenApps(query: string): Promise<string[]> {
  const home = getHomeDir();
  const greenAppDir = join(home, "GreenApp");
  const candidates: string[] = [];
  try {
    for await (const entry of Deno.readDir(greenAppDir)) {
      if (entry.name.toLowerCase().includes(query.toLowerCase())) {
        candidates.push(entry.name.replace(/\.appimage/i, ""));
      }
    }
  } catch {
    /* ignore */
  }
  return candidates;
}

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
    /* ignore */
  }
  return candidates;
}

async function searchDebPackages(query: string): Promise<string[]> {
  const pkgs: string[] = [];
  try {
    const command = new Deno.Command("dpkg-query", {
      args: ["-W", "-f=\${Package}\n", `*${query}*`],
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
    /* ignore */
  }
  return pkgs;
}

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
    /* ignore */
  }
  return pkgs;
}

// ---------------- 物理执行与分析器 ----------------

// 卸载包命令
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

async function uninstallFlatpak(packageName: string) {
  if (!(await isCommandAvailable("flatpak"))) {
    console.error(pc.red("❌ 当前系统中未检测到已安装的 flatpak 工具。"));
    return;
  }

  console.log(pc.cyan(`📦 正在通过 flatpak 卸载应用: ${packageName}...`));
  const command = new Deno.Command("flatpak", {
    args: ["uninstall", "-y", packageName],
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await command.spawn().status;
  if (status.success) {
    const home = getHomeDir();
    const desktopPath = join(
      home,
      ".local/share/applications",
      `flatpak-${packageName}.desktop`,
    );
    try {
      await Deno.remove(desktopPath);
      console.log(pc.green(`✔ 已清除 Flatpak 关联桌面快捷图标。`));
    } catch {
      /* ignore */
    }
    console.log(pc.green("✨ Flatpak 应用及图标清理完成！"));
  }
}

// 物理清除绿色应用文件和图标
async function performRemoveGreenApp(greenPath: string, appName: string) {
  const home = getHomeDir();
  const applicationsDir = join(home, ".local/share/applications");

  // 1. 清理快捷方式
  try {
    for await (const entry of Deno.readDir(applicationsDir)) {
      if (entry.isFile && entry.name.endsWith(".desktop")) {
        const filePath = join(applicationsDir, entry.name);
        const content = await Deno.readTextFile(filePath);
        if (content.includes(greenPath) || content.includes(appName)) {
          await Deno.remove(filePath);
          console.log(pc.green(`✔ 已清除桌面快捷图标: ${filePath}`));
        }
      }
    }
  } catch {
    /* ignore */
  }

  // 2. 物理清除主体
  try {
    await Deno.remove(greenPath, { recursive: true });
    console.log(pc.green(`✔ 已成功清除绿色软件主体: ${greenPath}`));
  } catch (err) {
    console.error(
      pc.red(`❌ 清除软件主体失败:`),
      err instanceof Error ? err.message : err,
    );
  }
}

// 模糊检索与卸载推荐系统
async function performFuzzySearchAndRecommendation(query: string) {
  // 👈 核心修复一：在并发前执行 await 提取hasSnap，消除 Promise 裸值判断
  const hasSnap = await isCommandAvailable("snap");

  const [greenCands, flatpakCands, snapCands] = await Promise.all([
    searchGreenApps(query),
    searchFlatpaks(query),
    hasSnap
      ? (async () => {
          const candidates: string[] = [];
          try {
            const command = new Deno.Command("snap", { args: ["list"] });
            const { success, stdout } = await command.output();
            if (success) {
              const lines = new TextDecoder().decode(stdout).split("\n");
              for (let i = 1; i < lines.length; i++) {
                const name = lines[i].trim().split(/\s+/)[0];
                if (name && name.toLowerCase().includes(query.toLowerCase())) {
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

  let systemCands: string[] = [];
  try {
    const osRelease = await Deno.readTextFile("/etc/os-release");
    if (
      osRelease.includes("fedora") ||
      osRelease.includes("rhel") ||
      osRelease.includes("centos")
    ) {
      systemCands = await searchRpmPackages(query);
    } else {
      systemCands = await searchDebPackages(query);
    }
  } catch {
    systemCands = await searchDebPackages(query);
  }

  const totalCands =
    greenCands.length +
    flatpakCands.length +
    snapCands.length +
    systemCands.length;

  if (totalCands > 0) {
    console.log(
      pc.cyan(
        `💡 帮您在系统中搜寻到以下 ${totalCands} 个包含 "${query}" 的相关匹配项：\n`,
      ),
    );

    if (greenCands.length > 0) {
      console.log(pc.bold(pc.green("📁 [绿色应用] 候选：")));
      for (const cand of greenCands) {
        console.log(`  - ${cand}  ${pc.dim(`(卸载命令: xx delete ${cand})`)}`);
      }
    }

    if (flatpakCands.length > 0) {
      console.log(pc.bold(pc.magenta("\n📦 [Flatpak] 候选：")));
      for (const cand of flatpakCands) {
        console.log(
          `  - ${cand.id} [${cand.name}]  ${pc.dim(`(卸载命令: xx delete ${cand.id})`)}`,
        );
      }
    }

    if (snapCands.length > 0) {
      console.log(pc.bold(pc.yellow("\n📦 [Snap] 候选：")));
      for (const cand of snapCands) {
        console.log(`  - ${cand}  ${pc.dim(`(卸载命令: xx delete ${cand})`)}`);
      }
    }

    if (systemCands.length > 0) {
      console.log(pc.bold(pc.blue("\n📦 [系统源级] 候选：")));
      for (const cand of systemCands) {
        console.log(`  - ${cand}  ${pc.dim(`(卸载命令: xx delete ${cand})`)}`);
      }
    }

    console.log(pc.cyan(`\n🏁 搜寻完成！`));
  }
}

// 👈 核心修复二：重构为规范的可辨识联合类型体，自动完成类型收窄，完美解决 JSR 编译期 never 检查问题
async function parseDeleteTarget(target: string): Promise<
  | { type: "green"; raw: string; greenPath: string }
  | { type: "flatpak"; raw: string }
  | { type: "snap"; raw: string }
  | {
      type: "deb";
      raw: string;
      resolvedPath: string;
      extractedPackageName?: string;
    }
  | {
      type: "rpm";
      raw: string;
      resolvedPath: string;
      extractedPackageName?: string;
    }
  | { type: "system"; raw: string }
  | { type: "unknown"; raw: string }
> {
  const lower = target.toLowerCase();

  // A. 绿色应用检测
  const greenPath = await findGreenAppPath(target);
  if (greenPath) {
    return { type: "green", raw: target, greenPath };
  }

  // B. Flatpak 联合类型收窄
  const isFlatpak =
    !target.includes("/") &&
    !target.includes("\\") &&
    target.split(".").length >= 3;
  if (isFlatpak) {
    return { type: "flatpak", raw: target };
  }

  // C. 本地文件形式包体
  if (lower.endsWith(".deb")) {
    const absPath = resolve(Deno.cwd(), target);
    try {
      const stat = await Deno.stat(absPath);
      if (stat.isFile) {
        const extractedPackageName = await extractDebPackageName(absPath);
        return {
          type: "deb",
          raw: target,
          resolvedPath: absPath,
          extractedPackageName,
        };
      }
    } catch {
      /* ignore */
    }
  }

  if (lower.endsWith(".rpm")) {
    const absPath = resolve(Deno.cwd(), target);
    try {
      const stat = await Deno.stat(absPath);
      if (stat.isFile) {
        const extractedPackageName = await extractRpmPackageName(absPath);
        return {
          type: "rpm",
          raw: target,
          resolvedPath: absPath,
          extractedPackageName,
        };
      }
    } catch {
      /* ignore */
    }
  }

  // D. 托管 Snap 检测
  if (await isSnapInstalled(target)) {
    return { type: "snap", raw: target };
  }

  // E. 托管系统内置包检测
  if (await isSystemPackageInstalled(target)) {
    return { type: "system", raw: target };
  }

  // F. 均不适配，标记为未知
  return { type: "unknown", raw: target };
}

export function registerDeleteCommand(program: Command) {
  program
    .command("delete <package>")
    .description("通用应用卸载器（支持包名、Flatpak、Snap、本地包或绿色软件）")
    .action(async (pkg: string) => {
      if (!pkg) {
        console.error(
          pc.red("❌ 请提供要卸载的软件包名称、安装包或绿色软件名。"),
        );
        return;
      }

      try {
        const parsed = await parseDeleteTarget(pkg);

        switch (parsed.type) {
          case "green":
            // 👈 联合类型已完美自动收窄，无需非空断言 !
            await performRemoveGreenApp(parsed.greenPath, parsed.raw);
            console.log(pc.green("✨ 绿色应用及桌面快捷方式清理完成！"));
            break;

          case "flatpak":
            await uninstallFlatpak(parsed.raw);
            break;

          case "snap":
            await removeSnap(parsed.raw);
            break;

          case "deb": {
            const debPkgName = parsed.extractedPackageName || parsed.raw;
            await removeDeb(debPkgName);
            break;
          }

          case "rpm": {
            const rpmPkgName = parsed.extractedPackageName || parsed.raw;
            await removeRpm(rpmPkgName);
            break;
          }

          case "system": {
            const osRelease = await Deno.readTextFile("/etc/os-release");
            if (
              osRelease.includes("fedora") ||
              osRelease.includes("rhel") ||
              osRelease.includes("centos")
            ) {
              await removeRpm(parsed.raw);
            } else {
              await removeDeb(parsed.raw);
            }
            break;
          }

          case "unknown":
            await performFuzzySearchAndRecommendation(parsed.raw);
            break;

          default: {
            // 👈 穷尽性安全检查，类型无缝契合 never 校验
            const _exhaustiveCheck: never = parsed;
            throw new Error(
              `未处理的卸载分支类型: ${JSON.stringify(_exhaustiveCheck)}`,
            );
          }
        }
      } catch (err) {
        console.error(
          pc.red("❌ 卸载部署失败:"),
          err instanceof Error ? err.message : String(err),
        );
      }
    });
}
