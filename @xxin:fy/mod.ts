#!/usr/bin/env deno

import { translate } from 'npm:google-translate-api-x@^10.0.0';
import { Command } from 'npm:commander@^11.0.0';
import pc from 'npm:picocolors@^1.0.0';
import readline from 'node:readline';
import process from 'node:process';

// 定义命令行选项的类型接口
interface CommandOptions {
  to: string;
}

// 定义翻译结果的类型接口（根据 google-translate-api-x 的结构）
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

const program = new Command();

// 自动检测目标语言：包含英文字母则转中文 (zh-CN)，否则转英文 (en)
function detectTargetLanguage(text: string, userSpecifiedLang: string): string {
  // 如果用户明确指定了 -t 参数，且不是默认值 'auto'，则尊重用户选择
  if (userSpecifiedLang && userSpecifiedLang !== 'auto') {
    return userSpecifiedLang;
  }
  // 检测是否包含英文字母 a-z 或 A-Z
  return /[a-zA-Z]/.test(text) ? 'zh-CN' : 'en';
}

// 核心翻译函数
async function performTranslation(text: string, userSpecifiedLang: string): Promise<void> {
  try {
    const targetLang = detectTargetLanguage(text, userSpecifiedLang);
    // 使用 unknown 转换进行安全的类型断言
    const res = await translate(text, { to: targetLang }) as unknown as TranslationResult;
    
    console.log(
      `${pc.green('译文:')} ${pc.bold(res.text)} ${pc.dim(`(${res.from.language.iso} -> ${targetLang})`)}`
    );
  } catch (err) {
    if (err instanceof Error) {
      console.error(pc.red('❌ 翻译出错:'), err.message);
    } else {
      console.error(pc.red('❌ 翻译出错:'), String(err));
    }
  }
}

// 交互模式函数
function startInteractiveMode(userSpecifiedLang: string): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: pc.cyan('翻译输入 > ')
  });

  const modeTip = userSpecifiedLang === 'auto' 
    ? '智能自动识别' 
    : `强制目标语言: ${userSpecifiedLang}`;

  console.log(pc.yellow(`✨ 已进入交互模式 (${modeTip})`));
  console.log(pc.dim('输入 "exit" 或按 Ctrl+C 退出\n'));

  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();
    
    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      rl.close();
      return;
    }

    if (input) {
      // 每次交互都重新触发语种检测
      await performTranslation(input, userSpecifiedLang);
    }
    
    console.log(); // 换行增加美观度
    rl.prompt();
  }).on('close', () => {
    console.log(pc.blue('\n再见!'));
    process.exit(0);
  });
}

// 命令行参数配置
program
  .name('fy')
  .description('终端翻译工具 (支持自动中英互译及交互模式)')
  .version('1.2.0')
  .argument('[text]', '要翻译的文本 (如果不填则进入交互模式)')
  // 将默认值设为 'auto'，方便内部判断是否启用了自动识别
  .option('-t, --to <lang>', '指定目标语言 (不传则根据输入自动中英互译)', 'auto')
  .action(async (text: string | undefined, options: CommandOptions) => {
    if (text) {
      // 模式 A: 直接翻译并退出
      await performTranslation(text, options.to);
    } else {
      // 模式 B: 进入持续输入模式
      startInteractiveMode(options.to);
    }
  });

program.parse(process.argv);