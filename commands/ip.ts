import {
  isNotFoundError,
  runCommand,
  spawnCommand,
  isCommandAvailable,
  decodeOutput,
} from "../utils/spawn.ts";
import { Command } from "commander";
import c from "../utils/colors.ts";
import os from "node:os";

// 网卡数据结构
interface NetworkCard {
  name: string;
  mac: string;
  type: "有线/物理网卡" | "无线网卡" | "VPN/安全隧道" | "其他虚拟/临时设备";
  addresses: {
    family: string;
    address: string;
    netmask: string;
  }[];
}

interface DefaultRoute {
  gateway: string;
  interfaceName: string;
}

// 缓存 macOS 硬件端口映射
let macHardwarePortsCache: Map<string, string> | null = null;

// 初始化 macOS 硬件端口列表
async function initMacHardwarePorts(): Promise<void> {
  if (process.platform !== "darwin") return;
  if (macHardwarePortsCache) return;

  macHardwarePortsCache = new Map();
  try {
    const { success, stdout } = await runCommand("networksetup", [
      "-listallhardwareports",
    ]);
    if (!success) return;

    const output = decodeOutput(stdout);
    const blocks = output.split(/Hardware Port:\s*/);
    for (const block of blocks) {
      if (!block.trim()) continue;
      const portMatch = block.match(/^([^\n]+)/);
      const deviceMatch = block.match(/Device:\s*([^\n]+)/);
      if (portMatch && deviceMatch) {
        macHardwarePortsCache.set(
          deviceMatch[1].trim().toLowerCase(),
          portMatch[1].trim(),
        );
      }
    }
  } catch {
    // 降级
  }
}

// 判定网卡物理类型
function getInterfaceType(
  name: string,
): "有线/物理网卡" | "无线网卡" | "VPN/安全隧道" | "其他虚拟/临时设备" {
  const lowerName = name.toLowerCase();

  // 1. 优先提取高价值的 VPN / 隧道虚拟网卡
  const vpnKeywords = [
    /tun/i,
    /tap/i,
    /utun/i,
    /ppp/i,
    /tailscale/i,
    /zerotier/i,
    /wg[0-9]/i,
    /wireguard/i,
    /cisco/i,
    /forticlient/i,
    /anyconnect/i,
    /globalprotect/i,
  ];
  if (vpnKeywords.some((regex) => regex.test(lowerName))) {
    return "VPN/安全隧道";
  }

  // 2. 过滤各类本地、容器、沙箱及模拟虚拟网卡（全面覆盖 Windows / macOS 常见残留）
  const virtualKeywords = [
    /virtual/i,
    /vbox/i,
    /vmnet/i,
    /docker/i,
    /veth/i,
    /bridge/i,
    /gif/i,
    /stf/i,
    /wsl/i,
    /vethernet/i, // Hyper-V 虚拟交换机
    /pseudo/i,
    /ndis/i, // 手机 RNDIS 驱动
    /usb/i, // 临时 USB 共享网卡
    /asix/i, // 外接网卡芯片
    /ax88/i, // 外接网卡芯片
    /realtek.*usb/i,
    /host-only/i,
    /hyper-v/i,
    /sandbox/i,
    /npcap/i,
  ];
  if (virtualKeywords.some((regex) => regex.test(lowerName))) {
    return "其他虚拟/临时设备";
  }

  // 3. macOS 专属高精度硬件识别
  if (process.platform === "darwin" && macHardwarePortsCache) {
    const hardwarePort = macHardwarePortsCache.get(lowerName);
    if (hardwarePort) {
      const lowerPort = hardwarePort.toLowerCase();
      if (
        lowerPort.includes("wi-fi") ||
        lowerPort.includes("wireless") ||
        lowerPort.includes("无线")
      ) {
        return "无线网卡";
      }
      if (
        lowerPort.includes("iphone") ||
        lowerPort.includes("usb") ||
        lowerPort.includes("ipad") ||
        lowerPort.includes("hotspot")
      ) {
        // 将手机 USB 共享网络统一视作无线热点环境
        return "无线网卡";
      }
      if (
        lowerPort.includes("ethernet") ||
        lowerPort.includes("lan") ||
        lowerPort.includes("thunderbolt") ||
        lowerPort.includes("以太网")
      ) {
        return "有线/物理网卡";
      }
    }
  }

  // 4. 识别无线网卡标志 (多语言适配)
  const wirelessKeywords = [
    /wlan/i,
    /wlp/i,
    /wi-fi/i,
    /无线/i,
    /wifi/i,
    /wireless/i,
  ];
  if (wirelessKeywords.some((regex) => regex.test(lowerName))) {
    return "无线网卡";
  }

  // 5. 识别有线及标准物理网卡标志 (多语言适配)
  const wiredKeywords = [
    /en[0-9]/i,
    /eth[0-9]/i,
    /ethernet/i,
    /lan/i,
    /以太网/i,
    /local area connection/i,
  ];
  if (wiredKeywords.some((regex) => regex.test(lowerName))) {
    return "有线/物理网卡";
  }

  // 默认兜底
  if (lowerName.startsWith("en") || lowerName.startsWith("eth")) {
    return "有线/物理网卡";
  }

  return "其他虚拟/临时设备";
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

// 过滤并合并获取非回环网卡列表
function getActiveNetworkCards(): NetworkCard[] {
  const interfaces = os.networkInterfaces();
  const cardsMap = new Map<string, NetworkCard>();

  if (!interfaces) return [];

  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();

    // 严密的回环过滤
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
      if (net.internal) continue;
      // 剥离全零和本地回环占位符
      if (
        net.address === "127.0.0.1" ||
        net.address === "::1" ||
        net.address === "0.0.0.0"
      ) {
        continue;
      }

      const cardType = getInterfaceType(name);

      if (!cardsMap.has(name)) {
        cardsMap.set(name, {
          name,
          mac: net.mac || "未知",
          type: cardType,
          addresses: [],
        });
      }

      cardsMap.get(name)!.addresses.push({
        family: String(net.family),
        address: net.address,
        netmask: net.netmask || "",
      });
    }
  }

  // 剥离无实际路由意义的纯链路本地 IPv6 隧道
  const filteredCards: NetworkCard[] = [];
  for (const card of cardsMap.values()) {
    if (card.type === "VPN/安全隧道") {
      const hasIPv4 = card.addresses.some(
        (a) => a.family === "IPv4" || a.family === "4",
      );
      const hasGlobalIPv6 = card.addresses.some(
        (a) =>
          (a.family === "IPv6" || a.family === "6") &&
          !a.address.toLowerCase().startsWith("fe80:"),
      );

      if (!hasIPv4 && !hasGlobalIPv6) {
        continue;
      }
    }
    filteredCards.push(card);
  }

  return filteredCards;
}

