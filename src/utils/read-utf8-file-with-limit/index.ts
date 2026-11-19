import { closeSync, openSync, readSync } from "node:fs";

/** Default maximum size for persisted application state files. */
export const MAX_STATE_FILE_BYTES = 4096;

/**
 * Reads a UTF-8 file while rejecting content larger than the provided byte limit.
 *
 * @param filePath Path to the file to read.
 * @param maxBytes Maximum number of bytes accepted.
 * @returns The file contents decoded as UTF-8.
 * @throws If the limit is invalid, the file cannot be read, or it is oversized.
 */
export const readUtf8FileWithLimit = (filePath: string, maxBytes: number): string => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError("maxBytes must be a positive safe integer.");
  }

  const descriptor = openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes + 1);
    let bytesRead = 0;

    while (bytesRead < buffer.length) {
      const count = readSync(descriptor, buffer, bytesRead, buffer.length - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }

    if (bytesRead > maxBytes) {
      throw new Error(`File "${filePath}" exceeds the ${maxBytes}-byte limit.`);
    }

    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    closeSync(descriptor);
  }
};
