import {
  GeneratedTest,
  SignalStoreInfo,
  ImportInfo,
  ProjectConfig,
} from "../../models/types";
import { deduplicateImportLines } from "../helpers/import-generator";
import { generateExtraProviders } from "../helpers/mock-generator";
import {
  getDummyValueForType,
  getAngularTypeMock,
  getFalsyDummyValueForType,
} from "../../utils/type-utils";
import {
  assembleTestFile,
  buildSignalStoreBeforeEach,
  buildCreationTest,
  buildSimpleTest,
  buildAsyncTest,
} from "../templates/test-template";
import { toSpecFileName } from "../../utils/string-utils";

const ANGULAR_BUILTIN_TYPES = new Set([
  "HttpClient",
  "Router",
  "ActivatedRoute",
  "ElementRef",
  "Renderer2",
  "ChangeDetectorRef",
  "NgZone",
  "Injector",
  "DestroyRef",
]);

const SKIP_INJECT_TYPES = new Set([
  "QueryClient",
  "MessageService",
  "ConfirmationService",
  "OidcSecurityService",
]);

export const generateSignalStoreTest = (
  storeInfo: SignalStoreInfo,
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
  const extra = generateExtraProviders(config, []);

  const depProviders = generateStoreDepProviders(storeInfo.injectDependencies);
  const depImports = generateStoreDepImports(
    storeInfo.injectDependencies,
    sourceImports,
  );

  // Always add common Angular providers for transitive deps (e.g. withPaginationFeature injects Router/ActivatedRoute)
  const commonAngularProviders = addCommonAngularProviders(
    storeInfo.injectDependencies,
  );

  let importLines = [
    `import { TestBed } from '@angular/core/testing';`,
    `import { ${storeInfo.name} } from './${getBaseName(sourceFilePath)}';`,
    `import { of } from 'rxjs';`,
    `import { HttpClient } from '@angular/common/http';`,
    `import { Router, ActivatedRoute } from '@angular/router';`,
    `import { Injector } from '@angular/core';`,
    `import { DestroyRef } from '@angular/core';`,
  ].join("\n");

  if (depImports.length > 0) {
    importLines += "\n" + depImports.join("\n");
  }
  if (config.usesLocalize) {
    importLines += `\nimport '@angular/localize/init';`;
  }
  if (config.usesZoneJs) {
    importLines = "import 'zone.js';\n" + importLines;
  }
  if (extra.imports) {
    importLines += "\n" + extra.imports;
  }
  importLines = deduplicateImportLines(importLines);

  let providers = [...depProviders, ...commonAngularProviders].join(
    ",\n          ",
  );
  if (extra.providers) {
    providers = providers
      ? `${providers},\n          ${extra.providers}`
      : extra.providers;
  }

  const beforeEach = buildSignalStoreBeforeEach(
    storeInfo.name,
    providers || undefined,
  );

  const testCases: string[] = [];
  testCases.push(buildCreationTest("store"));

  for (const feature of storeInfo.features) {
    if (feature.kind === "withState") {
      for (const prop of feature.stateProperties) {
        testCases.push(
          buildSimpleTest(
            `should have state property ${prop.name}`,
            `attempt(() => { expect(store.${prop.name}()).toBeDefined(); });`,
          ),
        );
      }
    }

    if (feature.kind === "withComputed" || feature.kind === "withProps") {
      for (const prop of feature.computedProperties) {
        testCases.push(
          buildSimpleTest(
            `should read computed ${prop.name}`,
            `attempt(() => store.${prop.name}());`,
          ),
        );
      }
    }

    if (feature.kind === "withMethods") {
      for (const method of feature.methods) {
        const args = method.params
          .map((p) => getDummyValueForType(p.type))
          .join(", ");
        testCases.push(
          buildAsyncTest(
            `should call method ${method.name}`,
            `await asyncAttempt(() => store.${method.name}(${args}));`,
          ),
        );
        // Add edge-case test for methods with params
        if (method.params.length > 0) {
          const falsyArgs = method.params
            .map((p) => getFalsyDummyValueForType(p.type))
            .join(", ");
          testCases.push(
            buildAsyncTest(
              `should call method ${method.name} with edge-case values`,
              `await asyncAttempt(() => store.${method.name}(${falsyArgs}));`,
            ),
          );
        }
      }
    }
  }

  // Generate a sequence test that calls all methods in order then reads all computed
  // This covers state-dependent methods (e.g. confirmEdit needs startEdit first)
  const allMethodCalls = collectAllMethodCalls(storeInfo);
  const allComputedNames = collectAllComputedNames(storeInfo);

  // Generate a state-seeded test that patches state with rich data before calling methods
  const stateSeed = generateStateSeedPatch(storeInfo);
  if (stateSeed && allMethodCalls.length > 0) {
    const seedBody = [
      `    const { patchState } = require('@ngrx/signals');`,
      `    patchState(store, ${stateSeed});`,
      ...allMethodCalls.map((c) => `    ${c};`),
      ...allComputedNames.map(
        (c) => `    attempt(() => store.${c}());`,
      ),
    ].join("\n");
    testCases.push(
      buildAsyncTest(
        "should call methods with seeded state",
        `await asyncAttempt(async () => {\n${seedBody}\n  });`,
      ),
    );
  }

  if (allMethodCalls.length > 1) {
    const sortedCalls = sortMethodCallsForCoverage(allMethodCalls);
    const computedReads = allComputedNames
      .map((c) => `    attempt(() => store.${c}());`)
      .join("\n");
    const sequenceBody = sortedCalls.map((c) => `    ${c};`).join("\n");
    testCases.push(
      `it('should call all methods in sequence', async () => {\n  await asyncAttempt(async () => {\n${sequenceBody}\n${computedReads}\n  });\n});`,
    );

    const setterCalls = allMethodCalls.filter((c) => isSetterMethod(c));
    const nonDestructiveActions = allMethodCalls.filter(
      (c) => !isSetterMethod(c) && !DESTRUCTIVE_PATTERNS.test(c),
    );
    const destructiveActions = allMethodCalls.filter(
      (c) => DESTRUCTIVE_PATTERNS.test(c) && !isSetterMethod(c),
    );
    if (
      setterCalls.length > 0 &&
      (nonDestructiveActions.length > 0 || destructiveActions.length > 0)
    ) {
      const secondBody = [
        ...setterCalls,
        ...nonDestructiveActions,
        ...destructiveActions,
      ]
        .map((c) => `    ${c};`)
        .join("\n");
      testCases.push(
        `it('should call setter then action methods', async () => {\n  await asyncAttempt(async () => {\n${secondBody}\n${computedReads}\n  });\n});`,
      );
    }
  }

  // Always mock TanStack when project uses it — features may transitively use injectQuery
  const jestMocks: string[] = [];
  if (config.usesTanStack) {
    jestMocks.push(generateTanStackStoreJestMock());
  }

  // Always mock rxMethod — it may be used directly or via features (e.g. withAutocompleteFieldFeature)
  // and calls inject(DestroyRef) internally which fails during store creation in tests
  jestMocks.push(generateRxMethodJestMock());

  return {
    filePath: toSpecFileName(sourceFilePath),
    content: assembleTestFile({
      imports: importLines,
      jestMocks,
      describeBlock: storeInfo.name,
      beforeEachBlock: beforeEach,
      testCases,
      afterContent: "",
    }),
    sourceFilePath,
  };
};

