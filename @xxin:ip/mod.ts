#!/usr/bin/env deno

import os from "node:os";
import dgram from "node:dgram";
import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
import process from "node:process";

const program = new Command();

// 网卡信息接口
interface ActiveInterface {
  interfaceName: string;
  address: string;
  netmask: string;
  family: string;
  mac: string;
  internal: boolean;
  cidr: string | null;
}

interface NetworkInterfaceItem {
  name: string;
  info: os.NetworkInterfaceInfo;
}

// 过滤获取所有非回环、非内部的网卡候选列表
function getNonInternalInterfaces(): NetworkInterfaceItem[] {
  const interfaces = os.networkInterfaces();
  const list: NetworkInterfaceItem[] = [];

  if (interfaces) {
    for (const name of Object.keys(interfaces)) {
      const lowerName = name.toLowerCase();
      // 1. 通过网卡名称硬性排除任何形式的回环设备（解决 Windows 回环网卡 internal 未标 true 的问题）
      if (
        lowerName === "lo" ||
        lowerName.startsWith("lo") ||
        lowerName.includes("loopback") ||
        lowerName.includes("回环")
      ) {
        continue;
      }

      const netList = interfaces[name];
      if (!netList) continue;

      for (const net of netList) {
        // 2. 排除标为 internal 的网卡
        if (net.internal) continue;

        // 3. 排除本地回环 IP 地址
        if (net.address === "127.0.0.1" || net.address === "::1") continue;

        // 4. 排除未分配的空地址
        if (net.address === "0.0.0.0") continue;

        list.push({ name, info: net });
      }
    }
  }
  return list;
}

// IPv4 子网匹配计算
function ipInSubnet(ip: string, target: string, netmask: string): boolean {
  if (!ip || !target || !netmask) return false;
  const ipParts = ip.split(".").map(Number);
  const targetParts = target.split(".").map(Number);
  const maskParts = netmask.split(".").map(Number);

  if (
    ipParts.length !== 4 ||
    targetParts.length !== 4 ||
    maskParts.length !== 4
  ) {
    return false;
  }

  for (let i = 0; i < 4; i++) {
    if ((ipParts[i] & maskParts[i]) !== (targetParts[i] & maskParts[i])) {
      return false;
    }
  }
  return true;
}

// 通过 UDP 连接探测本地路由出口 IP（免流量，免握手，支持离线路由探测）
function getActiveIpViaUdp(
  dest: string,
  family: "udp4" | "udp6",
): Promise<string> {
  return new Promise((resolve, reject) => {
    let socket: dgram.Socket;
    try {
      socket = dgram.createSocket(family);
    } catch (err) {
      return reject(err);
    }

    socket.connect(53, dest, () => {
      try {
        const addr = socket.address();
        socket.close();
        resolve(addr.address);
      } catch (err) {
        socket.close();
        reject(err);
      }
    });

    socket.on("error", (err) => {
      socket.close();
      reject(err);
    });
  });
}

// 智能选择最可能是物理网卡的设备进行兜底
function pickBestInterface(
  interfaces: NetworkInterfaceItem[],
): NetworkInterfaceItem | null {
  if (interfaces.length === 0) return null;
  if (interfaces.length === 1) return interfaces[0];

  // 过滤掉已知的虚拟网卡
  const virtualKeywords = [
    /virtual/i,
    /vbox/i,
    /vmnet/i,
    /docker/i,
    /veth/i,
    /bridge/i,
    /gif/i,
    /stf/i,
    /utun/i,
    /wsl/i,
  ];
  const physicalList = interfaces.filter((item) => {
    return !virtualKeywords.some((regex) => regex.test(item.name));
  });

  if (physicalList.length > 0) {
    // 优先匹配物理网卡和无线网卡名称
    const priorityKeywords = [
      /en[0-9]/i,
      /eth[0-9]/i,
      /wlan[0-9]/i,
      /wlp/i,
      /wi-fi/i,
      /ethernet/i,
      /lan/i,
      /以太网/i,
      /无线/i,
    ];
    physicalList.sort((a, b) => {
      const aMatch = priorityKeywords.findIndex((regex) => regex.test(a.name));
      const bMatch = priorityKeywords.findIndex((regex) => regex.test(b.name));
      if (aMatch !== -1 && bMatch === -1) return -1;
      if (bMatch !== -1 && aMatch === -1) return 1;
      if (aMatch !== -1 && bMatch !== -1) return aMatch - bMatch;
      return 0;
    });
    return physicalList[0];
  }

  return interfaces[0];
}

