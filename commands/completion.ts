import fs from "node:fs/promises";
import { Command } from "commander";
import pc from "picocolors";
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
        'create:递归创建文件或目录'
        'format:使用 Prettier 格式化代码'
        'help:显示指定命令的帮助信息'
        'install:macOS/Windows 本地工具安装器 (支持可执行文件、zip、tar 包)'
        'ip:本地活跃网卡及网关侦测'
        'list:列出目录中的所有文件和目录（含隐藏项）'
        'move:移动或重命名文件及目录'
        'open:在系统文件管理器中打开指定目录'
        'park:City189 Harbor 离线打包镜像下载工具'
        'proxy:管理终端临时代理 (proxy on [port] 或 proxy off)'
        'remove:安全地将指定的文件或目录移至系统回收站（支持通配符及多选）'
        'search:递归搜索目录下包含指定关键词的文件或目录'
        'translate:终端翻译工具'
        'uninstall:macOS/Windows 本地工具卸载器（移除安装目录和终端命令入口）'
        'unzip:解压 ZIP 压缩包'
        'upgrade:自动更新 xx 命令行工具至最新版本'
        'zip:自动过滤并打包为 ZIP'
      )
      _describe -t subcommands 'xx commands' subcommands
      ;;
    args)
      case \$line[1] in
        copy)
          _arguments \\
            '1:Source:_files' \\
            '2:Target:_files'
          ;;
        create)
          _arguments \\
            '*:Target Path:_files'
          ;;
        format)
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
            'list:列出目录中的所有文件和目录（含隐藏项）'
            'move:移动或重命名文件及目录'
            'open:在系统文件管理器中打开指定目录'
            'park:City189 Harbor 离线打包镜像下载工具'
            'proxy:管理终端临时代理 (proxy on [port] 或 proxy off)'
            'remove:安全地将指定的文件或目录移至系统回收站（支持通配符及多选）'
            'search:递归搜索目录下包含指定关键词的文件或目录'
            'translate:终端翻译工具'
            'uninstall:macOS/Windows 本地工具卸载器（移除安装目录和终端命令入口）'
            'unzip:解压 ZIP 压缩包'
            'upgrade:自动更新 xx 命令行工具至最新版本'
            'zip:自动过滤并打包为 ZIP'
          )
          _describe -t sub_cmds 'xx commands' sub_cmds
          ;;
        list|open)
          _arguments \\
            '*:Target Path:_files -/'
          ;;
        move)
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
            '2:Port:'
          ;;
        remove)
          _arguments \\
            '*:Target Path:_files'
          ;;
        translate)
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
        upgrade)
          _arguments \\
            '-r[强制使用 npm 官方源 https://registry.npmjs.org/]'
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

# --- xx 终端代理 Zsh 拦截包装函数 ---
xx() {
  if [[ "\$1" == "proxy" ]]; then
    if [[ -z "\$2" ]]; then
      if [[ -n "\$http_proxy" || -n "\$https_proxy" || -n "\$all_proxy" || -n "\$HTTP_PROXY" || -n "\$HTTPS_PROXY" || -n "\$ALL_PROXY" ]]; then
        echo "🔍 [xx] 终端当前已配置代理："
        [[ -n "\$http_proxy" ]] && echo "  http_proxy  = \$http_proxy"
        [[ -n "\$https_proxy" ]] && echo "  https_proxy = \$https_proxy"
        [[ -n "\$all_proxy" ]] && echo "  all_proxy   = \$all_proxy"
        [[ -n "\$HTTP_PROXY" ]] && echo "  HTTP_PROXY  = \$HTTP_PROXY"
        [[ -n "\$HTTPS_PROXY" ]] && echo "  HTTPS_PROXY = \$HTTPS_PROXY"
        [[ -n "\$ALL_PROXY" ]] && echo "  ALL_PROXY   = \$ALL_PROXY"
      else
        echo "🔍 [xx] 终端当前未配置任何代理 (直连模式)"
      fi
    elif [[ "\$2" == "on" ]]; then
      local port="\${3:-7890}"
      export http_proxy="http://127.0.0.1:\$port"
      export https_proxy="http://127.0.0.1:\$port"
      export all_proxy="socks5://127.0.0.1:\$port"
      export HTTP_PROXY="http://127.0.0.1:\$port"
      export HTTPS_PROXY="http://127.0.0.1:\$port"
      export ALL_PROXY="socks5://127.0.0.1:\$port"
      echo "✔ [xx] 已开启终端临时代理: 127.0.0.1:\$port"
    elif [[ "\$2" == "off" ]]; then
      unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY
      echo "✔ [xx] 已关闭终端临时代理"
    else
      command xx "\$@"
    fi
  else
    command xx "\$@"
  fi
}
`;

// --- Bash 补全脚本模板 ---
const BASH_SCRIPT = `
_xx_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    opts="completion copy create format help install ip list move open park proxy remove search translate uninstall unzip upgrade zip"

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
            fi
            ;;
        unzip)
            local sub_opts="-d"
            COMPREPLY=( \$(compgen -W "\${sub_opts}" -- \${cur}) )
            return 0
            ;;
        translate)
            local sub_opts="-t"
            COMPREPLY=( \$(compgen -W "\${sub_opts}" -- \${cur}) )
            return 0
            ;;
        install|uninstall)
            COMPREPLY=( \$(compgen -f -- "\${cur}") )
            return 0
            ;;
        upgrade)
            local sub_opts="-r --registry"
            COMPREPLY=( \$(compgen -W "\${sub_opts}" -- \${cur}) )
            return 0
            ;;
        help)
            local sub_opts="completion copy create format ip list move open park proxy remove search translate uninstall unzip upgrade zip"
            COMPREPLY=( \$(compgen -W "\${sub_opts}" -- \${cur}) )
            return 0
            ;;
    esac

    COMPREPLY=( \$(compgen -f -- "\${cur}") )
}
complete -o filenames -o default -o bashdefault -F _xx_completion xx

