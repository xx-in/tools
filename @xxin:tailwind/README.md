# @xxin/tailwind

一键将项目中不必要的 Tailwind CSS 任意值（如 `w-[28px]`）智能换算并自动修复为标准工具类（如 `w-7`）的命令行工具。

## 安装为全局脚本

您可以为其授予最小化的文件读写、系统与环境变量读取权限：

```sh
deno install --global -n tailwind -A -f jsr:@xxin/tailwind/bin