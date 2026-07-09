import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isCommandAvailable } from "./spawn.ts";

const PACKAGE_NAME = "@xx-in/tools";

export type PackageManager =
  "npm" | "bun" | "deno" | "npx" | "bunx" | "unknown";

export interface UpgradePlan {
  manager: PackageManager;
  command: string;
  args: string[];
  canUpgrade: boolean;
  registry?: string;
  hint?: string;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function getCliRealPath(): string {
  const cliPath = process.argv[1];
  if (!cliPath) {
    return "";
  }

  try {
    return normalizePath(fs.realpathSync(cliPath));
  } catch {
    return normalizePath(cliPath);
  }
}

function getDenoInstallRoot(): string {
  const root = process.env.DENO_INSTALL_ROOT;
  if (root) {
    return normalizePath(path.resolve(root));
  }
  return normalizePath(path.join(os.homedir(), ".deno"));
}

function getBunGlobalBinDir(): string | undefined {
  if (!isCommandAvailable("bun")) {
    return undefined;
  }

  const result = spawnSync("bun", ["pm", "bin", "-g"], { encoding: "utf8" });
  const output = result.stdout?.trim();
  return output ? normalizePath(output) : undefined;
}

export function detectPackageManager(): PackageManager {
  const realPath = getCliRealPath();
  if (!realPath) {
    return "unknown";
  }

  if (realPath.includes("/.bun/install/cache/")) {
    return "bunx";
  }

  if (realPath.includes("/.bun/install/global/")) {
    return "bun";
  }

  const bunBin = getBunGlobalBinDir();
  if (bunBin && realPath.startsWith(`${bunBin}/`)) {
    return "bun";
  }

  const denoRoot = getDenoInstallRoot();
  if (realPath.startsWith(`${denoRoot}/bin/`)) {
    return "deno";
  }

  if (realPath.includes("/.npm/_npx/") || realPath.includes("/npm/_npx/")) {
    return "npx";
  }

  if (realPath.includes("/node_modules/")) {
    return "npm";
  }

  return "unknown";
}

const MANAGER_LABEL: Record<PackageManager, string> = {
  npm: "npm",
  bun: "Bun",
  deno: "Deno",
  npx: "npx",
  bunx: "bunx",
  unknown: "未知来源",
};

export function getManagerLabel(manager: PackageManager): string {
  return MANAGER_LABEL[manager];
}

function readPackageVersion(pkgPath: string): string | undefined {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      name?: string;
      version?: string;
    };
    if (pkg.name && pkg.name !== PACKAGE_NAME) {
      return undefined;
    }
    return pkg.version;
  } catch {
    return undefined;
  }
}

export function getLocalVersion(): string | undefined {
  const realPath = getCliRealPath();
  if (!realPath) {
    return undefined;
  }

  const candidates = [
    path.join(path.dirname(realPath), "..", "package.json"),
    path.join(path.dirname(realPath), "package.json"),
  ];

  for (const pkgPath of candidates) {
    const version = readPackageVersion(pkgPath);
    if (version) {
      return version;
    }
  }

  let currentDir = path.dirname(realPath);
  for (let i = 0; i < 5; i++) {
    const version = readPackageVersion(path.join(currentDir, "package.json"));
    if (version) {
      return version;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return undefined;
}

export function compareVersions(remote: string, local: string): number {
  const parse = (version: string) =>
    version.split(".").map((part) => Number.parseInt(part, 10) || 0);

  const remoteParts = parse(remote);
  const localParts = parse(local);
  const length = Math.max(remoteParts.length, localParts.length);

  for (let i = 0; i < length; i++) {
    const diff = (remoteParts[i] ?? 0) - (localParts[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

const OFFICIAL_REGISTRY = "https://registry.npmjs.org";

export function getOfficialRegistry(): string {
  return OFFICIAL_REGISTRY;
}

function registryEnv(registry: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NPM_CONFIG_REGISTRY: registry,
    npm_config_registry: registry,
  };
}

export function fetchRemoteVersionForManager(
  manager: PackageManager,
  registry?: string,
): Promise<string> {
  const viewVersion = (command: string, args: string[]) => {
    const result = spawnSync(command, args, { encoding: "utf8" });
    const version = result.stdout?.trim();
    if (result.status === 0 && version) {
      return version;
    }
    return undefined;
  };

  const registryArgs = registry ? ["--registry", registry] : [];

  if (manager === "bun" && isCommandAvailable("bun")) {
    const version = viewVersion("bun", [
      "pm",
      "view",
      PACKAGE_NAME,
      "version",
      ...registryArgs,
    ]);
    if (version) {
      return Promise.resolve(version);
    }
  }

  if (manager === "npm" && isCommandAvailable("npm")) {
    const version = viewVersion("npm", [
      "view",
      PACKAGE_NAME,
      "version",
      ...registryArgs,
    ]);
    if (version) {
      return Promise.resolve(version);
    }
  }

  return fetchRemoteVersion(registry);
}

export async function fetchRemoteVersion(registry?: string): Promise<string> {
  const base = (registry ?? OFFICIAL_REGISTRY).replace(/\/$/, "");
  const url = `${base}/${encodeURIComponent(PACKAGE_NAME)}/latest`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`无法获取远程版本信息 (HTTP ${response.status})`);
  }

  const data = (await response.json()) as { version?: string };
  if (!data.version) {
    throw new Error("远程版本信息格式无效");
  }

  return data.version;
}

export function isRemoteNewer(remote: string, local: string): boolean {
  return compareVersions(remote, local) > 0;
}

export function getUpgradePlan(
  options: {
    targetVersion?: string;
  } = {},
): UpgradePlan {
  const manager = detectPackageManager();
  const registry = OFFICIAL_REGISTRY;
  const versionTag = options.targetVersion ?? "latest";

  switch (manager) {
    case "bun": {
      const args = [
        "add",
        "-g",
        `${PACKAGE_NAME}@${versionTag}`,
        "--registry",
        registry,
      ];
      return { manager, command: "bun", args, canUpgrade: true, registry };
    }
    case "deno": {
      return {
        manager,
        command: "deno",
        args: ["install", "-g", "--force", `npm:${PACKAGE_NAME}@${versionTag}`],
        canUpgrade: true,
        registry,
      };
    }
    case "npx":
      return {
        manager,
        command: "",
        args: [],
        canUpgrade: false,
        hint: "当前通过 npx 运行，无法自动更新。请先全局安装：npm install -g @xx-in/tools",
      };
    case "bunx":
      return {
        manager,
        command: "",
        args: [],
        canUpgrade: false,
        hint: "当前通过 bunx 运行，无法自动更新。请先全局安装：bun add -g @xx-in/tools",
      };
    case "unknown":
      return {
        manager,
        command: "",
        args: [],
        canUpgrade: false,
        hint: "无法识别当前安装来源。请手动使用 npm、bun 或 deno 更新。",
      };
    case "npm":
    default: {
      const args = [
        "install",
        "-g",
        `--registry=${registry}`,
        `${PACKAGE_NAME}@${versionTag}`,
      ];
      return { manager, command: "npm", args, canUpgrade: true, registry };
    }
  }
}

export function getUpgradeInstallEnv(registry: string): NodeJS.ProcessEnv {
  return registryEnv(registry);
}
