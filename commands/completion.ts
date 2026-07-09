import fs from "node:fs/promises";
import { Command } from "commander";
import c from "../utils/colors.ts";
import { join } from "node:path";

// --- Zsh 补全脚本模板 ---
const ZSH_SCRIPT = `
#compdef xx

_xx() {
  local context state state_descr line
  typeset -A opt_args

  _arguments -C \\
    '1:Cmd:->command' \\
    '*::SubCmd:->args'

  case \$state in
    command)
      local -a subcommands
      subcommands=(
        'completion:自动检测并生成 Shell 补全脚本'
        'copy:复制文件或目录（支持递归复制）'
        'cp:copy 别名'
        'create:递归创建文件或目录'
        'touch:create 别名'
        'format:使用 Prettier 格式化代码'
        'fmt:format 别名'
        'help:显示指定命令的帮助信息'
        'install:macOS/Windows 本地工具安装器 (支持可执行文件、zip、tar 包)'
        'ip:本地活跃网卡及网关侦测'
        'list:多列表格列出目录内容（带边框）'
        'ls:list 别名'
        'move:移动或重命名文件及目录'
        'mv:move 别名'
        'open:在系统文件管理器中打开指定目录'
        'park:City189 Harbor 离线打包镜像下载工具'
        'proxy:管理终端临时代理 (eval "$(xx proxy on -e)" 开启)'
        'remove:安全地将指定的文件或目录移至系统回收站（支持通配符及多选）'
        'rm:remove 别名'
        'search:递归搜索目录下包含指定关键词的文件或目录'
        'find:search 别名'
        'translate:终端翻译工具'
        'dict:translate 别名'
        'uninstall:macOS/Windows 本地工具卸载器（移除安装目录和终端命令入口）'
        'unzip:解压 ZIP 压缩包'
        'upgrade:自动更新 xx 命令行工具至最新版本'
        'which:查找命令在 PATH 中的位置（跨平台 which，跳过 shell 函数）'
        'zip:自动过滤并打包为 ZIP'
      )
      _describe -t subcommands 'xx commands' subcommands
      ;;
    args)
      case \$line[1] in
        copy|cp)
          _arguments \\
            '1:Source:_files' \\
            '2:Target:_files'
          ;;
        create|touch)
          _arguments \\
            '*:Target Path:_files'
          ;;
        format|fmt)
          _arguments \\
            '*:Target Path:_files'
          ;;
        install)
          _arguments \\
            '*:Install Package:_files'
          ;;
        help)
          local -a sub_cmds
          sub_cmds=(
            'completion:自动检测并生成 Shell 补全脚本'
            'copy:复制文件或目录（支持递归复制）'
            'create:递归创建文件或目录'
            'format:使用 Prettier 格式化代码'
            'install:macOS/Windows 本地工具安装器 (支持可执行文件、zip、tar 包)'
            'ip:本地活跃网卡及网关侦测'
            'list:多列表格列出目录内容（带边框）'
            'ls:list 别名'
            'cp:copy 别名'
            'mv:move 别名'
            'rm:remove 别名'
            'fmt:format 别名'
            'touch:create 别名'
            'find:search 别名'
            'move:移动或重命名文件及目录'
            'open:在系统文件管理器中打开指定目录'
            'park:City189 Harbor 离线打包镜像下载工具'
            'proxy:管理终端临时代理 (eval "$(xx proxy on -e)" 开启)'
            'remove:安全地将指定的文件或目录移至系统回收站（支持通配符及多选）'
            'search:递归搜索目录下包含指定关键词的文件或目录'
            'translate:终端翻译工具'
        'dict:translate 别名'
            'uninstall:macOS/Windows 本地工具卸载器（移除安装目录和终端命令入口）'
            'unzip:解压 ZIP 压缩包'
            'upgrade:自动更新 xx 命令行工具至最新版本'
            'which:查找命令在 PATH 中的位置（跨平台 which，跳过 shell 函数）'
            'zip:自动过滤并打包为 ZIP'
          )
          _describe -t sub_cmds 'xx commands' sub_cmds
          ;;
        list|ls)
          _arguments \\
            '-a[显示包括隐藏文件在内的全部项目]' \\
            '*:Target Path:_files -/'
          ;;
        open)
          _arguments \\
            '*:Target Path:_files -/'
          ;;
        move|mv)
          _arguments \\
            '1:Source:_files' \\
            '2:Target:_files'
          ;;
        park)
          _arguments \\
            '-d[指定本次下载保存的目录路径]:directory:_files -/' \\
            '-o[自定义保存的文件名]:filename:_files' \\
            '-g[配置全局默认下载目录]:directory:_files -/' \\
            '*:Image Name:'
          ;;
        proxy)
          _arguments \\
            '1:Action:(on off)' \\
            '2:Port:' \\
            '(-e --export)'{-e,--export}'[输出供 eval 使用的 shell 命令]'
          ;;
        remove|rm)
          _arguments \\
            '*:Target Path:_files'
          ;;
        search|find)
          _arguments \\
            '1:Keyword:' \\
            '2:Directory:_files -/'
          ;;
        translate|dict)
          _arguments \\
            '-t[指定目标语言 (默认 auto)]' \\
            '*:Text:'
          ;;
        uninstall)
          _arguments \\
            '*:Installed App:'
          ;;
        unzip)
          _arguments \\
            '-d[指定解压到的目标目录路径]:directory:_files -/' \\
            '*:Zip File:_files -g "*.zip"'
          ;;
        which)
          _arguments \\
            '-a[列出 PATH 中所有匹配项]' \\
            '*:Command:_command_names -e'
          ;;
        zip)
          _arguments \\
            '*:Target Path:_files'
          ;;
      esac
      ;;
  esac
}

compdef _xx xx
`;