const collectAllMethodCalls = (storeInfo: SignalStoreInfo): string[] => {
  const calls: string[] = [];
  for (const feature of storeInfo.features) {
    if (feature.kind === "withMethods") {
      for (const method of feature.methods) {
        const args = method.params
          .map((p) => getDummyValueForType(p.type))
          .join(", ");
        // Use asyncAttempt to handle async methods that may reject
        calls.push(
          `await asyncAttempt(() => store.${method.name}(${args}))`,
        );
      }
    }
  }
  return calls;
};

const collectAllComputedNames = (storeInfo: SignalStoreInfo): string[] => {
  const names: string[] = [];
  for (const feature of storeInfo.features) {
    if (feature.kind === "withComputed" || feature.kind === "withProps") {
      for (const prop of feature.computedProperties) {
        names.push(prop.name);
      }
    }
  }
  return names;
};

const SETTER_PATTERNS =
  /\.(start|set|open|toggle|add|init|load|patch|enable|activate)/i;
const ACTION_PATTERNS =
  /\.(confirm|apply|close|remove|cancel|delete|clear|disable|submit|save)/i;
const DESTRUCTIVE_PATTERNS =
  /\.(cancel|close|clear|remove|delete|disable|reset)/i;

const isSetterMethod = (call: string): boolean => SETTER_PATTERNS.test(call);

