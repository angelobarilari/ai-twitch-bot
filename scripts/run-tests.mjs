import { readdirSync, realpathSync, statSync, watch } from "node:fs";
import { resolve, relative, sep, isAbsolute } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Discovers source tests recursively without following symlinks or shell globs.
 * @param directory Directory to inspect.
 * @returns Sorted absolute paths of TypeScript tests.
 */
export const discoverTests = (directory) =>
  readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist"
        ? discoverTests(resolve(directory, entry.name))
        : entry.isFile() && entry.name.endsWith(".test.ts")
          ? [resolve(directory, entry.name)]
          : [],
    )
    .sort();

/**
 * Runs isolated TypeScript tests and forwards the runner's exit status.
 * @param args Optional watch flag or explicit files underneath src.
 * @returns Nothing.
 */
export const runTests = (args) => {
  const root = fileURLToPath(new URL("../src/", import.meta.url));
  const watching = args.includes("--watch");
  const selected = args.filter((arg) => arg !== "--watch");
  const files = selected.length
    ? selected.map((file) => {
        const path = realpathSync(resolve(file));
        const within = relative(root, path);
        if (
          within.startsWith(`..${sep}`) ||
          within === ".." ||
          isAbsolute(within) ||
          !path.endsWith(".test.ts") ||
          !statSync(path).isFile()
        )
          throw new Error("Select a .test.ts file inside src.");
        return path;
      })
    : discoverTests(root);
  if (!files.length) throw new Error("No source tests found.");
  if (watching) {
    let child;
    let restartTimer;
    let pending = false;
    let closing = false;
    /**
     * Rediscovers tests in a fresh runner process after source changes.
     * @returns Nothing.
     */
    const launch = () => {
      if (closing) return;
      child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...selected], {
        stdio: "inherit",
      });
      child.on("error", () => {
        process.exitCode = 1;
      });
      child.on("exit", () => {
        child = undefined;
        if (pending) {
          pending = false;
          launch();
        }
      });
    };
    const watcher = watch(root, { recursive: true }, (_event, filename) => {
      if (!filename?.endsWith(".ts")) return;
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        if (child) {
          pending = true;
          child.kill();
        } else launch();
      }, 100);
    });
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, () => {
        closing = true;
        pending = false;
        clearTimeout(restartTimer);
        watcher.close();
        child?.kill();
      });
    launch();
    return;
  }
  const child = spawn(process.execPath, ["--import", "tsx", "--test", ...files], {
    stdio: "inherit",
  });
  child.on("error", () => {
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runTests(process.argv.slice(2));
