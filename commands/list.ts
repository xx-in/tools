import fs from "node:fs/promises";
import { Command } from "commander";
import c from "../utils/colors.ts";
import { displayWidth } from "../utils/text-width.ts";
import { resolve } from "node:path";

interface ListItem {
  name: string;
  nameCell: string;
}

const BORDER = {
  v: "│",
  h: "─",
  tl: "┌",
  tr: "┐",
  bl: "└",
  br: "┘",
  ml: "├",
  mr: "┤",
  tm: "┬",
  bm: "┴",
  mm: "┼",
} as const;

function getDisplayName(entry: import("node:fs").Dirent): string {
  const trimmed = entry.name.trim();
  return entry.isDirectory() ? `${trimmed}/` : trimmed;
}

function formatName(entry: import("node:fs").Dirent): string {
  const name = getDisplayName(entry);
  if (name.startsWith(".")) {
    return c.hidden(name);
  }
  return c.file(name);
}

function buildListItems(entries: import("node:fs").Dirent[]): ListItem[] {
  return entries.map((entry) => ({
    name: getDisplayName(entry),
    nameCell: formatName(entry),
  }));
}

function getTerminalWidth(): number {
  const columns = process.stdout.columns;
  return columns && columns > 0 ? columns : 80;
}

function printList(items: ListItem[]): void {
  const terminalWidth = getTerminalWidth();
  const cellPad = 1;
  const maxNameWidth = Math.max(
    ...items.map((item) => displayWidth(item.name)),
    1,
  );
  const cellWidth = maxNameWidth + cellPad * 2;
  const colCount = Math.max(
    1,
    Math.floor((terminalWidth - 1) / (cellWidth + 1)),
  );

  const border = (text: string) => c.dim(text);

  const horizontalLine = (left: string, mid: string, right: string) => {
    const segment = BORDER.h.repeat(cellWidth);
    return border(
      left + (segment + mid).repeat(colCount - 1) + segment + right,
    );
  };

  const formatCell = (item: ListItem | undefined) => {
    if (!item) {
      return " ".repeat(cellWidth);
    }

    const innerPad = Math.max(0, maxNameWidth - displayWidth(item.name));
    return " ".repeat(cellPad) + item.nameCell + " ".repeat(cellPad + innerPad);
  };

  const buildRow = (row: ListItem[]) => {
    const cells = Array.from({ length: colCount }, (_, index) => row[index]);
    return (
      border(BORDER.v) +
      cells.map((item) => formatCell(item)).join(border(BORDER.v)) +
      border(BORDER.v)
    );
  };

  const rows: ListItem[][] = [];
  for (let i = 0; i < items.length; i += colCount) {
    rows.push(items.slice(i, i + colCount));
  }

  console.log(horizontalLine(BORDER.tl, BORDER.tm, BORDER.tr));

  for (let i = 0; i < rows.length; i++) {
    console.log(buildRow(rows[i]));
    if (i < rows.length - 1) {
      console.log(horizontalLine(BORDER.ml, BORDER.mm, BORDER.mr));
    }
  }

  console.log(horizontalLine(BORDER.bl, BORDER.bm, BORDER.br));
}

export function registerLsCommand(program: Command) {
  program
    .command("list [path]")
    .alias("ls")
    .description("多列表格列出目录内容，带边框、无表头（默认不含隐藏项）")
    .option("-a, --all", "显示包括隐藏文件在内的全部项目")
    .action(
      async (targetPath: string | undefined, options: { all?: boolean }) => {
        const inputPath = targetPath || ".";
        const absolutePath = resolve(process.cwd(), inputPath);

        try {
          const stat = await fs.stat(absolutePath);
          if (!stat.isDirectory()) {
            console.error(
              c.error(`❌ 错误: '${inputPath}' 不是一个有效的目录。`),
            );
            return;
          }

          const entries: import("node:fs").Dirent[] = [];
          for (const entry of await fs.readdir(absolutePath, {
            withFileTypes: true,
          })) {
            entries.push(entry);
          }

          const visible = options.all
            ? entries
            : entries.filter((entry) => !entry.name.startsWith("."));

          if (visible.length === 0) {
            console.log(c.dim("（空目录）"));
            return;
          }

          visible.sort((a, b) => a.name.trim().localeCompare(b.name.trim()));

          printList(buildListItems(visible));
        } catch (err) {
          console.error(
            c.error(`❌ 无法读取目录内容:`),
            err instanceof Error ? err.message : err,
          );
        }
      },
    );
}