# --- xx 终端代理 Bash 拦截包装函数 ---
xx() {
  if [[ "\$1" == "proxy" ]]; then
    if [[ -z "\$2" ]]; then
      if [[ -n "\$http_proxy" || -n "\$https_proxy" || -n "\$all_proxy" || -n "\$HTTP_PROXY" || -n "\$HTTPS_PROXY" || -n "\$ALL_PROXY" ]]; then
        echo "🔍 [xx] 终端当前已配置代理："
        [[ -n "\$http_proxy" ]] && echo "  http_proxy  = \$http_proxy"
        [[ -n "\$https_proxy" ]] && echo "  https_proxy = \$https_proxy"
        [[ -n "\$all_proxy" ]] && echo "  all_proxy   = \$all_proxy"
        [[ -n "\$HTTP_PROXY" ]] && echo "  HTTP_PROXY  = \$HTTP_PROXY"
        [[ -n "\$HTTPS_PROXY" ]] && echo "  HTTPS_PROXY = \$HTTPS_PROXY"
        [[ -n "\$ALL_PROXY" ]] && echo "  ALL_PROXY   = \$ALL_PROXY"
      else
        echo "🔍 [xx] 终端当前未配置任何代理 (直连模式)"
      fi
    elif [[ "\$2" == "on" ]]; then
      local port="\${3:-7890}"
      export http_proxy="http://127.0.0.1:\$port"
      export https_proxy="http://127.0.0.1:\$port"
      export all_proxy="socks5://127.0.0.1:\$port"
      export HTTP_PROXY="http://127.0.0.1:\$port"
      export HTTPS_PROXY="http://127.0.0.1:\$port"
      export ALL_PROXY="socks5://127.0.0.1:\$port"
      echo "✔ [xx] 已开启终端临时代理: 127.0.0.1:\$port"
    elif [[ "\$2" == "off" ]]; then
      unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY
      echo "✔ [xx] 已关闭终端临时代理"
    else
      command xx "\$@"
    fi
  else
    command xx "\$@"
  fi
}
`;

// --- PowerShell 补全及拦截脚本模板 ---
const POWERSHELL_SCRIPT = `
\$xx_completer = {
    param(\$wordToComplete, \$commandAst, \$cursorPosition)
    \$commands = @("completion", "copy", "create", "format", "help", "install", "ip", "list", "move", "open", "park", "proxy", "remove", "search", "translate", "uninstall", "unzip", "upgrade", "zip")
    \$sub_opts = @{
        "park" = @("-d", "-o", "-g")
        "proxy" = @("on", "off")
        "unzip" = @("-d")
        "upgrade" = @("-r", "--registry")
        "translate" = @("-t")
        "help" = @("completion", "copy", "create", "format", "ip", "list", "move", "open", "park", "proxy", "remove", "search", "translate", "uninstall", "unzip", "upgrade", "zip")
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

# --- xx 终端代理 PowerShell 拦截包装函数 ---
function xx {
    if (\$args[0] -eq "proxy") {
        if (-not \$args[1]) {
            if (\$env:http_proxy -or \$env:https_proxy -or \$env:all_proxy -or \$env:HTTP_PROXY -or \$env:HTTPS_PROXY -or \$env:ALL_PROXY) {
                Write-Host "🔍 [xx] 终端当前已配置代理：" -ForegroundColor Yellow
                if (\$env:http_proxy)  { Write-Host "  http_proxy  = \$env:http_proxy" }
                if (\$env:https_proxy) { Write-Host "  https_proxy = \$env:https_proxy" }
                if (\$env:all_proxy)   { Write-Host "  all_proxy   = \$env:all_proxy" }
                if (\$env:HTTP_PROXY)  { Write-Host "  HTTP_PROXY  = \$env:HTTP_PROXY" }
                if (\$env:HTTPS_PROXY) { Write-Host "  HTTPS_PROXY = \$env:HTTPS_PROXY" }
                if (\$env:ALL_PROXY)   { Write-Host "  ALL_PROXY   = \$env:ALL_PROXY" }
            } else {
                Write-Host "🔍 [xx] 终端当前未配置任何代理 (直连模式)" -ForegroundColor Green
            }
        } elseif (\$args[1] -eq "on") {
            \$port = if (\$args[2]) { \$args[2] } else { "7890" }
            \$env:http_proxy = "http://127.0.0.1:\$port"
            \$env:https_proxy = "http://127.0.0.1:\$port"
            \$env:all_proxy = "socks5://127.0.0.1:\$port"
            \$env:HTTP_PROXY = "http://127.0.0.1:\$port"
            \$env:HTTPS_PROXY = "http://127.0.0.1:\$port"
            \$env:ALL_PROXY = "socks5://127.0.0.1:\$port"
            Write-Host "✔ [xx] 已开启终端临时代理: 127.0.0.1:\$port" -ForegroundColor Green
        } elseif (\$args[1] -eq "off") {
            Remove-Item env:http_proxy -ErrorAction SilentlyContinue
            Remove-Item env:https_proxy -ErrorAction SilentlyContinue
            Remove-Item env:all_proxy -ErrorAction SilentlyContinue
            Remove-Item env:HTTP_PROXY -ErrorAction SilentlyContinue
            Remove-Item env:HTTPS_PROXY -ErrorAction SilentlyContinue
            Remove-Item env:ALL_PROXY -ErrorAction SilentlyContinue
            Write-Host "✔ [xx] 已关闭终端临时代理" -ForegroundColor Green
        } else {
            & (Get-Command xx -CommandType Application) @args
        }
    } else {
        & (Get-Command xx -CommandType Application) @args
    }
}
`;

// 自动化安装实现 (增加了在 Windows 下强制写入 UTF-8 BOM 编码的机制)
export async function autoInstallCompletion() {
  const osType = process.platform;
  const home = process.env["HOME"] || process.env["USERPROFILE"] || "";

  if (!home) {
    console.error(pc.red("❌ 错误: 无法定位到用户的根目录。"));
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
        pc.green(
          `✔ 已创建并覆盖 PowerShell 补全脚本 (UTF-8 BOM): ${pc.bold(completionPath)}`,
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
              pc.green(`✔ 已在配置文件中注册补全项: ${pc.bold(profilePath)}`),
            );
          } else {
            console.log(pc.dim(`➖ 补全注册项已存在: ${profilePath}`));
          }
          isAdded = true;
        } catch {
          // ignore
        }
      }

      if (isAdded) {
        console.log(
          pc.magenta(
            `\n✨ 补全自动配置成功! 请重启 PowerShell 终端以激活 Tab 键自动提示。`,
          ),
        );
      }
    } catch (err) {
      console.error(
        pc.red("❌ 自动配置失败:"),
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
        pc.green(
          `✔ 已创建并覆盖 ${shell} 补全脚本: ${pc.bold(completionPath)}`,
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
          pc.green(`✔ 已在 ${pc.bold(profileName)} 配置文件末尾追加加载代码。`),
        );
      } else {
        console.log(pc.dim(`➖ ${profileName} 中已存在加载代码，跳过追加。`));
      }

      console.log(
        pc.magenta(
          `\n✨ 补全自动配置成功! 请执行 ${pc.bold(
            pc.yellow(`source ~/${profileName}`),
          )} 或重新打开终端以激活 Tab 提示。`,
        ),
      );
    } catch (err) {
      console.error(
        pc.red("❌ 自动配置失败:"),
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
        console.log(pc.cyan("🤖 正在为您自动检测环境并配置命令行自动补全..."));
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
            pc.red(
              `❌ 错误: 暂不支持的 Shell 类型 '${shell}'。可选值: bash, zsh, powershell`,
            ),
          );
        }
      }
    });
}