// --- Bash 补全脚本模板 ---
const BASH_SCRIPT = `
_xx_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    opts="completion copy cp create touch format fmt dict help install ip list ls move mv open park proxy remove rm search find translate uninstall unzip upgrade which zip"

    if [[ \${COMP_CWORD} -eq 1 ]] ; then
        COMPREPLY=( \$(compgen -W "\${opts}" -- \${cur}) )
        return 0
    fi

    case "\${COMP_WORDS[1]}" in
        park)
            local sub_opts="-d -o -g"
            COMPREPLY=( \$(compgen -W "\${sub_opts}" -- \${cur}) )
            return 0
            ;;
        proxy)
            if [[ \${COMP_CWORD} -eq 2 ]] ; then
                local sub_opts="on off"
                COMPREPLY=( \$(compgen -W "\${sub_opts}" -- \${cur}) )
                return 0
            elif [[ \${COMP_CWORD} -eq 3 ]] ; then
                local sub_opts="-e --export"
                COMPREPLY=( \$(compgen -W "\${sub_opts}" -- \${cur}) )
                return 0
            fi
            ;;
        unzip)
            local sub_opts="-d"
            COMPREPLY=( \$(compgen -W "\${sub_opts}" -- \${cur}) )
            return 0
            ;;
        translate|dict)
            local sub_opts="-t"
            COMPREPLY=( \$(compgen -W "\${sub_opts}" -- \${cur}) )
            return 0
            ;;
        install|uninstall)
            COMPREPLY=( \$(compgen -f -- "\${cur}") )
            return 0
            ;;
        list|ls)
            if [[ \${COMP_CWORD} -eq 2 ]] ; then
                local sub_opts="-a --all"
                COMPREPLY=( \$(compgen -W "\${sub_opts}" -- \${cur}) )
                return 0
            fi
            COMPREPLY=( \$(compgen -d -- "\${cur}") )
            return 0
            ;;
        which)
            if [[ \${COMP_CWORD} -eq 2 ]] ; then
                local sub_opts="-a"
                COMPREPLY=( \$(compgen -W "\${sub_opts}" -- \${cur}) )
                return 0
            fi
            COMPREPLY=( \$(compgen -c -- "\${cur}") )
            return 0
            ;;
        help)
            local sub_opts="completion copy cp create touch dict format fmt ip list ls move mv open park proxy remove rm search find translate uninstall unzip upgrade which zip"
            COMPREPLY=( \$(compgen -W "\${sub_opts}" -- \${cur}) )
            return 0
            ;;
    esac

    COMPREPLY=( \$(compgen -f -- "\${cur}") )
}
complete -o filenames -o default -o bashdefault -F _xx_completion xx
`;