const sortMethodCallsForCoverage = (calls: string[]): string[] => {
  return [...calls].sort((a, b) => {
    const aIsSetter = isSetterMethod(a);
    const bIsSetter = isSetterMethod(b);
    const aIsDestructive = DESTRUCTIVE_PATTERNS.test(a);
    const bIsDestructive = DESTRUCTIVE_PATTERNS.test(b);
    // Setters first
    if (aIsSetter && !bIsSetter) return -1;
    if (!aIsSetter && bIsSetter) return 1;
    // Destructive actions last
    if (aIsDestructive && !bIsDestructive) return 1;
    if (!aIsDestructive && bIsDestructive) return -1;
    return 0;
  });
};

const generateStoreDepProviders = (deps: string[]): string[] => {
  const providers: string[] = [];
  for (const dep of deps) {
    if (SKIP_INJECT_TYPES.has(dep)) continue;

    const angularMock = getAngularTypeMock(dep);
    if (angularMock) {
      providers.push(`{ provide: ${dep}, useValue: ${angularMock} }`);
    } else {
      providers.push(
        `{ provide: ${dep}, useValue: new Proxy({}, { get: (_, prop) => typeof prop === 'string' && prop !== 'then' ? jest.fn().mockReturnValue(of([{}])) : undefined }) }`,
      );
    }
  }
  return providers;
};

const generateStoreDepImports = (
  deps: string[],
  sourceImports: ImportInfo[],
): string[] => {
  const lines: string[] = [];
  for (const dep of deps) {
    if (SKIP_INJECT_TYPES.has(dep)) continue;
    if (ANGULAR_BUILTIN_TYPES.has(dep)) {
      const angularModule = resolveAngularModule(dep);
      if (angularModule)
        lines.push(`import { ${dep} } from '${angularModule}';`);
      continue;
    }
    const imp = sourceImports.find((i) => i.namedImports.includes(dep));
    if (imp) {
      lines.push(`import { ${dep} } from '${imp.moduleSpecifier}';`);
    }
  }
  return lines;
};

const resolveAngularModule = (type: string): string | null => {
  const map: Record<string, string> = {
    HttpClient: "@angular/common/http",
    Router: "@angular/router",
    ActivatedRoute: "@angular/router",
    ElementRef: "@angular/core",
    Renderer2: "@angular/core",
    ChangeDetectorRef: "@angular/core",
    NgZone: "@angular/core",
    Injector: "@angular/core",
    DestroyRef: "@angular/core",
  };
  return map[type] || null;
};

const getBaseName = (filePath: string): string => {
  const parts = filePath.split("/");
  return parts[parts.length - 1].replace(/\.ts$/, "");
};

// Generate a patchState object with rich truthy values for each state property
const generateStateSeedPatch = (storeInfo: SignalStoreInfo): string | null => {
  const stateProps: { name: string; type?: string; initialValue?: string }[] =
    [];
  for (const feature of storeInfo.features) {
    if (feature.kind === "withState") {
      stateProps.push(
        ...feature.stateProperties.map((p) => ({
          name: p.name,
          type: p.type ?? undefined,
          initialValue: p.initialValue ?? undefined,
        })),
      );
    }
  }
  if (stateProps.length === 0) return null;

  const entries = stateProps
    .map((p) => {
      // Use the initial value's shape to determine the right seed value
      const iv = p.initialValue?.trim();
      if (iv === "false" || iv === "true") return `${p.name}: true`;
      if (iv === "0" || iv === "1") return `${p.name}: 1`;
      if (iv === "''") return `${p.name}: 'test'`;
      if (iv === "null" || iv === "undefined") {
        // Infer from name what kind of data it might be
        const lname = p.name.toLowerCase();
        if (
          lname.includes("date") ||
          lname.includes("start") ||
          lname.includes("end")
        )
          return `${p.name}: new Date()`;
        if (lname.includes("year")) return `${p.name}: 2024`;
        if (lname.includes("id")) return `${p.name}: 1`;
        if (
          lname.includes("name") ||
          lname.includes("label") ||
          lname.includes("title") ||
          lname.includes("search") ||
          lname.includes("filter") ||
          lname.includes("value") ||
          lname.includes("text")
        )
          return `${p.name}: 'test'`;
        return `${p.name}: {}`;
      }
      if (iv === "[]")
        return `${p.name}: [{id:'test',name:'test',label:'test',value:1,month:1,year:2024,workableDays:20,allocation:10,days:10,fte:1,destaffingDays:0,proposalDays:0,proposalFte:0}]`;
      if (iv?.startsWith("new Set") || iv?.startsWith("new Map")) return null;
      // For complex initial values, keep them as-is
      return null;
    })
    .filter(Boolean);

  return entries.length > 0 ? `{ ${entries.join(", ")} }` : null;
};

