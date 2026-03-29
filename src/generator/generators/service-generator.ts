import {
  ClassInfo,
  GeneratedTest,
  ImportInfo,
  ProjectConfig,
} from "../../models/types";
import { analyzeDependencies } from "../../analyzer/dependency-analyzer";
import { analyzeMethodsForTesting } from "../../analyzer/method-analyzer";
import { enrichAllMethods } from "../../analyzer/branch-analyzer";
import {
  extractTanStackQueries,
  extractCustomInjects,
} from "../../analyzer/inject-function-analyzer";
import {
  generateMocks,
  generateProviders,
  generateMockDeclarations,
  enrichMockWithMethods,
  generateExtraProviders,
  generateRxjsInteropMock,
} from "../helpers/mock-generator";
import {
  generateTanStackMocks,
  generateTanStackJestMockModule,
  generateCustomInjectMocks,
} from "../helpers/tanstack-mock-generator";
import {
  generateTestImports,
  renderImports,
  deduplicateImportLines,
} from "../helpers/import-generator";
import { generateSignalTests } from "../helpers/signal-test-generator";
import { generateBranchTests } from "../helpers/branch-test-generator";
import {
  generateMethodCall,
  generateFalsyMethodCall,
} from "../helpers/dummy-value-generator";
import { wrapInInjectionContextIfNeeded } from "../helpers/injection-context-generator";
import {
  assembleTestFile,
  buildServiceBeforeEach,
  buildCreationTest,
  buildSimpleTest,
  buildAsyncTest,
} from "../templates/test-template";
import { toSpecFileName } from "../../utils/string-utils";

export const generateServiceTest = (
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

  const tanStackQueries = extractTanStackQueries(enrichedClass.injectCalls);
  const tanStackMocks = generateTanStackMocks(tanStackQueries);
  const jestMocks: string[] = [];
  if (tanStackMocks.length > 0) {
    jestMocks.push(generateTanStackJestMockModule(tanStackMocks));
  }

  const customInjects = extractCustomInjects(enrichedClass.injectCalls);
  jestMocks.push(...generateCustomInjectMocks(customInjects, sourceImports));

  const imports = generateTestImports(
    enrichedClass,
    `./${getBaseName(sourceFilePath)}`,
    "service",
    dependencies,
    sourceImports,
    config.usesLocalize,
  );

  const extra = generateExtraProviders(
    config,
    dependencies.map((d) => d.type),
  );
  let providers = generateProviders(mocks);
  if (extra.providers) {
    providers = providers
      ? `${providers},\n        ${extra.providers}`
      : extra.providers;
  }

  const beforeEach = [
    generateMockDeclarations(mocks),
    "",
    buildServiceBeforeEach(enrichedClass.name, providers),
  ].join("\n");

  const testCases: string[] = [];
  testCases.push(buildCreationTest("service"));

  const methodTests = analyzeMethodsForTesting(enrichedClass, "service");
  for (const mt of methodTests) {
    const callExpr = generateMethodCall("service", mt.method);
    const wrappedCall = wrapInInjectionContextIfNeeded(mt.method, callExpr);

    if (mt.returnsObservable) {
      testCases.push(
        buildSimpleTest(
          `should call ${mt.method.name}`,
          `attempt(() => { ${wrappedCall}.subscribe({ next: () => {}, error: () => {} }); jest.runAllTimers(); });`,
        ),
      );
    } else if (mt.needsAsync) {
      testCases.push(
        buildAsyncTest(
          `should call ${mt.method.name}`,
          `await asyncAttempt(() => ${wrappedCall});`,
        ),
      );
    } else {
      testCases.push(
        buildSimpleTest(
          `should call ${mt.method.name}`,
          `attempt(() => ${wrappedCall});`,
        ),
      );
    }

    // Add edge-case test to cover else-branches
    if (mt.method.params.length > 0) {
      const falsyCall = generateFalsyMethodCall("service", mt.method);
      const wrappedFalsy = wrapInInjectionContextIfNeeded(mt.method, falsyCall);
      if (mt.returnsObservable) {
        testCases.push(
          buildSimpleTest(
            `should call ${mt.method.name} with edge-case values`,
            `attempt(() => { ${wrappedFalsy}.subscribe({ next: () => {}, error: () => {} }); jest.runAllTimers(); });`,
          ),
        );
      } else if (mt.needsAsync) {
        testCases.push(
          buildAsyncTest(
            `should call ${mt.method.name} with edge-case values`,
            `await asyncAttempt(() => ${wrappedFalsy});`,
          ),
        );
      } else {
        testCases.push(
          buildSimpleTest(
            `should call ${mt.method.name} with edge-case values`,
            `attempt(() => ${wrappedFalsy});`,
          ),
        );
      }
    }

    testCases.push(...generateBranchTests(mt.method, "service", []));
  }

  testCases.push(...generateSignalTests(enrichedClass.signals, "service"));

  let renderedImports = renderImports(imports);
  if (extra.imports) {
    renderedImports += "\n" + extra.imports;
  }
  if (config.usesZoneJs) {
    renderedImports = "import 'zone.js';\n" + renderedImports;
  }
  renderedImports = deduplicateImportLines(renderedImports);

  return {
    filePath: toSpecFileName(sourceFilePath),
    content: assembleTestFile({
      imports: renderedImports,
      jestMocks,
      describeBlock: enrichedClass.name,
      beforeEachBlock: beforeEach,
      testCases,
      afterContent: "",
    }),
    sourceFilePath,
  };
};

const getBaseName = (filePath: string): string => {
  const parts = filePath.split("/");
  return parts[parts.length - 1].replace(/\.ts$/, "");
};
