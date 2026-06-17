import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
import { join } from "jsr:@std/path@^1.0.0";

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
        'install:自动分发部署安装包 (支持 AppImage、Flatpak ID、tar.gz、deb、rpm)'
        'ip:本地活跃网卡及网关侦测'
        'list:列出目录中的所有文件和目录（含隐藏项）'
        'move:移动或重命名文件及目录'
        'open:在系统文件管理器中打开指定目录'
        'park:City189 Harbor 离线打包镜像下载工具'
        'remove:安全地将指定的文件或目录移至系统回收站（支持通配符及多选）'
        'search:递归搜索目录下包含指定关键词的文件或目录'
        'translate:终端翻译工具'
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
        help)
          local -a sub_cmds
          sub_cmds=(
            'completion:自动检测并生成 Shell 补全脚本'
            'copy:复制文件或目录（支持递归复制）'
            'create:递归创建文件或目录'
            'format:使用 Prettier 格式化代码'
            'install:自动分发部署安装包 (支持 AppImage、Flatpak ID、tar.gz、deb、rpm)'
            'ip:本地活跃网卡及网关侦测'
            'list:列出目录中的所有文件和目录（含隐藏项）'
            'move:移动或重命名文件及目录'
            'open:在系统文件管理器中打开指定目录'
            'park:City189 Harbor 离线打包镜像下载工具'
            'remove:安全地将指定的文件或目录移至系统回收站（支持通配符及多选）'
            'search:递归搜索目录下包含指定关键词的文件或目录'
            'translate:终端翻译工具'
            'unzip:解压 ZIP 压缩包'
            'upgrade:自动更新 xx 命令行工具至最新版本'
            'zip:自动过滤并打包为 ZIP'
          )
          _describe -t sub_cmds 'xx commands' sub_cmds
          ;;
        install)
          _arguments \\
            '*:Target Path:_files'
          ;;
        list)
          _arguments \\
            '*:Target Path:_files -/'
          ;;
        move)
          _arguments \\
            '1:Source:_files' \\
            '2:Target:_files'
          ;;
        open)
          _arguments \\
            '*:Target Path:_files -/'
          ;;
        park)
          _arguments \\
            '-d[指定本次下载保存的目录路径]:directory:_files -/' \\
            '-o[自定义保存的文件名]:filename:_files' \\
            '-g[配置全局默认下载目录]:directory:_files -/' \\
            '*:Image Name:'
          ;;
        remove)
          _arguments \\
            '*:Target Path:_files'
          ;;
        search)
          _arguments \\
            '1:Keyword:' \\
            '2:Directory:_files -/'
          ;;
        translate)
          _arguments \\
            '-t[指定目标语言 (默认 auto)]' \\
            '*:Text:'
          ;;
        unzip)
          _arguments \\
            '-d[指定解压到的目标目录路径]:directory:_files -/' \\
            '*:Zip File:_files -g "*.zip"'
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
    opts="completion copy create format help install ip list move open park remove search translate unzip upgrade zip"

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
        help)
            local sub_opts="completion copy create format ip list move open park remove search translate unzip upgrade zip"
            COMPREPLY=( \$(compgen -W "\${sub_opts}" -- \${cur}) )
            return 0
            ;;
    esac

    COMPREPLY=( \$(compgen -f -- "\${cur}") )
}
complete -o filenames -o default -o bashdefault -F _xx_completion xx
`;

// --- PowerShell 补全脚本模板 ---
const POWERSHELL_SCRIPT = `
\$xx_completer = {
    param(\$wordToComplete, \$commandAst, \$cursorPosition)
    \$commands = @("completion", "copy", "create", "format", "help", "install", "ip", "list", "move", "open", "park", "remove", "search", "translate", "unzip", "upgrade", "zip")
    \$sub_opts = @{
        "park" = @("-d", "-o", "-g")
        "unzip" = @("-d")
        "translate" = @("-t")
        "help" = @("completion", "copy", "create", "format", "ip", "list", "move", "open", "park", "remove", "search", "translate", "unzip", "upgrade", "zip")
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

// 自动化安装实现
export async function autoInstallCompletion() {
  const osType = Deno.build.os;
  const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";

  if (!home) {
    console.error(pc.red("❌ 错误: 无法定位到用户的根目录。"));
    return;
  }

  if (osType === "windows") {
    const completionPath = join(home, ".xx_completion_xx.ps1");

    try {
      await Deno.writeTextFile(completionPath, POWERSHELL_SCRIPT.trim());
      console.log(
        pc.green(
          `✔ 已创建并覆盖 PowerShell 补全脚本: ${pc.bold(completionPath)}`,
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
          await Deno.mkdir(dir, { recursive: true });

          let content = "";
          try {
            content = await Deno.readTextFile(profilePath);
          } catch {
            // ignore
          }

          if (!content.includes(sourceLine)) {
            const separator =
              content.endsWith("\n") || content === "" ? "" : "\n";
            await Deno.writeTextFile(
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
    const shellEnv = Deno.env.get("SHELL") || "";
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
      await Deno.writeTextFile(completionPath, scriptContent.trim());
      console.log(
        pc.green(
          `✔ 已创建并覆盖 ${shell} 补全脚本: ${pc.bold(completionPath)}`,
        ),
      );

      let profileContent = "";
      try {
        profileContent = await Deno.readTextFile(profilePath);
      } catch {
        // ignore
      }

      const sourceLine = `source ${completionPath}`;
      if (!profileContent.includes(sourceLine)) {
        const separator =
          profileContent.endsWith("\n") || profileContent === "" ? "" : "\n";
        await Deno.writeTextFile(
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
