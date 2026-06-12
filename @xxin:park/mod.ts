#!/usr/bin/env deno

import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
import process from "node:process";
import { join, isAbsolute, resolve, dirname } from "jsr:@std/path@^1.0.0";

const program = new Command();
const CONFIG_FILE_NAME = ".park_config.json";

interface Config {
  defaultDownloadDir?: string;
}

// 获取全局配置文件路径
function getConfigFile(): string {
  const home =
    Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || Deno.cwd();
  return join(home, CONFIG_FILE_NAME);
}

// 读取全局配置
async function readConfig(): Promise<Config> {
  try {
    const path = getConfigFile();
    const content = await Deno.readTextFile(path);
    return JSON.parse(content);
  } catch {
    return {};
  }
}

// 写入全局配置
async function writeConfig(config: Config): Promise<void> {
  try {
    const path = getConfigFile();
    await Deno.writeTextFile(path, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error(pc.red("❌ 写入全局配置文件失败:"), err);
  }
}

async function downloadImage(
  imageName: string,
  outputFilename?: string,
  targetDir?: string,
): Promise<void> {
  const prefix = "local.harbor.com/park-project/";

  // 规范化镜像名称
  let cleanName = imageName.trim();
  if (cleanName.startsWith(prefix)) {
    cleanName = cleanName.substring(prefix.length);
  } else if (cleanName.startsWith("local.harbor.com%2Fpark-project%2F")) {
    cleanName = decodeURIComponent(cleanName).substring(prefix.length);
  }

  const fullImageName = prefix + cleanName;
  console.log(pc.cyan(`📦 目标镜像: ${pc.bold(fullImageName)}`));
  console.log(pc.dim("正在向打包服务器提交任务，请稍候...\n"));

  try {
    // 1. 发送 POST 请求触发打包
    const response = await fetch("https://city189.cn:1091/", {
      method: "POST",
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "zh-CN,zh;q=0.9",
        "cache-control": "max-age=0",
        "content-type": "application/x-www-form-urlencoded",
        "sec-ch-ua":
          '"Chromium";v="146", "Not-A.Brand";v="24", "Microsoft Edge";v="146"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
      },
      body: `image_names=${encodeURIComponent(fullImageName)}`,
      redirect: "manual",
    });

    let downloadUrl = "";
    let matchedFilename = "";

    // 2. 尝试从响应头或响应体中提取下载地址
    const redirectUrl = response.headers.get("location");
    if (redirectUrl) {
      downloadUrl = redirectUrl.startsWith("http")
        ? redirectUrl.replace(/^http:/i, "https:")
        : `https://city189.cn:1091${redirectUrl.startsWith("/") ? "" : "/"}${redirectUrl}`;
      const filenameMatch = downloadUrl.match(/bundle_[a-f0-9]+\.tar/i);
      if (filenameMatch) {
        matchedFilename = filenameMatch[0];
      }
    } else {
      const text = await response.text();
      const match = text.match(/bundle_[a-f0-9]+\.tar/i);
      if (match) {
        matchedFilename = match[0];
        downloadUrl = `https://city189.cn:1091/download/${matchedFilename}`;
      } else {
        console.error(pc.red("❌ 未能在服务器响应中匹配到打包文件名。"));
        console.log(pc.yellow("服务器原始响应如下："));
        console.log(text);
        throw new Error("无法提取打包后的文件名");
      }
    }

    console.log(pc.green(`✅ 打包任务提交成功!`));
    console.log(pc.green(`🔗 下载链接: ${pc.underline(downloadUrl)}`));

    // 3. 执行 GET 请求进行下载
    console.log(pc.cyan(`\n📥 开始下载: ${matchedFilename}...`));
    const downloadRes = await fetch(downloadUrl, {
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "sec-ch-ua":
          '"Chromium";v="146", "Not-A.Brand";v="24", "Microsoft Edge";v="146"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "upgrade-insecure-requests": "1",
      },
    });

    if (!downloadRes.ok) {
      throw new Error(`下载接口响应失败，HTTP 状态码: ${downloadRes.status}`);
    }

    const contentLengthStr = downloadRes.headers.get("content-length");
    const totalBytes = contentLengthStr ? parseInt(contentLengthStr, 10) : 0;
    let downloadedBytes = 0;

    // 4. 解析目标下载目录
    let downloadDir: string;
    if (targetDir) {
      // 传入了临时目录参数，支持各种相对路径（如 ./、../ 等）或绝对路径
      downloadDir = resolve(Deno.cwd(), targetDir);
    } else {
      // 未传入临时目录，尝试读取全局配置，如果未配置则默认当前工作目录 (CWD)
      const config = await readConfig();
      downloadDir = config.defaultDownloadDir
        ? config.defaultDownloadDir
        : Deno.cwd();
    }

    // 确定最终保存文件路径
    const baseFilename = outputFilename || matchedFilename || "bundle.tar";
    const finalPath = isAbsolute(baseFilename)
      ? baseFilename
      : join(downloadDir, baseFilename);

    // 在必要时创建目标文件夹
    const targetDirToCreate = dirname(finalPath);
    try {
      await Deno.mkdir(targetDirToCreate, { recursive: true });
    } catch {
      // 忽略目录已存在的报错
    }

    const file = await Deno.open(finalPath, {
      write: true,
      create: true,
      truncate: true,
    });

    if (downloadRes.body) {
      const reader = downloadRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          await file.write(value);
          downloadedBytes += value.length;

          if (totalBytes > 0) {
            const percent = ((downloadedBytes / totalBytes) * 100).toFixed(2);
            const mb = (downloadedBytes / 1024 / 1024).toFixed(2);
            const totalMb = (totalBytes / 1024 / 1024).toFixed(2);
            Deno.stdout.writeSync(
              new TextEncoder().encode(
                `\r📥 进度: ${percent}% (${mb} MB / ${totalMb} MB)`,
              ),
            );
          } else {
            const mb = (downloadedBytes / 1024 / 1024).toFixed(2);
            Deno.stdout.writeSync(
              new TextEncoder().encode(`\r📥 已下载: ${mb} MB`),
            );
          }
        }
      }
    }
    file.close();
    console.log("\n" + pc.green(`✨ 下载并保存成功! 文件路径: ${finalPath}`));
  } catch (error: unknown) {
    console.error(pc.red("\n❌ 执行失败。"));
    if (error instanceof Error) {
      console.error(pc.red("错误详情:"), error.message);
    }
  }
}

