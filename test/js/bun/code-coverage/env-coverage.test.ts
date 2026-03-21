import { test, expect } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import fs from "fs";
import path from "path";

test("BUN_COVERAGE produces lcov.info for a regular script", async () => {
  using dir = tempDir("env-coverage", {
    "script.ts": `
      function add(a: number, b: number) {
        return a + b;
      }

      function unused() {
        return 42;
      }

      console.log(add(1, 2));
    `,
  });

  const coverageDir = path.join(String(dir), "coverage");

  await using proc = Bun.spawn({
    cmd: [bunExe(), "script.ts"],
    cwd: String(dir),
    env: {
      ...bunEnv,
      BUN_COVERAGE: coverageDir,
    },
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

  expect(stdout.trim()).toBe("3");
  expect(exitCode).toBe(0);

  const lcovPath = path.join(coverageDir, "lcov.info");
  expect(fs.existsSync(lcovPath)).toBe(true);

  const lcov = fs.readFileSync(lcovPath, "utf-8");

  // Should contain LCOV markers
  expect(lcov).toContain("TN:");
  expect(lcov).toContain("SF:");
  expect(lcov).toContain("end_of_record");

  // Should reference our script file
  expect(lcov).toContain("script.ts");
});

test("BUN_COVERAGE is ignored when empty", async () => {
  using dir = tempDir("env-coverage-empty", {
    "script.ts": `console.log("hello");`,
  });

  await using proc = Bun.spawn({
    cmd: [bunExe(), "script.ts"],
    cwd: String(dir),
    env: {
      ...bunEnv,
      BUN_COVERAGE: "",
    },
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

  expect(stdout.trim()).toBe("hello");
  expect(exitCode).toBe(0);
});

test("BUN_COVERAGE creates output directory if it doesn't exist", async () => {
  using dir = tempDir("env-coverage-mkdir", {
    "script.ts": `console.log("ok");`,
  });

  const coverageDir = path.join(String(dir), "nested", "coverage", "dir");

  await using proc = Bun.spawn({
    cmd: [bunExe(), "script.ts"],
    cwd: String(dir),
    env: {
      ...bunEnv,
      BUN_COVERAGE: coverageDir,
    },
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

  expect(stdout.trim()).toBe("ok");
  expect(exitCode).toBe(0);

  const lcovPath = path.join(coverageDir, "lcov.info");
  expect(fs.existsSync(lcovPath)).toBe(true);
});
