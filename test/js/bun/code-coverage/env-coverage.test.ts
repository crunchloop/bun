import { describe, test, expect } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import fs from "fs";
import path from "path";

const scriptFixture = `
  function add(a: number, b: number) {
    return a + b;
  }

  function unused() {
    return 42;
  }

  console.log(add(1, 2));
`;

async function runWithCoverage(opts: {
  dir: string;
  cmd: string[];
  env?: Record<string, string>;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  await using proc = Bun.spawn({
    cmd: opts.cmd,
    cwd: opts.dir,
    env: { ...bunEnv, ...opts.env },
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

  return { stdout, stderr, exitCode };
}

function expectValidLcov(lcovPath: string, expectedFile: string) {
  expect(fs.existsSync(lcovPath)).toBe(true);
  const lcov = fs.readFileSync(lcovPath, "utf-8");
  expect(lcov).toContain("TN:");
  expect(lcov).toContain("SF:");
  expect(lcov).toContain("end_of_record");
  expect(lcov).toContain(expectedFile);
}

describe("BUN_COVERAGE env var", () => {
  test.concurrent("produces lcov.info for a regular script", async () => {
    using dir = tempDir("env-coverage", {
      "script.ts": scriptFixture,
    });

    const coverageDir = path.join(String(dir), "cov-output");
    const { stdout, exitCode } = await runWithCoverage({
      dir: String(dir),
      cmd: [bunExe(), "script.ts"],
      env: { BUN_COVERAGE: coverageDir },
    });

    expect(stdout.trim()).toBe("3");
    expect(exitCode).toBe(0);
    expectValidLcov(path.join(coverageDir, "lcov.info"), "script.ts");
  });

  test.concurrent("is ignored when empty", async () => {
    using dir = tempDir("env-coverage-empty", {
      "script.ts": `console.log("hello");`,
    });

    const { stdout, exitCode } = await runWithCoverage({
      dir: String(dir),
      cmd: [bunExe(), "script.ts"],
      env: { BUN_COVERAGE: "" },
    });

    expect(stdout.trim()).toBe("hello");
    expect(exitCode).toBe(0);
  });

  test.concurrent("creates nested output directory", async () => {
    using dir = tempDir("env-coverage-mkdir", {
      "script.ts": `console.log("ok");`,
    });

    const coverageDir = path.join(String(dir), "nested", "deep", "dir");
    const { stdout, exitCode } = await runWithCoverage({
      dir: String(dir),
      cmd: [bunExe(), "script.ts"],
      env: { BUN_COVERAGE: coverageDir },
    });

    expect(stdout.trim()).toBe("ok");
    expect(exitCode).toBe(0);
    expectValidLcov(path.join(coverageDir, "lcov.info"), "script.ts");
  });
});

describe("--coverage flag", () => {
  test.concurrent("produces lcov.info in default 'coverage' directory", async () => {
    using dir = tempDir("flag-coverage-default", {
      "script.ts": scriptFixture,
    });

    const { stdout, exitCode } = await runWithCoverage({
      dir: String(dir),
      cmd: [bunExe(), "run", "--coverage", "script.ts"],
    });

    expect(stdout.trim()).toBe("3");
    expect(exitCode).toBe(0);
    expectValidLcov(path.join(String(dir), "coverage", "lcov.info"), "script.ts");
  });

  test.concurrent("--coverage-dir overrides default directory", async () => {
    using dir = tempDir("flag-coverage-dir", {
      "script.ts": scriptFixture,
    });

    const coverageDir = path.join(String(dir), "my-cov");
    const { stdout, exitCode } = await runWithCoverage({
      dir: String(dir),
      cmd: [bunExe(), "run", "--coverage", "--coverage-dir", coverageDir, "script.ts"],
    });

    expect(stdout.trim()).toBe("3");
    expect(exitCode).toBe(0);
    expectValidLcov(path.join(coverageDir, "lcov.info"), "script.ts");
  });

  test.concurrent("--coverage flag takes precedence over BUN_COVERAGE env", async () => {
    using dir = tempDir("flag-coverage-precedence", {
      "script.ts": scriptFixture,
    });

    const flagDir = path.join(String(dir), "from-flag");
    const envDir = path.join(String(dir), "from-env");
    const { stdout, exitCode } = await runWithCoverage({
      dir: String(dir),
      cmd: [bunExe(), "run", "--coverage", "--coverage-dir", flagDir, "script.ts"],
      env: { BUN_COVERAGE: envDir },
    });

    expect(stdout.trim()).toBe("3");
    expect(exitCode).toBe(0);
    expectValidLcov(path.join(flagDir, "lcov.info"), "script.ts");
    // env var dir should NOT have coverage since flag takes precedence
    expect(fs.existsSync(path.join(envDir, "lcov.info"))).toBe(false);
  });
});