// 核心检测入口
async function getActiveInterface(gateway?: string): Promise<ActiveInterface> {
  const nonInternal = getNonInternalInterfaces();

  if (nonInternal.length === 0) {
    throw new Error("未找到任何可用的非本地回环网卡。");
  }

  // 1. 优先采用默认网关进行子网段匹配 (IPv4)
  if (gateway && gateway.match(/^\d+\.\d+\.\d+\.\d+$/)) {
    for (const item of nonInternal) {
      if (item.info.family === "IPv4" || String(item.info.family) === "4") {
        if (ipInSubnet(item.info.address, gateway, item.info.netmask)) {
          return {
            interfaceName: item.name,
            address: item.info.address,
            netmask: item.info.netmask,
            family: String(item.info.family),
            mac: item.info.mac,
            internal: item.info.internal,
            cidr: item.info.cidr ?? null,
          };
        }
      }
    }
  }

  // 2. 尝试通过 UDP 路由机制探测出口 IP
  let activeIp = "";
  try {
    activeIp = await getActiveIpViaUdp("8.8.8.8", "udp4");
  } catch (_e) {
    try {
      activeIp = await getActiveIpViaUdp("2001:4860:4860::8888", "udp6");
    } catch (_err) {
      try {
        const conn = await Deno.connect({
          hostname: "114.114.114.114",
          port: 53,
          transport: "tcp",
        });
        if (conn.localAddr && "hostname" in conn.localAddr) {
          activeIp = conn.localAddr.hostname;
        }
        conn.close();
      } catch (_tcperr) {
        // 忽略，交由后面的物理网卡推荐算法兜底
      }
    }
  }

  // 若成功获取到有效的非回环 IP，在网卡候选列表中进行匹配
  if (
    activeIp &&
    activeIp !== "127.0.0.1" &&
    activeIp !== "::1" &&
    activeIp !== "0.0.0.0"
  ) {
    for (const item of nonInternal) {
      if (item.info.address === activeIp) {
        return {
          interfaceName: item.name,
          address: item.info.address,
          netmask: item.info.netmask,
          family: String(item.info.family),
          mac: item.info.mac,
          internal: item.info.internal,
          cidr: item.info.cidr ?? null,
        };
      }
    }
  }

  // 3. 兜底方案：通过特征选择最合适的物理网卡
  const best = pickBestInterface(nonInternal);
  if (best) {
    return {
      interfaceName: best.name,
      address: best.info.address,
      netmask: best.info.netmask,
      family: String(best.info.family),
      mac: best.info.mac,
      internal: best.info.internal,
      cidr: best.info.cidr ?? null,
    };
  }

  throw new Error("未能定位到本地活跃网卡。");
}

// 获取默认网关
async function getDefaultGateway(): Promise<string> {
  const platform = Deno.build.os;
  let cmd = "";
  let args: string[] = [];

  if (platform === "windows") {
    cmd = "powershell";
    // 添加 -NoProfile 避免加载用户配置文件输出环境相关的干扰文本
    args = [
      "-NoProfile",
      "-Command",
      "Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Select-Object -ExpandProperty NextHop",
    ];
  } else if (platform === "darwin") {
    cmd = "sh";
    args = ["-c", "route -n get default | grep gateway | awk '{print $2}'"];
  } else if (platform === "linux") {
    cmd = "sh";
    args = ["-c", "ip route show | grep default | awk '{print $3}'"];
  } else {
    throw new Error("当前系统暂不支持网关检测");
  }

  const command = new Deno.Command(cmd, {
    args: args,
    stdout: "piped",
    stderr: "piped",
  });

  const { success, stdout, stderr } = await command.output();

  if (!success) {
    const errorString = new TextDecoder().decode(stderr);
    throw new Error(errorString || "执行系统命令失败");
  }

  const output = new TextDecoder().decode(stdout).trim();
  if (!output) {
    throw new Error("未检测到有效网关");
  }

  const firstLine = output.split("\n")[0];
  return firstLine ? firstLine.trim() : "";
}

// 主执行逻辑
async function main(): Promise<void> {
  console.log(pc.dim("正在分析网络配置，请稍候...\n"));
  try {
    let gateway = "";
    let gatewayError = "";

    try {
      gateway = await getDefaultGateway();
    } catch (err) {
      gatewayError = err instanceof Error ? err.message : String(err);
    }

    const activeNet = await getActiveInterface(gateway);

    console.log(
      pc.cyan("================ 活跃网卡及网关信息 ================"),
    );
    console.log(
      `${pc.green("网卡名称 (Name):")}   ${pc.bold(activeNet.interfaceName)}`,
    );
    console.log(
      `${pc.green("本机 IP 地址 (IP):")}  ${pc.bold(activeNet.address)}`,
    );
    console.log(`${pc.green("子网掩码 (Mask):")}   ${activeNet.netmask}`);
    console.log(
      `${pc.green("默认网关 (Gateway):")} ${pc.yellow(gateway || `未检测到 (原因: ${gatewayError})`)}`,
    );
    console.log(`${pc.green("MAC 地址 (MAC):")}    ${activeNet.mac}`);
    console.log(`${pc.green("IP 协议版本:")}       ${activeNet.family}`);
    console.log(
      pc.cyan("===================================================="),
    );
  } catch (error) {
    console.error(pc.red("❌ 检测失败。"));
    if (error instanceof Error) {
      console.error(pc.red("错误详情:"), error.message);
    }
  }
}

program
  .name("netstat")
  .description("本地活跃网卡及网关侦测工具")
  .version("1.0.5")
  .action((): void => {
    main();
  });

program.parse(process.argv);
