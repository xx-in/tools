import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
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

  // 2. 排除已知的各类本地、容器及模拟虚拟网卡
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
  ];
  if (virtualKeywords.some((regex) => regex.test(lowerName))) {
    return "其他虚拟/临时设备";
  }

  // 3. 识别无线网卡标志
  const wirelessKeywords = [/wlan/i, /wlp/i, /wi-fi/i, /无线/i, /wifi/i];
  if (wirelessKeywords.some((regex) => regex.test(lowerName))) {
    return "无线网卡";
  }

  // 4. 识别有线及标准物理网卡标志
  const wiredKeywords = [
    /en[0-9]/i,
    /eth[0-9]/i,
    /ethernet/i,
    /lan/i,
    /以太网/i,
  ];
  if (wiredKeywords.some((regex) => regex.test(lowerName))) {
    return "有线/物理网卡";
  }

  // macOS 默认以 en 开头判定为物理物理网卡
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

// 过滤并合并获取非回环网卡列表 (升级版：智能剥离 macOS 系统服务的占位 utun 网卡)
function getActiveNetworkCards(): NetworkCard[] {
  const interfaces = os.networkInterfaces();
  const cardsMap = new Map<string, NetworkCard>();

  if (!interfaces) return [];

  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();

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

  // 👈 核心升级：过滤无实际网络路由意义的“纯本地链路 IPv6”VPN 隧道设备 (如 utun0-5)
  const filteredCards: NetworkCard[] = [];
  for (const card of cardsMap.values()) {
    if (card.type === "VPN/安全隧道") {
      const hasIPv4 = card.addresses.some(
        (a) => a.family === "IPv4" || a.family === "4",
      );
      // 检查是否存在非本地链路 (即不以 fe80: 开头) 的全局 IPv6 路由地址
      const hasGlobalIPv6 = card.addresses.some(
        (a) =>
          (a.family === "IPv6" || a.family === "6") &&
          !a.address.toLowerCase().startsWith("fe80:"),
      );

      // 如果既没有分配 IPv4，也没有分配全局可路由的 IPv6，断定为系统服务占位卡，予以直接剔除
      if (!hasIPv4 && !hasGlobalIPv6) {
        continue;
      }
    }
    filteredCards.push(card);
  }

  return filteredCards;
}

// 获取默认网关
async function getDefaultRouteInfo(): Promise<DefaultRoute> {
  const platform = Deno.build.os;
  let cmd = "";
  let args: string[] = [];

  if (platform === "windows") {
    cmd = "powershell";
    args = [
      "-NoProfile",
      "-Command",
      "Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Select-Object -Property NextHop, InterfaceAlias | ConvertTo-Json -Compress",
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

  const command = new Deno.Command(cmd, {
    args: args,
    stdout: "piped",
    stderr: "piped",
  });

  const { success, stdout, stderr } = await command.output();

  if (!success) {
    const errorString = new TextDecoder().decode(stderr);
    throw new Error(errorString || "执行系统路由表查询命令失败");
  }

  const output = new TextDecoder().decode(stdout).trim();
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
  } else if (platform === "windows") {
    try {
      const parsed = JSON.parse(output);
      const activeRoute = Array.isArray(parsed) ? parsed[0] : parsed;
      routeInfo.gateway = activeRoute.NextHop ? activeRoute.NextHop.trim() : "";
      routeInfo.interfaceName = activeRoute.InterfaceAlias
        ? activeRoute.InterfaceAlias.trim()
        : "";
    } catch {
      // ignore
    }
  }

  return routeInfo;
}

export function registerIpCommand(program: Command) {
  program
    .command("ip")
    .description("本地活跃网卡、本机IP及网关侦测工具")
    .action(async (): Promise<void> => {
      console.log(pc.dim("正在分析网络配置，请稍候...\n"));
      try {
        let defaultRoute: DefaultRoute = { gateway: "", interfaceName: "" };
        let routeError = "";

        try {
          defaultRoute = await getDefaultRouteInfo();
        } catch (err) {
          routeError = err instanceof Error ? err.message : String(err);
        }

        const cards = getActiveNetworkCards();

        if (cards.length === 0) {
          console.log(pc.red("❌ 未检测到任何活跃的非本地回环网卡。"));
          return;
        }

        // 优先级排序：有线 ➡️ 无线 ➡️ VPN隧道 ➡️ 其他虚拟设备
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

        for (const card of cards) {
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

          // 双因子精准网关判定算法
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

          let cardGateway = pc.dim("(非默认路由出口网卡)");
          if (isDefaultRouteCard) {
            if (defaultRoute.gateway && defaultRoute.gateway !== "0.0.0.0") {
              cardGateway = pc.yellow(defaultRoute.gateway);
            } else {
              cardGateway = pc.yellow("直接点对点隧道连接 (Point-to-Point)");
            }
          } else if (routeError) {
            cardGateway = pc.dim(`检测失败 (原因: ${routeError})`);
          }

          console.log(
            pc.cyan(
              `================ 活跃网卡及网关信息 [${card.type}] ================`,
            ),
          );
          console.log(
            `${pc.green("网卡名称 (Name):")}   ${pc.bold(card.name)}`,
          );
          console.log(
            `${pc.green("本机 IP 地址 (IP):")}  ${pc.bold(primaryAddr.address)}`,
          );
          console.log(
            `${pc.green("子网掩码 (Mask):")}   ${primaryAddr.netmask}`,
          );
          console.log(`${pc.green("默认网关 (Gateway):")} ${cardGateway}`);
          console.log(`${pc.green("MAC 地址 (MAC):")}    ${card.mac}`);
          console.log(
            `${pc.green("IP 协议版本:")}       ${primaryAddr.family === "IPv4" || primaryAddr.family === "4" ? "IPv4" : "IPv6"}`,
          );

          if (ipv4 && ipv6) {
            console.log(
              `${pc.green("本地 IPv6 地址:")}     ${pc.dim(ipv6.address)}`,
            );
          }

          console.log(
            pc.cyan("===================================================="),
          );
          console.log("");
        }
      } catch (error) {
        console.error(pc.red("❌ 检测失败。"));
        if (error instanceof Error) {
          console.error(pc.red("错误详情:"), error.message);
        }
      }
    });
}
