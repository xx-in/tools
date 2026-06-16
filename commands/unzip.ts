import { Command } from "npm:commander@^11.0.0";
import pc from "npm:picocolors@^1.0.0";
import { join, basename, extname, resolve } from "jsr:@std/path@^1.0.0";
import { zip } from "jsr:@deno-library/compress@^0.5.5";

export function registerUnzipCommand(program: Command) {
  program
    .command("unzip [zipfile]")
    .description("解压 ZIP 压缩包")
    .option("-d, --dir <directory>", "指定解压到的目标目录路径")
    .action(async (zipfile: string | undefined, options: { dir?: string }) => {
      let srcFile = zipfile;
      if (!srcFile) {
        const input = prompt(
          "请输入要解压的 ZIP 文件路径 (Enter ZIP file path):",
        );
        if (!input) {
          console.error(pc.red("❌ 错误: 未指定有效的 ZIP 文件。"));
          return;
        }
        srcFile = input.trim();
      }

      const absSrcFile = resolve(srcFile);

      try {
        const stat = await Deno.stat(absSrcFile);
        if (!stat.isFile) {
          console.error(pc.red(`❌ 错误: '${srcFile}' 不是一个有效的文件。`));
          return;
        }
      } catch {
        console.error(pc.red(`❌ 错误: 找不到文件 '${srcFile}'。`));
        return;
      }

      // 确定解压目标文件夹
      let destDir = options.dir;
      if (!destDir) {
        // 如果未指定，则默认解包至当前工作目录下与压缩包同名的文件夹中
        const fileName = basename(absSrcFile, extname(absSrcFile));
        destDir = join(Deno.cwd(), fileName);
      } else {
        destDir = resolve(Deno.cwd(), destDir);
      }

      try {
        console.log(pc.cyan(`📦 正在准备解压: ${absSrcFile}...`));
        console.log(pc.cyan(`📥 目标输出目录: ${destDir}`));

        await Deno.mkdir(destDir, { recursive: true });
        await zip.uncompress(absSrcFile, destDir);

        console.log(pc.green(`✨ 解压成功！已保存到: ${destDir}`));
      } catch (error) {
        console.error(pc.red("❌ 解压失败:"), error);
      }
    });
}
