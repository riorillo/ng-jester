import {
  ClassInfo,
  GeneratedTest,
  ImportInfo,
  ProjectConfig,
} from "../../models/types";
import { analyzeDependencies } from "../../analyzer/dependency-analyzer";
import { analyzeMethodsForTesting } from "../../analyzer/method-analyzer";
import { enrichAllMethods } from "../../analyzer/branch-analyzer";
import { extractCustomInjects } from "../../analyzer/inject-function-analyzer";
import {
  generateMocks,
  generateProviders,
  generateMockDeclarations,
  enrichMockWithMethods,
  generateExtraProviders,
  generateRxjsInteropMock,
} from "../helpers/mock-generator";
import { generateCustomInjectMocks } from "../helpers/tanstack-mock-generator";
import {
  generateTestImports,
  renderImports,
  deduplicateImportLines,
} from "../helpers/import-generator";
import { generateBranchTests } from "../helpers/branch-test-generator";
import {
  assembleTestFile,
  buildDirectiveBeforeEach,
  buildSimpleTest,
  buildAsyncTest,
} from "../templates/test-template";
import { toSpecFileName } from "../../utils/string-utils";

export const generateDirectiveTest = (
  classInfo: ClassInfo,
  sourceFilePath: string,
  sourceImports: ImportInfo[],
  config: ProjectConfig = {
    usesLocalize: false,
    usesTanStack: false,
    usesPrimeNG: false,
    usesOidc: false,
    usesZoneJs: false,
  },
): GeneratedTest => {
  const enrichedClass = {
    ...classInfo,
    methods: enrichAllMethods(classInfo.methods),
  };

  const dependencies = analyzeDependencies(
    enrichedClass.constructorParams,
    enrichedClass.injectCalls,
  );
  let mocks = generateMocks(dependencies);
  mocks = mocks.map((m, i) =>
    enrichMockWithMethods(m, enrichedClass, dependencies[i].name),
  );

  const customInjects = extractCustomInjects(enrichedClass.injectCalls);
  const jestMocks: string[] = generateCustomInjectMocks(
    customInjects,
    sourceImports,
  );

  const imports = generateTestImports(
    enrichedClass,
    `./${getBaseName(sourceFilePath)}`,
    "directive",
    dependencies,
    sourceImports,
    config.usesLocalize,
  );
  // Add Component import for the test host
  const extra = generateExtraProviders(
    config,
    dependencies.map((d) => d.type),
  );
  let importsStr =
    renderImports(imports) + "\nimport { Component } from '@angular/core';";
  if (extra.imports) {
    importsStr += "\n" + extra.imports;
  }
  if (config.usesZoneJs) {
    importsStr = "import 'zone.js';\n" + importsStr;
  }
  importsStr = deduplicateImportLines(importsStr);

  let providers = generateProviders(mocks);
  if (extra.providers) {
    providers = providers
      ? `${providers},\n        ${extra.providers}`
      : extra.providers;
  }
  const selector = extractSelector(enrichedClass);
  const beforeEach = [
    generateMockDeclarations(mocks),
    "",
    buildDirectiveBeforeEach(enrichedClass.name, providers, selector),
  ].join("\n");

  const testCases: string[] = [];
  testCases.push(
    buildSimpleTest("should create", "attempt(() => expect(fixture).toBeTruthy());"),
  );

  const instanceAccess = `fixture.debugElement.children[0].injector.get(${enrichedClass.name})`;
  const methodTests = analyzeMethodsForTesting(enrichedClass, instanceAccess);
  for (const mt of methodTests) {
    const needsCast = mt.method.visibility === 'protected' || mt.method.visibility === 'private';
    const target = needsCast ? `exposed(${instanceAccess})` : instanceAccess;
    const callExpr = `${target}.${mt.method.name}(${mt.method.params.map(() => "typed({})").join(", ")})`;

    if (mt.returnsObservable) {
      testCases.push(
        buildSimpleTest(
          `should call ${mt.method.name}`,
          `attempt(() => ${callExpr}.subscribe({ next: () => {}, error: () => {} }));`,
        ),
      );
    } else if (mt.needsAsync) {
      testCases.push(
        buildAsyncTest(
          `should call ${mt.method.name}`,
          `await asyncAttempt(() => ${callExpr});`,
        ),
      );
    } else {
      testCases.push(
        buildSimpleTest(
          `should call ${mt.method.name}`,
          `attempt(() => ${callExpr});`,
        ),
      );
    }

    testCases.push(...generateBranchTests(mt.method, instanceAccess, []));
  }

  return {
    filePath: toSpecFileName(sourceFilePath),
    content: assembleTestFile({
      imports: importsStr,
      jestMocks,
      describeBlock: enrichedClass.name,
      beforeEachBlock: beforeEach,
      testCases,
      afterContent: "",
    }),
    sourceFilePath,
  };
};

const extractSelector = (classInfo: ClassInfo): string => {
  const selector = classInfo.decoratorMetadata?.args?.["selector"];
  if (typeof selector === "string") {
    const clean = selector.replace(/^['"]|['"]$/g, "");
    // Take only the first selector if multiple (comma-separated)
    const first = clean.split(",")[0].trim();
    return first;
  }
  return "appTestDirective";
};

const getBaseName = (filePath: string): string => {
  const parts = filePath.split("/");
  return parts[parts.length - 1].replace(/\.ts$/, "");
};
