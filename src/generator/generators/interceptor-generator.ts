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
} from "../helpers/mock-generator";
import { generateCustomInjectMocks } from "../helpers/tanstack-mock-generator";
import {
  generateTestImports,
  renderImports,
  deduplicateImportLines,
} from "../helpers/import-generator";
import { generateBranchTests } from "../helpers/branch-test-generator";
import { generateMethodCall } from "../helpers/dummy-value-generator";
import {
  assembleTestFile,
  buildInterceptorBeforeEach,
  buildCreationTest,
  buildSimpleTest,
  buildAsyncTest,
} from "../templates/test-template";
import { toSpecFileName } from "../../utils/string-utils";

export const generateInterceptorTest = (
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
    "interceptor",
    dependencies,
    sourceImports,
  );
  const extra = generateExtraProviders(
    config,
    dependencies.map((d) => d.type),
  );
  let importsStr =
    renderImports(imports) +
    "\nimport { HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';\nimport { of } from 'rxjs';";
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
  const beforeEach = [
    generateMockDeclarations(mocks),
    "",
    buildInterceptorBeforeEach(enrichedClass.name, providers),
  ].join("\n");

  const testCases: string[] = [];
  testCases.push(buildCreationTest("interceptor"));

  // Test the intercept method
  const interceptMethod = enrichedClass.methods.find(
    (m) => m.name === "intercept",
  );
  if (interceptMethod) {
    testCases.push(
      buildSimpleTest(
        "should intercept request",
        `const req = new HttpRequest('GET', '/test');\n  const next = typed({ handle: jest.fn().mockReturnValue(of({})) });\n  interceptor.intercept(req, next);\n  expect(next.handle).toHaveBeenCalled();`,
      ),
    );

    testCases.push(...generateBranchTests(interceptMethod, "interceptor", []));
  }

  // Other public methods
  const methodTests = analyzeMethodsForTesting(enrichedClass, "interceptor");
  for (const mt of methodTests) {
    if (mt.method.name === "intercept") continue;
    const callExpr = generateMethodCall("interceptor", mt.method);

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

const getBaseName = (filePath: string): string => {
  const parts = filePath.split("/");
  return parts[parts.length - 1].replace(/\.ts$/, "");
};
