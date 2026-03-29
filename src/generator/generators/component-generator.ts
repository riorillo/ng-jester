import {
  ClassInfo,
  GeneratedTest,
  ImportInfo,
  ProjectConfig,
} from "../../models/types";
import { analyzeDependencies } from "../../analyzer/dependency-analyzer";
import {
  analyzeMethodsForTesting,
  getLifecycleHookMethods,
} from "../../analyzer/method-analyzer";
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
import {
  generateSignalTests,
  generateInputSignalTests,
  generateOutputSignalTests,
  generateModelSignalTests,
} from "../helpers/signal-test-generator";
import { generateBranchTests } from "../helpers/branch-test-generator";
import {
  generateMethodCall,
  generateFalsyMethodCall,
} from "../helpers/dummy-value-generator";
import { wrapInInjectionContextIfNeeded } from "../helpers/injection-context-generator";
import {
  assembleTestFile,
  buildComponentBeforeEach,
  buildCreationTest,
  buildSimpleTest,
  buildAsyncTest,
} from "../templates/test-template";
import { toSpecFileName } from "../../utils/string-utils";
import { getDummyValueForType } from "../../utils/type-utils";

export const generateComponentTest = (
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
    "component",
    dependencies,
    sourceImports,
    config.usesLocalize,
  );

  const existingTypes = dependencies.map((d) => d.type);
  const extra = generateExtraProviders(config, existingTypes);
  let providers = generateProviders(mocks);
  if (extra.providers) {
    providers = providers
      ? `${providers},\n        ${extra.providers}`
      : extra.providers;
  }
  const hasInputSignals = enrichedClass.inputSignals.length > 0;
  const requiredInputs = enrichedClass.inputSignals
    .filter((i) => i.required)
    .map((i) => ({ name: i.name, type: i.type ?? undefined }));
  const optionalInputs = enrichedClass.inputSignals
    .filter((i) => !i.required)
    .map((i) => ({ name: i.name, type: i.type ?? undefined }));
  const allInputsForBeforeEach = [...requiredInputs, ...optionalInputs];
  const beforeEach = [
    generateMockDeclarations(mocks),
    "",
    buildComponentBeforeEach(
      enrichedClass.name,
      providers,
      hasInputSignals,
      allInputsForBeforeEach,
    ),
  ].join("\n");

  const testCases: string[] = [];

  testCases.push(buildCreationTest("component"));

  const lifecycleHooks = getLifecycleHookMethods(enrichedClass);
  for (const hook of lifecycleHooks) {
    testCases.push(
      buildSimpleTest(
        `should call ${hook.name}`,
        `attempt(() => component.${hook.name}(${hook.name === "ngOnChanges" ? "typed({})" : ""}));`,
      ),
    );
  }

  const methodTests = analyzeMethodsForTesting(enrichedClass, "component");
  for (const mt of methodTests) {
    const callExpr = generateMethodCall("component", mt.method);
    const wrappedCall = wrapInInjectionContextIfNeeded(mt.method, callExpr);

    if (mt.returnsObservable) {
      testCases.push(
        buildSimpleTest(
          `should call ${mt.method.name}`,
          `attempt(() => { ${wrappedCall}.subscribe({ next: () => {}, error: () => {} }); jest.runAllTimers(); attempt(() => TestBed.flushEffects()); fixture.detectChanges(); });`,
        ),
      );
    } else if (mt.needsAsync) {
      testCases.push(
        buildAsyncTest(
          `should call ${mt.method.name}`,
          `await asyncAttempt(async () => { await ${wrappedCall}; jest.runAllTimers(); attempt(() => TestBed.flushEffects()); fixture.detectChanges(); });`,
        ),
      );
    } else {
      testCases.push(
        buildSimpleTest(
          `should call ${mt.method.name}`,
          `attempt(() => { ${wrappedCall}; jest.runAllTimers(); attempt(() => TestBed.flushEffects()); fixture.detectChanges(); });`,
        ),
      );
    }

    // Add edge-case test to cover else-branches
    if (mt.method.params.length > 0) {
      const falsyCall = generateFalsyMethodCall("component", mt.method);
      const wrappedFalsy = wrapInInjectionContextIfNeeded(mt.method, falsyCall);
      if (mt.needsAsync) {
        testCases.push(
          buildAsyncTest(
            `should call ${mt.method.name} with edge-case values`,
            `await asyncAttempt(async () => { await ${wrappedFalsy}; jest.runAllTimers(); });`,
          ),
        );
      } else {
        testCases.push(
          buildSimpleTest(
            `should call ${mt.method.name} with edge-case values`,
            `attempt(() => { ${wrappedFalsy}; jest.runAllTimers(); });`,
          ),
        );
      }
    }

    testCases.push(...generateBranchTests(mt.method, "component", []));
  }

  testCases.push(...generateSignalTests(enrichedClass.signals, "component"));
  testCases.push(
    ...generateInputSignalTests(enrichedClass.inputSignals, "fixture"),
  );
  testCases.push(
    ...generateOutputSignalTests(enrichedClass.outputSignals, "component"),
  );
  testCases.push(
    ...generateModelSignalTests(
      enrichedClass.modelSignals,
      "fixture",
      "component",
    ),
  );

  // Read all computed/getter properties to trigger their computation bodies
  const getterMethods = enrichedClass.methods.filter(
    (m) => m.isGetter && m.visibility === "public",
  );
  const computedSignals = enrichedClass.signals.filter(
    (s) => s.kind === "computed",
  );
  if (getterMethods.length > 0 || computedSignals.length > 0) {
    const getterReads = getterMethods
      .map(
        (g) =>
          `    attempt(() => component.${g.name});`,
      )
      .join("\n");
    const computedReads = computedSignals
      .map(
        (s) =>
          `    attempt(() => exposed(component).${s.name}());`,
      )
      .join("\n");
    const allReads = [getterReads, computedReads].filter(Boolean).join("\n");
    testCases.push(
      buildSimpleTest("should read all computed/getter properties", allReads),
    );
  }

  // Add a test that sets ALL input signals and triggers full change detection
  const allInputs = enrichedClass.inputSignals;
  if (allInputs.length > 0) {
    const setAllInputs = allInputs
      .map(
        (i) =>
          `    fixture.componentRef.setInput('${i.name}', ${getDummyValueForType(i.type ?? null)});`,
      )
      .join("\n");
    testCases.push(
      buildSimpleTest(
        "should handle all inputs set",
        `if (!fixture) return;\n  attempt(() => {\n${setAllInputs}\n    fixture.detectChanges();\n    jest.runAllTimers();\n  });`,
      ),
    );
  }

  let renderedImports = renderImports(imports);
  if (extra.imports) {
    renderedImports += "\n" + extra.imports;
  }
  if (config.usesZoneJs) {
    renderedImports = "import 'zone.js';\n" + renderedImports;
  }
  renderedImports = deduplicateImportLines(renderedImports);

  const content = assembleTestFile({
    imports: renderedImports,
    jestMocks,
    describeBlock: enrichedClass.name,
    beforeEachBlock: beforeEach,
    testCases,
    afterContent: "",
  });

  return {
    filePath: toSpecFileName(sourceFilePath),
    content,
    sourceFilePath,
  };
};

const getBaseName = (filePath: string): string => {
  const parts = filePath.split("/");
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.ts$/, "");
};
