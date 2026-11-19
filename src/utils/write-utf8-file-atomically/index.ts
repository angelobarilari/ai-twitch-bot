import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

type WriteContents = (descriptor: number, contents: string) => void;

/**
 * Writes UTF-8 content through a temporary file and atomic rename.
 *
 * @param filePath Destination path for the file.
 * @param contents UTF-8 content to write.
 * @param writeContents Writer for the temporary file; defaults to the filesystem writer.
 * @returns Nothing.
 * @throws If writing, replacing the destination, or cleaning up fails.
 */
export const writeUtf8FileAtomically = (
  filePath: string,
  contents: string,
  writeContents: WriteContents = (descriptor, value) => writeFileSync(descriptor, value, "utf8"),
): void => {
  const directory = dirname(filePath);
  mkdirSync(directory, { recursive: true });

  const temporaryPath = join(
    directory,
    `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let descriptor: number | undefined;

  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeContents(descriptor, contents);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, filePath);
  } catch (error) {
    if (typeof descriptor === "number") closeSync(descriptor);

    try {
      unlinkSync(temporaryPath);
    } catch (cleanupError) {
      if (
        typeof cleanupError !== "object" ||
        cleanupError === null ||
        !("code" in cleanupError) ||
        cleanupError.code !== "ENOENT"
      ) {
        throw new Error(`Failed to remove temporary state file "${temporaryPath}".`, {
          cause: cleanupError,
        });
      }
    }

    throw error;
  }
};