// --- PowerShell 补全及拦截脚本模板 ---
const POWERSHELL_SCRIPT = `
\$xx_completer = {
    param(\$wordToComplete, \$commandAst, \$cursorPosition)
    \$commands = @("completion", "copy", "cp", "create", "touch", "dict", "format", "fmt", "help", "install", "ip", "list", "ls", "move", "mv", "open", "park", "proxy", "remove", "rm", "search", "find", "translate", "uninstall", "unzip", "upgrade", "which", "zip")
    \$sub_opts = @{
        "park" = @("-d", "-o", "-g")
        "proxy" = @("on", "off", "-e", "--export")
        "unzip" = @("-d")
        "which" = @("-a")
        "translate" = @("-t")
        "dict" = @("-t")
        "list" = @("-a", "--all")
        "ls" = @("-a", "--all")
        "help" = @("completion", "copy", "cp", "create", "touch", "dict", "format", "fmt", "ip", "list", "ls", "move", "mv", "open", "park", "proxy", "remove", "rm", "search", "find", "translate", "uninstall", "unzip", "upgrade", "which", "zip")
    }
    \$tokens = \$commandAst.Elements | ForEach-Object { \$_.Value } | Where-Object { \$_ -ne \$null }
    \$tokenCount = \$tokens.Count

    if (\$tokenCount -le 2) {
        \$commands | Where-Object { \$_ -like "\$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new(\$_, \$_, 'Command', \$_)
        }
    } else {
        \$subCmd = \$tokens[1]
        if (\$sub_opts.ContainsKey(\$subCmd)) {
            \$opts = \$sub_opts[\$subCmd]
            \$opts | Where-Object { \$_ -like "\$wordToComplete*" } | ForEach-Object {
                [System.Management.Automation.CompletionResult]::new(\$_, \$_, 'ParameterName', \$_)
            }
        }
    }
}
Register-ArgumentCompleter -CommandName 'xx' -ScriptBlock \$xx_completer
`;

// 自动化安装实现 (增加了在 Windows 下强制写入 UTF-8 BOM 编码的机制)
export interface AutoInstallCompletionOptions {
  /** upgrade 场景：普通文本输出，仅高亮 source 命令 */
  fromUpgrade?: boolean;
}

