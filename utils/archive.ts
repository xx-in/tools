import AdmZip from "adm-zip";
import * as tar from "tar";
import { mkdir } from "node:fs/promises";

export async function compressZip(
  sourceDir: string,
  outputPath: string,
): Promise<void> {
  const zip = new AdmZip();
  zip.addLocalFolder(sourceDir);
  zip.writeZip(outputPath);
}

export async function uncompressZip(
  src: string,
  destDir: string,
): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const zip = new AdmZip(src);
  zip.extractAllTo(destDir, true);
}

export async function uncompressTar(
  src: string,
  destDir: string,
): Promise<void> {
  await mkdir(destDir, { recursive: true });
  await tar.x({ file: src, cwd: destDir });
}

export async function uncompressTgz(
  src: string,
  destDir: string,
): Promise<void> {
  await mkdir(destDir, { recursive: true });
  await tar.x({ file: src, gzip: true, cwd: destDir });
}
