import * as fs from "fs";
import * as path from "path";
import { GeneratedTest } from "../models/types";

export interface WriteResult {
  filePath: string;
  status: "written" | "skipped" | "error";
  error?: string;
}

export const writeTestFiles = (
  tests: GeneratedTest[],
  overwrite: boolean = true,
): WriteResult[] => tests.map((test) => writeTestFile(test, overwrite));

const writeTestFile = (
  test: GeneratedTest,
  overwrite: boolean,
): WriteResult => {
  try {
    if (!overwrite && fs.existsSync(test.filePath)) {
      return { filePath: test.filePath, status: "skipped" };
    }

    ensureDirectoryExists(path.dirname(test.filePath));
    fs.writeFileSync(test.filePath, test.content, "utf-8");
    return { filePath: test.filePath, status: "written" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { filePath: test.filePath, status: "error", error: message };
  }
};

const ensureDirectoryExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

export const writeTestFilesDryRun = (tests: GeneratedTest[]): WriteResult[] =>
  tests.map((test) => ({
    filePath: test.filePath,
    status: "written" as const,
  }));

export const formatWriteResults = (results: WriteResult[]): string => {
  const written = results.filter((r) => r.status === "written").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  const lines: string[] = [`\nDONE!`];

  if (skipped > 0) lines.push(`  ⏭️  Skipped: ${skipped}`);
  if (errors > 0) {
    lines.push(`  ❌ Errors: ${errors}`);
    for (const r of results.filter((r) => r.status === "error")) {
      lines.push(`     - ${r.filePath}: ${r.error}`);
    }
  }

  return lines.join("\n");
};
