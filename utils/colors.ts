import chalk from "chalk";

/** 按输出语义统一的 CLI 配色 */
const c = {
  /** 错误、失败 */
  error: chalk.red,
  /** 成功、完成 */
  success: chalk.green,
  /** 警告、提示注意 */
  warn: chalk.yellow,
  /** 进行中的操作、引导信息 */
  info: chalk.cyan,
  /** 次要信息、跳过项 */
  dim: chalk.dim,
  /** 强调 */
  bold: chalk.bold,
  /** 链接 */
  link: chalk.underline.cyan,
  /** 目录、主色强调 */
  accent: chalk.blue,
  /** 目录名 */
  dir: chalk.blue.bold,
  /** 普通文件名 */
  file: chalk.white,
  /** 隐藏文件/目录 */
  hidden: chalk.dim.gray,
  /** 字段标签 */
  label: chalk.green,
  /** 字段值 */
  value: chalk.bold.white,
  /** 命令、可执行片段 */
  command: chalk.yellow.bold,
  /** 特殊完成态、高亮块 */
  highlight: chalk.magenta,
  /** 交互提示 */
  prompt: chalk.cyan.bold,
  /** 告别、退出 */
  bye: chalk.blue,
} as const;

export default c;