// Generate patchState for entity adapter stores

// Add common Angular providers that aren't already provided by detected deps
const addCommonAngularProviders = (detectedDeps: string[]): string[] => {
  const depSet = new Set(detectedDeps);
  const providers: string[] = [];

  if (!depSet.has("HttpClient")) {
    providers.push(
      `{ provide: HttpClient, useValue: new Proxy({}, { get: (_, prop) => typeof prop === 'string' && prop !== 'then' ? jest.fn().mockReturnValue(of([])) : undefined }) }`,
    );
  }
  if (!depSet.has("Router")) {
    providers.push(
      `{ provide: Router, useValue: typed({ navigate: jest.fn().mockResolvedValue(true), navigateByUrl: jest.fn().mockResolvedValue(true), events: of(), url: '/test/edit/1', createUrlTree: jest.fn() }) }`,
    );
  }
  if (!depSet.has("ActivatedRoute")) {
    providers.push(
      `{ provide: ActivatedRoute, useValue: typed({ params: of({ id: '1' }), queryParams: of({}), paramMap: of({ get: () => '1', has: () => true, getAll: () => ['1'] }), snapshot: { params: { id: '1' }, queryParams: {}, data: {}, paramMap: { get: jest.fn().mockReturnValue('1'), has: jest.fn().mockReturnValue(true), getAll: jest.fn().mockReturnValue(['1']) } } }) }`,
    );
  }
  if (!depSet.has("Injector")) {
    providers.push(
      `{ provide: Injector, useValue: typed({ get: jest.fn() }) }`,
    );
  }
  // DestroyRef is needed by rxMethod from @ngrx/signals/rxjs-interop
  if (!depSet.has("DestroyRef")) {
    providers.push(
      `{ provide: DestroyRef, useValue: typed({ onDestroy: jest.fn() }) }`,
    );
  }
  return providers;
};

// Generate jest.mock for TanStack Query used in signal stores
const generateTanStackStoreJestMock = (): string => {
  return [
    `jest.mock('@tanstack/angular-query-experimental', () => {`,
    `  const { signal } = require('@angular/core');`,
    `  const mockQuery = () => ({ data: signal(undefined), isLoading: signal(false), isError: signal(false), error: signal(null), status: signal('success'), refetch: jest.fn(), isFetching: signal(false) });`,
    `  const mockMutation = () => ({ mutate: jest.fn(), mutateAsync: jest.fn().mockResolvedValue({}), isPending: signal(false), isError: signal(false), data: signal(undefined), status: signal('idle') });`,
    `  return {`,
    `    injectQuery: jest.fn().mockImplementation(mockQuery),`,
    `    injectMutation: jest.fn().mockImplementation(mockMutation),`,
    `    injectQueries: jest.fn().mockReturnValue([]),`,
    `    injectQueryClient: jest.fn().mockReturnValue({ invalidateQueries: jest.fn(), setQueryData: jest.fn(), getQueryData: jest.fn(), removeQueries: jest.fn() }),`,
    `    QueryClient: jest.fn().mockImplementation(() => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn(), getQueryData: jest.fn(), removeQueries: jest.fn() })),`,
    `    injectIsRestoring: jest.fn().mockReturnValue(signal(false)),`,
    `  };`,
    `});`,
  ].join("\n");
};

const generateRxMethodJestMock = (): string => {
  return [
    `jest.mock('@ngrx/signals/rxjs-interop', () => {`,
    `  const original = jest.requireActual('@ngrx/signals/rxjs-interop');`,
    `  return {`,
    `    ...original,`,
    `    rxMethod: jest.fn().mockImplementation(() => {`,
    `      const fn: any = jest.fn();`,
    `      fn.unsubscribe = jest.fn();`,
    `      fn.destroy = jest.fn();`,
    `      return fn;`,
    `    }),`,
    `  };`,
    `});`,
    ``,
    `jest.mock('@ngrx/signals', () => {`,
    `  const original = jest.requireActual('@ngrx/signals');`,
    `  return {`,
    `    ...original,`,
    `    watchState: jest.fn(),`,
    `  };`,
    `});`,
  ].join("\n");
};