program
  .name("park")
  .description("City189 Harbor 离线打包镜像下载工具")
  .version("0.1.2")
  .argument(
    "[image]",
    "需要下载的镜像名称及版本 (例如: dsxc-park-ioc-all:v0.1.8)",
  )
  .option(
    "-d, --dir <directory>",
    "指定本次下载保存的目录路径 (支持相对路径如 ./ 、../ 或绝对路径)",
  )
  .option("-o, --output <filename>", "自定义保存的文件名")
  .option("-g, --global <path>", "配置全局默认下载目录")
  .action(
    async (
      image: string | undefined,
      options: { output?: string; dir?: string; global?: string },
    ): Promise<void> => {
      // 1. 如果用户输入了全局配置选项，保存后直接退出
      if (options.global) {
        const absPath = resolve(Deno.cwd(), options.global);
        await writeConfig({ defaultDownloadDir: absPath });
        console.log(pc.green(`✨ 已成功设置全局默认下载目录为: ${absPath}`));
        Deno.exit(0);
      }

      // 2. 正常下载逻辑，校验是否传入了镜像参数
      if (!image) {
        console.error(pc.red("❌ 错误: 未指定需要下载的镜像名称。"));
        program.outputHelp();
        Deno.exit(1);
      }

      await downloadImage(image, options.output, options.dir);
    },
  );

program.parse(process.argv);
