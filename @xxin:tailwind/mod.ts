// tailwind-optimizer.ts
import { relative } from "jsr:@std/path@^1.0.0";
import { twMerge } from "npm:tailwind-merge@^2.0.0"; // 🌟 引入轻量级合并引擎，无需 ESLint [INDEX_1.3.3]

// Tailwind CSS 标准间距尺度表
const VALID_SPACING = new Set([
  "0", "0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "5", "6", "7", "8", "9", "10",
  "11", "12", "14", "16", "20", "24", "28", "32", "36", "40", "44", "48", "52", "56",
  "60", "64", "72", "80", "96"
]);

/**
 * 1. 任意值网格数学换算
 */
function convertArbitraryValue(prefix: string, rawVal: string): string | null {
  const val = rawVal.trim().toLowerCase();
  let numericVal = 0;
  let unit = "";

  if (val.endsWith("px")) {
    numericVal = parseFloat(val.slice(0, -2));
    unit = "px";
  } else if (val.endsWith("rem")) {
    numericVal = parseFloat(val.slice(0, -3));
    unit = "rem";
  } else {
    return null;
  }

  if (isNaN(numericVal)) return null;

  const calculated = unit === "px" ? numericVal / 4 : numericVal * 4;
  const calculatedStr = parseFloat(calculated.toFixed(2)).toString();

  if (VALID_SPACING.has(calculatedStr)) {
    return `${prefix}-${calculatedStr}`;
  }

  return null;
}

/**
 * 2. 核心：单条类名字符串的优化（换算 -> 冲突合并 -> 去重）
 */
function optimizeClassString(classStr: string): string {
  // 拆分所有类名
  const classes = classStr.split(/\s+/).filter(Boolean);
  
  // 第一步：换算不必要的任意值
  const mapped = classes.map(cls => {
    const match = cls.match(/^(-?)(w|h|m|mt|mr|mb|ml|mx|my|p|pt|pr|pb|pl|px|py|gap|gap-x|gap-y|top|bottom|left|right|inset|space-x|space-y|translate-x|translate-y|size)-\[([^\]]+)\]$/);
    if (match) {
      const [_, sign, prefix, rawVal] = match;
      const converted = convertArbitraryValue(prefix, rawVal);
      if (converted) {
        return `${sign}${converted}`;
      }
    }
    return cls;
  });

  // 第二步：使用 twMerge 自动合并冲突（如 p-4 p-6 保留 p-6）、自动去重复类名 [INDEX_1.3.3]
  return twMerge(mapped.join(" "));
}

/**
 * 3. 智能模板字符串分割优化（不影响 ${} 动态插值）
 */
function optimizeTemplateLiteral(literalContent: string): string {
  // 匹配 ${...} 插值块
  const parts = literalContent.split(/(\$\{[^}]+\})/g);
  return parts.map(part => {
    // 如果是动态插值，保持原样
    if (part.startsWith("${") && part.endsWith("}")) {
      return part;
    }
    // 静态文本部分，安全进行类名优化
    return optimizeClassString(part);
  }).join("");
}

/**
 * 4. 递归扫描目标文件
 */
async function getFiles(dir: string, fileList: string[] = []): Promise<string[]> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      if (["node_modules", ".git", ".astro", "dist", ".vercel", "output", ".next"].includes(entry.name)) {
        continue;
      }
      await getFiles(path, fileList);
    } else if (entry.isFile) {
      if (/\.(svelte|astro|vue|js|ts|jsx|tsx|html|css)$/.test(entry.name)) {
        fileList.push(path);
      }
    }
  }
  return fileList;
}

async function main() {
  const cwd = Deno.cwd();
  
  try {
    const files = await getFiles(cwd);
    const modifiedFiles: string[] = [];

    // 正则 A：精准匹配模版和标签中所有的类名属性
    // 支持 class="...", className='...', className={`...`}, :class="..." 等
    const attrRegex = /\b(class|className|:class)\s*=\s*(?:(["'])(.*?)\2|{(\s*`[\s\S]*?`\s*)}|{(\s*["'][\s\S]*?["']\s*)})/g;

    // 正则 B：匹配 CSS 样式表中的 @apply 语句 [INDEX_1.2.3] const applyRegex = /@apply\s+([^;]+);/g;

    for (const filePath of files) {
      const content = await Deno.readTextFile(filePath);
      let wasModified = false;

      // 优化 HTML/JSX 标签属性
      let newContent = content.replace(attrRegex, (match, attrName, quote, simpleContent, backtickContent, curlyQuoteContent) => {
        // 1. 处理普通引号类名 (class="p-6")
        if (simpleContent !== undefined) {
          if (attrName === ":class" && (simpleContent.includes("{") || simpleContent.includes("["))) {
            return match; // 忽略复杂的 Vue/Svelte 动态对象绑定，保证绝对安全
          }
          const optimized = optimizeClassString(simpleContent);
          if (optimized !== simpleContent) {
            wasModified = true;
            return `${attrName}=${quote}${optimized}${quote}`;
          }
        }
        
        // 2. 处理大括号里的模板字符串 (className={`p-4${active ? 'bg-red' : ''}`})
        if (backtickContent !== undefined) {
          const inner = backtickContent.trim().slice(1, -1);
          const optimizedInner = optimizeTemplateLiteral(inner);
          if (optimizedInner !== inner) {
            wasModified = true;
            return `${attrName}={` + "`" + optimizedInner + "`" + "}";
          }
        }

        // 3. 处理大括号里的普通引号 (className={"p-6"})
        if (curlyQuoteContent !== undefined) {
          const inner = curlyQuoteContent.trim().slice(1, -1);
          const optimizedInner = optimizeClassString(inner);
          if (optimizedInner !== inner) {
            wasModified = true;
            const borderQuote = curlyQuoteContent.trim().charAt(0);
            return `${attrName}={${borderQuote}${optimizedInner}${borderQuote}}`;
          }
        }

        return match;
      });

      // 优化 CSS 样式表中的 @apply newContent = newContent.replace(applyRegex, (match, classList) => { const optimized = optimizeClassString(classList);
        if (optimized !== classList) {
          wasModified = true;
          return `@apply ${optimized};`;
        }
        return match;
      });

      if (wasModified) {
        await Deno.writeTextFile(filePath, newContent);
        modifiedFiles.push(filePath);
      }
    }

    if (modifiedFiles.length > 0) {
      console.log("已优化并修复以下文件中的所有 Tailwind 警告与冲突：");
      for (const file of modifiedFiles) {
        console.log(`  - ./${relative(cwd, file)}`);
      }
      console.log(`\n✨ 处理完成，共优化了 ${modifiedFiles.length} 个文件。`);
    } else {
      console.log("未发现需要优化的 Tailwind 警告。");
    }

  } catch (error) {
    console.error("执行失败:", error instanceof Error ? error.message : error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}