#!/usr/bin/env node

import { Command } from "commander";
import * as path from "path";
import * as fs from "fs";
import { scanProject } from "../scanner/file-scanner";
import { generateTestsForFiles } from "../generator/test-generator";
import {
  writeTestFiles,
  writeTestFilesDryRun,
  formatWriteResults,
} from "../writer/file-writer";
import { formatGeneratedTests } from "../utils/formatter";
import { AngularArtifactType } from "../models/angular-types";
import { ProjectConfig } from "../models/types";
import { injectSpecHelpers } from "../generator/helpers/spec-helpers-injector";
import { printBanner } from "./banner";

// Walk up directories to find package.json (handles src/ path)
const findPackageJson = (startPath: string): string | null => {
  let dir = path.resolve(startPath);
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, "package.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
};

const readProjectPackage = (
  projectPath: string,
): Record<string, any> | null => {
  const pkgPath = findPackageJson(projectPath);
  if (!pkgPath) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  } catch {
    return null;
  }
};

const detectProjectUsesLocalize = (projectPath: string): boolean => {
  const pkg = readProjectPackage(projectPath);
  if (!pkg) return false;
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  return "@angular/localize" in allDeps;
};

const detectProjectUsesTanStack = (projectPath: string): boolean => {
  const pkg = readProjectPackage(projectPath);
  if (!pkg) return false;
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  return "@tanstack/angular-query-experimental" in allDeps;
};

const detectProjectDeps = (
  projectPath: string,
): { usesPrimeNG: boolean; usesOidc: boolean; usesZoneJs: boolean } => {
  const pkg = readProjectPackage(projectPath);
  if (!pkg) return { usesPrimeNG: false, usesOidc: false, usesZoneJs: false };
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hasZoneJs = "zone.js" in allDeps;
  // Check if setup-jest.ts uses zoneless env (then zone.js import is not needed)
  let usesZoneless = false;
  const pkgDir = path.dirname(findPackageJson(projectPath)!);
  try {
    const setupPath = path.join(pkgDir, "setup-jest.ts");
    const setupContent = fs.readFileSync(setupPath, "utf-8");
    usesZoneless =
      setupContent.includes("zoneless") || setupContent.includes("Zoneless");
  } catch {
    /* no setup-jest.ts */
  }
  return {
    usesPrimeNG: "primeng" in allDeps,
    usesOidc: "angular-auth-oidc-client" in allDeps,
    usesZoneJs: hasZoneJs && !usesZoneless,
  };
};

const program = new Command();

printBanner();

program
  .name("ng-jester")
  .description(
    "Generate Jest test files for Angular projects targeting 80%+ line coverage",
  )
  .version("1.0.0")
  .argument("<project-path>", "Path to the Angular project")
  .option("-d, --dry-run", "Preview generated files without writing", false)
  .option("-v, --verbose", "Show detailed output", false)
  .option(
    "-t, --type <types...>",
    "Filter by artifact type (component, service, pipe, guard, directive, interceptor, signal-store)",
  )
  .option("--no-overwrite", "Skip existing test files")
  .action(
    async (
      projectPath: string,
      options: {
        dryRun: boolean;
        verbose: boolean;
        type?: string[];
        overwrite: boolean;
      },
    ) => {
      try {
        const resolvedPath = path.resolve(projectPath);
        console.log(`\n- Scanning project: ${resolvedPath}\n`);

        const sourceFiles = scanProject(resolvedPath);
        console.log(`- Found ${sourceFiles.length} source files`);

        if (sourceFiles.length === 0) {
          console.log("No Angular source files found.");
          process.exit(0);
        }

        if (options.verbose) {
          for (const file of sourceFiles) {
            console.log(`   ${path.relative(resolvedPath, file)}`);
          }
        }

        console.log("\n- Generating tests...\n");
        const deps = detectProjectDeps(resolvedPath);
        const projectConfig: ProjectConfig = {
          usesLocalize: detectProjectUsesLocalize(resolvedPath),
          usesTanStack: detectProjectUsesTanStack(resolvedPath),
          usesPrimeNG: deps.usesPrimeNG,
          usesOidc: deps.usesOidc,
          usesZoneJs: deps.usesZoneJs,
        };
        let generatedTests = generateTestsForFiles(sourceFiles, projectConfig);

        if (options.type && options.type.length > 0) {
          const validTypes = options.type as AngularArtifactType[];
          generatedTests = generatedTests.filter((test) => {
            const fileName = path.basename(test.sourceFilePath);
            return validTypes.some(
              (type) =>
                fileName.includes(`.${type}.`) ||
                fileName.includes(`-${type}.`),
            );
          });
        }

        // Inject shared spec-test-helpers utility file and add imports to spec files
        generatedTests = injectSpecHelpers(generatedTests, resolvedPath);

        console.log(`- Generated ${generatedTests.length} test files`);

        console.log("\n- Formatting tests with Prettier...\n");
        generatedTests = await formatGeneratedTests(generatedTests);

        if (options.verbose) {
          for (const test of generatedTests) {
            console.log(`   ${path.relative(resolvedPath, test.filePath)}`);
          }
        }

        const results = options.dryRun
          ? writeTestFilesDryRun(generatedTests)
          : writeTestFiles(generatedTests, options.overwrite);

        console.log(formatWriteResults(results));

        if (options.dryRun) {
          console.log("\n📋 Dry run mode - no files were written.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`\n❌ Error: ${message}`);
        process.exit(1);
      }
    },
  );

program.parse();
