import fs from "node:fs/promises";
import { basename, delimiter, extname, join } from "node:path";
import c from "./colors.ts";
import { spawnCommand, runCommand, decodeOutput } from "./spawn.ts";
import { uncompressZip } from "./archive.ts";

export interface InstalledManifest {
  appName: string;
  installDir: string;
  links: string[];
  type: "binary" | "archive";
}

const APP_DIR_NAME = ".xx-tools";
const PATH_MARKER_BEGIN = "# >>> xx-tools path >>>";
const PATH_MARKER_END = "# <<< xx-tools path <<<";

export function getHomeDir(): string {
  return process.env["HOME"] || process.env["USERPROFILE"] || process.cwd();
}

export function getToolsRootDir(): string {
  return join(getHomeDir(), APP_DIR_NAME);
}

export function getAppsDir(): string {
  return join(getToolsRootDir(), "apps");
}

export function getBinDir(): string {
  return join(getToolsRootDir(), "bin");
}

export function getManifestPath(appName: string): string {
  return join(getAppsDir(), appName, ".xx-manifest.json");
}

export function ensureSupportedDesktopOS(): boolean {
  if (process.platform !== "darwin" && process.platform !== "win32") {
    console.error(
      c.error("❌ 当前 install/uninstall 仅支持 macOS 和 Windows。"),
    );
    return false;
  }
  return true;
}

export async function ensureToolDirectories(): Promise<void> {
  await fs.mkdir(getAppsDir(), { recursive: true });
  await fs.mkdir(getBinDir(), { recursive: true });
}

function getPreferredProfiles(): string[] {
  const home = getHomeDir();
  const shell = process.env["SHELL"] || "";
  const profiles: string[] = [];

  if (shell.includes("zsh")) {
    profiles.push(join(home, ".zshrc"), join(home, ".zprofile"));
  } else if (shell.includes("bash")) {
    profiles.push(join(home, ".bashrc"), join(home, ".bash_profile"));
  } else {
    profiles.push(join(home, ".zshrc"), join(home, ".zprofile"));
  }

  return Array.from(new Set(profiles));
}

export async function ensureBinDirOnPath(): Promise<void> {
  if (process.platform === "win32") {
    await ensureWindowsBinDirOnPath();
    return;
  }

  const pathBlock = `${PATH_MARKER_BEGIN}
export PATH="$HOME/${APP_DIR_NAME}/bin:$PATH"
${PATH_MARKER_END}`;

  for (const profilePath of getPreferredProfiles()) {
    let content = "";
    try {
      content = await fs.readFile(profilePath, "utf-8");
    } catch {
      // ignore missing files
    }

    if (!content.includes(PATH_MARKER_BEGIN)) {
      const separator = content.endsWith("\n") || content === "" ? "" : "\n";
      await fs.writeFile(
        profilePath,
        `${content}${separator}${pathBlock}\n`,
        "utf-8",
      );
      console.log(c.success(`✔ 已写入 PATH 配置: ${profilePath}`));
    }
  }
}

async function ensureWindowsBinDirOnPath(): Promise<void> {
  const binDir = getBinDir();
  const currentUserPath = process.env["Path"] || process.env["PATH"] || "";

  const alreadyInCurrentEnv = currentUserPath
    .split(delimiter)
    .some((item) => item.trim().toLowerCase() === binDir.toLowerCase());

  const script = [
    "$binDir = [System.IO.Path]::GetFullPath($args[0])",
    "$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')",
    "if ([string]::IsNullOrWhiteSpace($userPath)) { $userPath = '' }",
    "$items = $userPath -split ';' | Where-Object { $_ -and $_.Trim() -ne '' }",
    "$exists = $items | Where-Object { $_.Trim().ToLower() -eq $binDir.ToLower() }",
    "if (-not $exists) {",
    '  $newPath = if ($userPath) { "$binDir;$userPath" } else { $binDir }',
    "  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')",
    "  Write-Output 'UPDATED'",
    "} else {",
    "  Write-Output 'UNCHANGED'",
    "}",
  ].join(" ");

  const { success, stdout } = await runCommand("powershell", [
    "-NoProfile",
    "-Command",
    script,
    binDir,
  ]);

  if (success) {
    const output = decodeOutput(stdout).trim();
    if (output.includes("UPDATED")) {
      console.log(c.success(`✔ 已写入用户 PATH: ${binDir}`));
    } else if (!alreadyInCurrentEnv) {
      console.log(c.dim(`➖ 用户 PATH 中已存在: ${binDir}`));
    }
  }
}

export function getShellReloadCommand(): string {
  if (process.platform === "win32") {
    return "重新打开 PowerShell 或 CMD";
  }
  const shell = process.env["SHELL"] || "";
  if (shell.includes("zsh")) {
    return "source ~/.zshrc";
  }
  if (shell.includes("bash")) {
    return "source ~/.bashrc";
  }
  return "source ~/.zshrc";
}