// 获取默认网关 (加入 Windows 跃点数防冲突机制)
async function getDefaultRouteInfo(): Promise<DefaultRoute> {
  const platform = process.platform;
  let cmd = "";
  let args: string[] = [];

  if (platform === "win32") {
    cmd = "powershell";
    // 依据 InterfaceMetric / RouteMetric 正序排列，确保返回的第一个必然是当前首选、跃点数最低的真实出口
    args = [
      "-NoProfile",
      "-Command",
      "Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric, InterfaceMetric | Select-Object -Property NextHop, InterfaceAlias | ConvertTo-Json -Compress",
    ];
  } else if (platform === "darwin") {
    cmd = "sh";
    args = ["-c", "route -n get default"];
  } else if (platform === "linux") {
    cmd = "sh";
    args = ["-c", "ip route show"];
  } else {
    throw new Error("当前系统暂不支持网关及默认路由设备检测");
  }

  const { success, stdout, stderr } = await runCommand(cmd, args);

  if (!success) {
    const errorString = decodeOutput(stderr);
    throw new Error(errorString || "执行系统路由表查询命令失败");
  }

  const output = decodeOutput(stdout).trim();
  if (!output) {
    throw new Error("系统路由表中未检索到任何默认路由配置");
  }

  const routeInfo: DefaultRoute = { gateway: "", interfaceName: "" };

  if (platform === "darwin") {
    const gatewayMatch = output.match(/gateway:\s*(\S+)/i);
    const interfaceMatch = output.match(/interface:\s*(\S+)/i);
    routeInfo.gateway = gatewayMatch ? gatewayMatch[1].trim() : "";
    routeInfo.interfaceName = interfaceMatch ? interfaceMatch[1].trim() : "";
  } else if (platform === "linux") {
    const defaultLine = output
      .split("\n")
      .find((line) => line.startsWith("default"));
    if (defaultLine) {
      const viaMatch = defaultLine.match(/via\s+(\S+)/);
      const devMatch = defaultLine.match(/dev\s+(\S+)/);
      routeInfo.gateway = viaMatch ? viaMatch[1].trim() : "";
      routeInfo.interfaceName = devMatch ? devMatch[1].trim() : "";
    }
  } else if (platform === "win32") {
    try {
      const parsed = JSON.parse(output);
      // 若多网卡导致返回了数组，取跃点数最小的第一个对象
      const activeRoute = Array.isArray(parsed) ? parsed[0] : parsed;
      if (activeRoute) {
        routeInfo.gateway = activeRoute.NextHop
          ? activeRoute.NextHop.trim()
          : "";
        routeInfo.interfaceName = activeRoute.InterfaceAlias
          ? activeRoute.InterfaceAlias.trim()
          : "";
      }
    } catch {
      // 健壮性降级：正则解析
      const lines = output.split(/[\r\n]+/);
      for (const line of lines) {
        if (line.includes("NextHop")) {
          const match = line.match(/"NextHop"\s*:\s*"([^"]+)"/);
          if (match) routeInfo.gateway = match[1];
        }
        if (line.includes("InterfaceAlias")) {
          const match = line.match(/"InterfaceAlias"\s*:\s*"([^"]+)"/);
          if (match) routeInfo.interfaceName = match[1];
        }
      }
    }
  }

  return routeInfo;
}