export async function autoInstallCompletion(
  options: AutoInstallCompletionOptions = {},
) {
  const { fromUpgrade = false } = options;
  const osType = process.platform;
  const home = process.env["HOME"] || process.env["USERPROFILE"] || "";

  if (!home) {
    console.error(c.error("❌ 错误: 无法定位到用户的根目录。"));
    return;
  }

  if (osType === "win32") {
    const completionPath = join(home, ".xx_completion_xx.ps1");

    try {
      // 👈 核心修复：在文件头部写入标准 UTF-8 BOM 三字节（0xEF, 0xBB, 0xBF），强制 Windows 加载时作为全局 UTF-8 解析
      const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
      const contentBytes = new TextEncoder().encode(POWERSHELL_SCRIPT.trim());
      const mergedBytes = new Uint8Array(bom.length + contentBytes.length);
      mergedBytes.set(bom);
      mergedBytes.set(contentBytes, bom.length);

      // 直接写入合并后的带有 BOM 的二进制字节流
      await fs.writeFile(completionPath, mergedBytes);
      console.log(
        fromUpgrade
          ? `✔ 已创建并覆盖 PowerShell 补全脚本 (UTF-8 BOM): ${completionPath}`
          : c.success(
              `✔ 已创建并覆盖 PowerShell 补全脚本 (UTF-8 BOM): ${c.bold(completionPath)}`,
            ),
      );

      const profileDirs = [
        join(home, "Documents", "WindowsPowerShell"),
        join(home, "Documents", "PowerShell"),
        join(home, "OneDrive", "Documents", "WindowsPowerShell"),
        join(home, "OneDrive", "Documents", "PowerShell"),
      ];

      let isAdded = false;
      const sourceLine = `. "$HOME\\.xx_completion_xx.ps1"`;

      for (const dir of profileDirs) {
        try {
          const profilePath = join(dir, "Microsoft.PowerShell_profile.ps1");
          await fs.mkdir(dir, { recursive: true });

          let content = "";
          try {
            content = await fs.readFile(profilePath, "utf-8");
          } catch {
            // ignore
          }

          if (!content.includes(sourceLine)) {
            const separator =
              content.endsWith("\n") || content === "" ? "" : "\n";
            await fs.writeFile(
              profilePath,
              `${content}${separator}${sourceLine}\n`,
            );
            console.log(
              fromUpgrade
                ? `✔ 已在配置文件中注册补全项: ${profilePath}`
                : c.success(
                    `✔ 已在配置文件中注册补全项: ${c.bold(profilePath)}`,
                  ),
            );
          } else {
            console.log(
              fromUpgrade
                ? `➖ 补全注册项已存在: ${profilePath}`
                : c.dim(`➖ 补全注册项已存在: ${profilePath}`),
            );
          }
          isAdded = true;
        } catch {
          // ignore
        }
      }

      if (isAdded) {
        console.log(
          fromUpgrade
            ? "\n✨ 补全自动配置成功! 请重启 PowerShell 终端以激活 Tab 键自动提示。"
            : c.highlight(
                `\n✨ 补全自动配置成功! 请重启 PowerShell 终端以激活 Tab 键自动提示。`,
              ),
        );
      }
    } catch (err) {
      console.error(
        c.error("❌ 自动配置失败:"),
        err instanceof Error ? err.message : err,
      );
    }
  } else {
    const shellEnv = process.env["SHELL"] || "";
    let shell = "zsh";
    let profileName = ".zshrc";
    let scriptContent = ZSH_SCRIPT;

    if (osType === "linux") {
      shell = "bash";
      profileName = ".bashrc";
      scriptContent = BASH_SCRIPT;
    }

    if (shellEnv.includes("zsh")) {
      shell = "zsh";
      profileName = ".zshrc";
      scriptContent = ZSH_SCRIPT;
    } else if (shellEnv.includes("bash")) {
      shell = "bash";
      profileName = ".bashrc";
      scriptContent = BASH_SCRIPT;
    }

    const completionPath = join(home, ".xx_completion_xx");
    const profilePath = join(home, profileName);

    try {
      await fs.writeFile(completionPath, scriptContent.trim());
      console.log(
        fromUpgrade
          ? `✔ 已创建并覆盖 ${shell} 补全脚本: ${completionPath}`
          : c.success(
              `✔ 已创建并覆盖 ${shell} 补全脚本: ${c.bold(completionPath)}`,
            ),
      );

      let profileContent = "";
      try {
        profileContent = await fs.readFile(profilePath, "utf-8");
      } catch {
        // ignore
      }

      const sourceLine = `source ${completionPath}`;
      if (!profileContent.includes(sourceLine)) {
        const separator =
          profileContent.endsWith("\n") || profileContent === "" ? "" : "\n";
        await fs.writeFile(
          profilePath,
          `${profileContent}${separator}${sourceLine}\n`,
        );
        console.log(
          fromUpgrade
            ? `✔ 已在 ${profileName} 配置文件末尾追加加载代码。`
            : c.success(
                `✔ 已在 ${c.bold(profileName)} 配置文件末尾追加加载代码。`,
              ),
        );
      } else {
        console.log(
          fromUpgrade
            ? `➖ ${profileName} 中已存在加载代码，跳过追加。`
            : c.dim(`➖ ${profileName} 中已存在加载代码，跳过追加。`),
        );
      }

      const sourceCommand = `source ~/${profileName}`;
      console.log(
        fromUpgrade
          ? `\n✨ 补全自动配置成功! 请执行 ${c.command(sourceCommand)} 或重新打开终端以激活 Tab 提示。`
          : c.highlight(
              `\n✨ 补全自动配置成功! 请执行 ${c.bold(
                c.warn(sourceCommand),
              )} 或重新打开终端以激活 Tab 提示。`,
            ),
      );
    } catch (err) {
      console.error(
        c.error("❌ 自动配置失败:"),
        err instanceof Error ? err.message : err,
      );
    }
  }
}

export function registerCompletionCommand(program: Command) {
  program
    .command("completion [shell]")
    .description(
      "自动安装或生成 Shell 命令行自动补全脚本 (支持 bash, zsh, powershell)",
    )
    .action(async (shell: string | undefined) => {
      if (!shell) {
        console.log(c.info("🤖 正在为您自动检测环境并配置命令行自动补全..."));
        await autoInstallCompletion();
      } else {
        const target = shell.toLowerCase();
        if (target === "zsh") {
          console.log(ZSH_SCRIPT.trim());
        } else if (target === "bash") {
          console.log(BASH_SCRIPT.trim());
        } else if (
          target === "powershell" ||
          target === "ps1" ||
          target === "pwsh"
        ) {
          console.log(POWERSHELL_SCRIPT.trim());
        } else {
          console.error(
            c.error(
              `❌ 错误: 暂不支持的 Shell 类型 '${shell}'。可选值: bash, zsh, powershell`,
            ),
          );
        }
      }
    });
}