export function stripArchiveSuffix(filePath: string): string {
  const lower = filePath.toLowerCase();
  const name = basename(filePath);

  const suffixes = [".tar.gz", ".tgz", ".tar.xz", ".txz", ".zip", ".tar"];
  for (const suffix of suffixes) {
    if (lower.endsWith(suffix)) {
      return name.slice(0, name.length - suffix.length);
    }
  }

  return basename(filePath, extname(filePath));
}

export async function removeDirectoryContents(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

export async function findExecutablesRecursively(
  rootDir: string,
): Promise<string[]> {
  const matches: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    for (const entry of await fs.readdir(currentDir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;

      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (
          ["node_modules", "lib", "libs", "include", "share", "man"].includes(
            entry.name,
          )
        ) {
          continue;
        }
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const stat = await fs.stat(fullPath);
      if (process.platform === "win32") {
        if (!/\.(exe|cmd|bat|ps1)$/i.test(entry.name)) {
          continue;
        }
      } else {
        const isExecutable = stat.mode ? (stat.mode & 0o111) !== 0 : false;
        if (!isExecutable) continue;
        if (
          /\.(dylib|so|a|o|txt|md|json|yaml|yml|ts|js|c|h|sh)$/i.test(
            entry.name,
          )
        ) {
          continue;
        }
      }

      matches.push(fullPath);
    }
  }

  await walk(rootDir);
  return matches;
}

export async function createLinks(
  appName: string,
  executablePaths: string[],
): Promise<string[]> {
  const binDir = getBinDir();
  const linkNames: string[] = [];

  for (const executablePath of executablePaths) {
    const executableBaseName = basename(executablePath);

    if (process.platform === "win32") {
      const commandName = basename(
        executableBaseName,
        extname(executableBaseName),
      );
      const cmdPath = join(binDir, `${commandName}.cmd`);
      const ps1Path = join(binDir, `${commandName}.ps1`);
      const quotedExecutable = executablePath.replace(/"/g, '""');

      await fs.rm(cmdPath, { force: true });
      await fs.rm(ps1Path, { force: true });

      await fs.writeFile(
        cmdPath,
        `@echo off\r\n"${quotedExecutable}" %*\r\n`,
        "utf-8",
      );
      await fs.writeFile(ps1Path, `& "${quotedExecutable}" @args\n`, "utf-8");
      linkNames.push(commandName);
    } else {
      const linkName = executableBaseName;
      const linkPath = join(binDir, linkName);
      await fs.rm(linkPath, { force: true });
      await fs.symlink(executablePath, linkPath);
      linkNames.push(linkName);
    }
  }

  if (linkNames.length > 0) {
    console.log(
      c.success(
        `✔ 已为 ${c.bold(appName)} 创建终端命令: ${linkNames.join(", ")}`,
      ),
    );
  }

  return linkNames;
}

export async function writeManifest(
  manifest: InstalledManifest,
): Promise<void> {
  await fs.writeFile(
    getManifestPath(manifest.appName),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
}

export async function readManifest(
  appName: string,
): Promise<InstalledManifest | null> {
  try {
    const content = await fs.readFile(getManifestPath(appName), "utf-8");
    return JSON.parse(content) as InstalledManifest;
  } catch {
    return null;
  }
}

export async function removeInstalledApp(appName: string): Promise<boolean> {
  const manifest = await readManifest(appName);
  if (!manifest) return false;

  for (const linkName of manifest.links) {
    if (process.platform === "win32") {
      await fs.rm(join(getBinDir(), `${linkName}.cmd`), { force: true });
      await fs.rm(join(getBinDir(), `${linkName}.ps1`), { force: true });
    } else {
      await fs.rm(join(getBinDir(), linkName), { force: true });
    }
    console.log(c.success(`✔ 已移除终端命令: ${linkName}`));
  }

  await fs.rm(manifest.installDir, { recursive: true, force: true });
  console.log(c.success(`✔ 已移除安装目录: ${manifest.installDir}`));
  return true;
}

export async function listInstalledApps(): Promise<string[]> {
  try {
    const entries = await fs.readdir(getAppsDir(), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export async function extractArchiveToDir(
  archivePath: string,
  destDir: string,
): Promise<boolean> {
  const lower = archivePath.toLowerCase();

  if (lower.endsWith(".zip")) {
    await uncompressZip(archivePath, destDir);
    return true;
  }

  let args: string[];

  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) {
    args = ["-xzf", archivePath, "-C", destDir];
  } else if (lower.endsWith(".tar.xz") || lower.endsWith(".txz")) {
    args = ["-xJf", archivePath, "-C", destDir];
  } else if (lower.endsWith(".tar")) {
    args = ["-xf", archivePath, "-C", destDir];
  } else {
    return false;
  }

  const result = await spawnCommand("tar", args);
  return result.success;
}