export function registerIpCommand(program: Command) {
  program
    .command("ip")
    .description("本地活跃网卡、本机IP及网关侦测工具")
    .action(async (): Promise<void> => {
      console.log(c.dim("正在分析网络配置，请稍候...\n"));
      try {
        // 1. 初始化 macOS 硬件层映射
        await initMacHardwarePorts();

        let defaultRoute: DefaultRoute = { gateway: "", interfaceName: "" };
        let routeError = "";

        // 2. 抓取系统核心路由表
        try {
          defaultRoute = await getDefaultRouteInfo();
        } catch (err) {
          routeError = err instanceof Error ? err.message : String(err);
        }

        let cards = getActiveNetworkCards();

        if (cards.length === 0) {
          console.log(c.error("❌ 未检测到任何活跃的非本地回环网卡。"));
          return;
        }

        // 3. 全局多模清洗：解决“拔线残留”、“虚拟占位”及“多网卡竞争”引起的误报
        cards = cards.map((card) => {
          const ipv4 = card.addresses.find(
            (a) => a.family === "IPv4" || a.family === "4",
          );

          let isRealInternetExit = false;
          if (
            defaultRoute.interfaceName &&
            card.name.toLowerCase() === defaultRoute.interfaceName.toLowerCase()
          ) {
            isRealInternetExit = true;
          } else if (ipv4 && defaultRoute.gateway) {
            isRealInternetExit = ipInSubnet(
              ipv4.address,
              defaultRoute.gateway,
              ipv4.netmask,
            );
          }

          // 核心纠偏：若标定为物理有线网卡，但却不是当前系统的默认公网出口，强行降级为临时设备，后续予以隐去
          if (card.type === "有线/物理网卡" && !isRealInternetExit) {
            return { ...card, type: "其他虚拟/临时设备" };
          }
          return card;
        });

        // 4. 按价值优先级排序
        cards.sort((a, b) => {
          const order = {
            "有线/物理网卡": 1,
            无线网卡: 2,
            "VPN/安全隧道": 3,
            "其他虚拟/临时设备": 4,
          };
          return order[a.type] - order[b.type];
        });

        const hasUsefulCard = cards.some(
          (c) =>
            c.type === "有线/物理网卡" ||
            c.type === "无线网卡" ||
            c.type === "VPN/安全隧道",
        );

        // 5. 渲染输出
        for (const card of cards) {
          // 阻断未上网的残留及虚拟设备输出，拒绝信息洪流
          if (hasUsefulCard && card.type === "其他虚拟/临时设备") {
            continue;
          }

          const ipv4 = card.addresses.find(
            (a) => a.family === "IPv4" || a.family === "4",
          );
          const ipv6 = card.addresses.find(
            (a) => a.family === "IPv6" || a.family === "6",
          );
          const primaryAddr = ipv4 || ipv6;

          if (!primaryAddr) continue;

          let isDefaultRouteCard = false;
          if (
            defaultRoute.interfaceName &&
            card.name.toLowerCase() === defaultRoute.interfaceName.toLowerCase()
          ) {
            isDefaultRouteCard = true;
          } else if (ipv4 && defaultRoute.gateway) {
            isDefaultRouteCard = ipInSubnet(
              ipv4.address,
              defaultRoute.gateway,
              ipv4.netmask,
            );
          }

          let cardGateway = c.dim("(非默认路由出口网卡)");
          if (isDefaultRouteCard) {
            if (defaultRoute.gateway && defaultRoute.gateway !== "0.0.0.0") {
              cardGateway = c.warn(defaultRoute.gateway);
            } else {
              cardGateway = c.warn("直接点对点隧道连接 (Point-to-Point)");
            }
          } else if (routeError) {
            cardGateway = c.dim(`检测失败 (原因: ${routeError})`);
          }

          console.log(
            c.info(
              `================ 活跃网卡及网关信息 [${card.type}] ================`,
            ),
          );
          console.log(`${c.label("网卡名称 (Name):")}   ${c.value(card.name)}`);
          console.log(
            `${c.label("本机 IP 地址 (IP):")}  ${c.value(primaryAddr.address)}`,
          );
          console.log(
            `${c.label("子网掩码 (Mask):")}   ${c.value(primaryAddr.netmask)}`,
          );
          console.log(`${c.label("默认网关 (Gateway):")} ${cardGateway}`);
          console.log(`${c.label("MAC 地址 (MAC):")}    ${c.value(card.mac)}`);
          console.log(
            `${c.label("IP 协议版本:")}       ${c.value(primaryAddr.family === "IPv4" || primaryAddr.family === "4" ? "IPv4" : "IPv6")}`,
          );

          if (ipv4 && ipv6) {
            console.log(
              `${c.success("本地 IPv6 地址:")}     ${c.dim(ipv6.address)}`,
            );
          }

          console.log(
            c.info("===================================================="),
          );
          console.log("");
        }
      } catch (error) {
        console.error(c.error("❌ 检测失败。"));
        if (error instanceof Error) {
          console.error(c.error("错误详情:"), error.message);
        }
      }
    });
}
