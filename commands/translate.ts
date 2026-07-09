import { Command } from "commander";
import c from "../utils/colors.ts";
import { translate } from "google-translate-api-x";
import readline from "node:readline";
import process from "node:process";

interface CommandOptions {
  to: string;
}

interface TranslationResult {
  text: string;
  from: {
    language: {
      didYouMean: boolean;
      iso: string;
    };
    text: {
      autoCorrected: boolean;
      value: string;
      didYouMean: boolean;
    };
  };
}

// 自动检测目标语言：包含英文字母则转中文 (zh-CN)，否则转英文 (en)
function detectTargetLanguage(text: string, userSpecifiedLang: string): string {
  if (userSpecifiedLang && userSpecifiedLang !== "auto") {
    return userSpecifiedLang;
  }
  return /[a-zA-Z]/.test(text) ? "zh-CN" : "en";
}

// 核心翻译函数
async function performTranslation(
  text: string,
  userSpecifiedLang: string,
): Promise<void> {
  try {
    const targetLang = detectTargetLanguage(text, userSpecifiedLang);
    const res = (await translate(text, {
      to: targetLang,
    })) as unknown as TranslationResult;

    console.log(
      `${c.success("译文:")} ${c.bold(res.text)} ${c.dim(`(${res.from.language.iso} -> ${targetLang})`)}`,
    );
  } catch (err) {
    if (err instanceof Error) {
      console.error(c.error("❌ 翻译出错:"), err.message);
    } else {
      console.error(c.error("❌ 翻译出错:"), String(err));
    }
  }
}

// 交互模式函数
function startInteractiveMode(userSpecifiedLang: string): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: c.prompt("翻译输入 > "),
  });

  const modeTip =
    userSpecifiedLang === "auto"
      ? "智能自动识别"
      : `强制目标语言: ${userSpecifiedLang}`;

  console.log(c.warn(`✨ 已进入交互模式 (${modeTip})`));
  console.log(c.dim('输入 "exit" 或按 Ctrl+C 退出\n'));

  rl.prompt();

  rl.on("line", async (line: string) => {
    const input = line.trim();

    if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
      rl.close();
      return;
    }

    if (input) {
      await performTranslation(input, userSpecifiedLang);
    }

    console.log();
    rl.prompt();
  }).on("close", () => {
    console.log(c.bye("\n再见!"));
    process.exit(0);
  });
}

export function registerTanslateCommand(program: Command) {
  program
    .command("translate [text]")
    .alias("dict")
    .description("终端翻译工具 (支持自动中英互译及交互模式)")
    .option(
      "-t, --to <lang>",
      "指定目标语言 (不传则根据输入自动中英互译)",
      "auto",
    )
    .action(async (text: string | undefined, options: CommandOptions) => {
      if (text) {
        await performTranslation(text, options.to);
      } else {
        startInteractiveMode(options.to);
      }
    });
}
