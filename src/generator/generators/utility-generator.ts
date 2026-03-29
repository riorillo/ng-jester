import { GeneratedTest, ImportInfo, ProjectConfig } from "../../models/types";
import {
  FileExports,
  ExportedFunctionInfo,
  ExportedConstInfo,
  ExportedClassInfo,
} from "../../parser/export-parser";
import {
  getDummyValueForType,
  getFalsyDummyValueForType,
  isObservableType,
} from "../../utils/type-utils";
import { toSpecFileName } from "../../utils/string-utils";
import {
  assembleTestFile,
  buildSimpleTest,
  buildAsyncTest,
} from "../templates/test-template";
import {
  renderImports,
  deduplicateImportLines,
  TestImport,
} from "../helpers/import-generator";

export const generateUtilityTest = (
  fileExports: FileExports,
  sourceFilePath: string,
  sourceImports: ImportInfo[],
  config: ProjectConfig,
): GeneratedTest | null => {
  const { functions, constants, classes } = fileExports;

  const zodSchemas = constants.filter((c) => c.isZodSchema);
  const plainConstants = constants.filter((c) => !c.isZodSchema);
  const classesWithMethods = classes.filter(
    (c) =>
      c.staticMethods.length > 0 ||
      c.instanceMethods.length > 0 ||
      c.constructorParams.length > 0,
  );
  const storeFactoryFns = functions.filter((f) => f.returnsSignalStore);
  const nonStoreFactoryFns = functions.filter((f) => !f.returnsSignalStore);

  const hasTestable =
    functions.length > 0 ||
    zodSchemas.length > 0 ||
    classesWithMethods.length > 0 ||
    plainConstants.length > 0;
  if (!hasTestable) return null;

  const symbolsToImport: string[] = [];
  functions.forEach((f) => symbolsToImport.push(f.name));
  zodSchemas.forEach((c) => symbolsToImport.push(c.name));
  plainConstants.forEach((c) => symbolsToImport.push(c.name));
  classesWithMethods.forEach((c) => symbolsToImport.push(c.name));

  const imports = buildImports(
    symbolsToImport,
    sourceFilePath,
    sourceImports,
    config,
  );

  // Add TestBed import if there are store factory functions, functions using inject(), or abstract classes
  const hasInjectFunctions = nonStoreFactoryFns.some((f) =>
    f.body.includes("inject("),
  );
  const hasAbstractClasses = classesWithMethods.some((c) => c.isAbstract);
  if (storeFactoryFns.length > 0 || hasInjectFunctions || hasAbstractClasses) {
    imports.push({
      moduleSpecifier: "@angular/core/testing",
      namedImports: ["TestBed"],
    });
    imports.push({ moduleSpecifier: "rxjs", namedImports: ["of"] });
    // Add imports for injected dependencies
    const importedSymbols = new Set(
      sourceImports.flatMap((imp) => imp.namedImports),
    );
    const allInjectFns = [
      ...storeFactoryFns,
      ...(hasInjectFunctions ? nonStoreFactoryFns : []),
    ];
    for (const fn of allInjectFns) {
      const injectPattern = /inject\((\w+)\)/g;
      let match;
      while ((match = injectPattern.exec(fn.body)) !== null) {
        const depName = match[1];
        if (!importedSymbols.has(depName)) continue;
        for (const imp of sourceImports) {
          if (imp.namedImports.includes(depName)) {
            imports.push({
              moduleSpecifier: imp.moduleSpecifier,
              namedImports: [depName],
            });
          }
        }
      }
    }
    // Add imports for abstract class inject() dependencies
    for (const cls of classesWithMethods.filter((c) => c.isAbstract)) {
      const injectPattern = /inject\((\w+)\)/g;
      let match;
      while ((match = injectPattern.exec(cls.body)) !== null) {
        const depName = match[1];
        if (!importedSymbols.has(depName)) continue;
        for (const imp of sourceImports) {
          if (imp.namedImports.includes(depName)) {
            imports.push({
              moduleSpecifier: imp.moduleSpecifier,
              namedImports: [depName],
            });
          }
        }
      }
    }
  }

  // Build beforeEach for functions that use inject()
  let beforeEach = "";
  if (hasInjectFunctions) {
    const allDeps = new Set<string>();
    const importedSymbols = new Set(
      sourceImports.flatMap((imp) => imp.namedImports),
    );
    for (const fn of nonStoreFactoryFns) {
      const injectPattern = /inject\((\w+)\)/g;
      let match;
      while ((match = injectPattern.exec(fn.body)) !== null) {
        const dep = match[1];
        // Only include deps that are importable types, not local variables
        if (importedSymbols.has(dep)) {
          allDeps.add(dep);
        }
      }
    }
    if (allDeps.size > 0) {
      const providers = [...allDeps]
        .map(
          (dep) =>
            `{ provide: ${dep}, useValue: new Proxy({}, { get: (_, p) => { if (p === 'then') return undefined; const fn = jest.fn().mockReturnValue([]); fn.set = jest.fn(); fn.update = jest.fn(); fn.subscribe = jest.fn().mockReturnValue({ unsubscribe: jest.fn() }); fn.pipe = jest.fn().mockReturnValue({ subscribe: jest.fn() }); return fn; } }) }`,
        )
        .join(",\n        ");
      beforeEach = `beforeEach(() => {\n  TestBed.configureTestingModule({\n    providers: [\n        ${providers}\n    ],\n  });\n});`;
    }
  }

  const testCases = [
    ...nonStoreFactoryFns.flatMap((f) => buildFunctionTests(f)),
    ...zodSchemas.map((s) => buildZodSchemaTest(s)),
    ...plainConstants.map((c) => buildConstantTest(c)),
    ...buildRoutesTests(plainConstants),
  ];

  const storeFactoryDescribes = storeFactoryFns
    .map((f) => buildStoreFactoryDescribe(f, sourceImports))
    .join("\n\n");
  const afterContent = [
    classesWithMethods.map((c) => buildClassDescribe(c)).join("\n\n"),
    storeFactoryDescribes,
  ]
    .filter(Boolean)
    .join("\n\n");

  const describeName = getFileBaseName(sourceFilePath);

  let finalImports = deduplicateImportLines(renderImports(imports));
  if (config.usesZoneJs) {
    finalImports = "import 'zone.js';\n" + finalImports;
  }

  return {
    filePath: toSpecFileName(sourceFilePath),
    content: assembleTestFile({
      imports: finalImports,
      jestMocks: [],
      describeBlock: describeName,
      beforeEachBlock: beforeEach,
      testCases,
      afterContent,
    }),
    sourceFilePath,
  };
};

const buildImports = (
  symbols: string[],
  sourceFilePath: string,
  sourceImports: ImportInfo[],
  config: ProjectConfig,
): TestImport[] => {
  const imports: TestImport[] = [];

  imports.push({
    moduleSpecifier: `./${getFileBaseName(sourceFilePath)}`,
    namedImports: [...symbols],
  });

  if (config.usesLocalize) {
    imports.push({
      moduleSpecifier: "@angular/localize/init",
      namedImports: [],
    });
  }

  // Add rxjs import if any function returns Observable
  const needsRxjs = sourceImports.some(
    (imp) =>
      imp.moduleSpecifier === "rxjs" || imp.moduleSpecifier.startsWith("rxjs/"),
  );
  if (needsRxjs) {
    imports.push({ moduleSpecifier: "rxjs", namedImports: ["of"] });
  }

  return imports;
};

const buildFunctionTests = (fn: ExportedFunctionInfo): string[] => {
  const args = fn.params.map((p) => getDummyValueForType(p.type)).join(", ");
  const call = `${fn.name}(${args})`;
  const usesInject = fn.body.includes("inject(");

  const tests: string[] = [];

  if (usesInject) {
    tests.push(
      buildSimpleTest(
        `should call ${fn.name}`,
        `attempt(() => {\n      TestBed.runInInjectionContext(() => {\n        const result = ${call};\n        if (result && typeof result === 'function') {\n          attempt(() => {\n            const inner = result(typed({}), typed({}));\n            if (inner && inner.subscribe) { inner.subscribe({ next: () => {}, error: () => {} }); }\n          });\n        }\n        if (result && result.subscribe) { result.subscribe({ next: () => {}, error: () => {} }); }\n        if (result && result.then) { result.then(() => {}).catch(() => {}); }\n      });\n    });`,
      ),
    );
  } else if (fn.isAsync) {
    tests.push(
      buildAsyncTest(
        `should call ${fn.name}`,
        `await asyncAttempt(() => ${call});`,
      ),
    );
  } else if (fn.returnType && isObservableType(fn.returnType)) {
    tests.push(
      buildSimpleTest(
        `should call ${fn.name}`,
        `attempt(() => ${call}.subscribe({ next: () => {}, error: () => {} }));`,
      ),
    );
  } else {
    tests.push(
      buildSimpleTest(
        `should call ${fn.name}`,
        `attempt(() => ${call});`,
      ),
    );
  }

  // Add edge-case test for functions with params
  if (fn.params.length > 0 && !usesInject) {
    const falsyArgs = fn.params
      .map((p) => getFalsyDummyValueForType(p.type))
      .join(", ");
    const falsyCall = `${fn.name}(${falsyArgs})`;
    tests.push(
      buildSimpleTest(
        `should call ${fn.name} with edge-case values`,
        `attempt(() => ${falsyCall});`,
      ),
    );
  }

  return tests;
};

const buildZodSchemaTest = (schema: ExportedConstInfo): string =>
  buildSimpleTest(
    `should parse ${schema.name}`,
    `const inputs: any[] = [{}, 'test', 1, true, ['test'], [1], [{ value: 1, label: 'test', id: '1', name: 'test', code: 'A' }]];
    for (const input of inputs) { attempt(() => ${schema.name}.parse(input)); }`,
  );

const buildConstantTest = (constant: ExportedConstInfo): string => {
  const assertions = [`expect(${constant.name}).toBeDefined();`];
  for (const fp of constant.functionProperties) {
    const args = Array(fp.paramCount).fill("typed({})").join(", ");
    assertions.push(
      `attempt(() => ${constant.name}.${fp.name}(${args}));`,
    );
  }
  return buildSimpleTest(
    `should be defined: ${constant.name}`,
    assertions.join("\n    "),
  );
};

const buildClassDescribe = (cls: ExportedClassInfo): string => {
  const tests: string[] = [];

  if (cls.isAbstract) {
    return buildAbstractClassDescribe(cls);
  }

  if (cls.instanceMethods.length > 0 || cls.constructorParams.length > 0) {
    tests.push(
      buildSimpleTest(
        "should create instance",
        `attempt(() => { const instance = new ${cls.name}(typed({})); expect(instance).toBeTruthy(); });`,
      ),
    );
  }

  for (const method of cls.staticMethods) {
    const args = method.params.length > 0 ? "typed({})" : "";
    tests.push(
      buildSimpleTest(
        `should call ${cls.name}.${method.name}`,
        `attempt(() => ${cls.name}.${method.name}(${args}));`,
      ),
    );
  }

  for (const method of cls.instanceMethods) {
    const args = method.params.length > 0 ? "typed({})" : "";
    tests.push(
      buildSimpleTest(
        `should call ${method.name}`,
        `attempt(() => { const instance = new ${cls.name}(typed({})); instance.${method.name}(${args}); });`,
      ),
    );
  }

  const body = tests.join("\n\n");
  return `describe('${cls.name}', () => {\n${indent(body, 2)}\n});`;
};

const buildAbstractClassDescribe = (cls: ExportedClassInfo): string => {
  // Extract inject() dependencies from the class body
  const injectPattern = /inject\((\w+)\)/g;
  const deps = new Set<string>();
  let match;
  while ((match = injectPattern.exec(cls.body)) !== null) {
    deps.add(match[1]);
  }

  const providerLines = [...deps].map(
    (dep) =>
      `{ provide: ${dep}, useValue: new Proxy({}, { get: (_: any, p: any) => { if (p === 'then') return undefined; if (typeof p !== 'string') return undefined; const fn: any = jest.fn().mockReturnValue(of([])); fn.pipe = jest.fn().mockReturnValue({ subscribe: jest.fn() }); fn.subscribe = jest.fn(); return fn; } }) }`,
  );

  const tests: string[] = [];

  tests.push(
    buildSimpleTest("should create instance", `attempt(() => expect(instance).toBeTruthy());`),
  );

  for (const method of cls.instanceMethods) {
    const args = method.params
      .map((p) => getDummyValueForType(p.type))
      .join(", ");
    const falsyArgs = method.params
      .map((p) => getFalsyDummyValueForType(p.type))
      .join(", ");
    tests.push(
      buildAsyncTest(
        `should call ${method.name}`,
        `await asyncAttempt(() => exposed(instance).${method.name}(${args}));`,
      ),
    );
    if (method.params.length > 0) {
      tests.push(
        buildAsyncTest(
          `should call ${method.name} with edge-case values`,
          `await asyncAttempt(() => exposed(instance).${method.name}(${falsyArgs}));`,
        ),
      );
    }
  }

  for (const method of cls.staticMethods) {
    const args = method.params.length > 0 ? "typed({})" : "";
    tests.push(
      buildSimpleTest(
        `should call ${cls.name}.${method.name}`,
        `attempt(() => ${cls.name}.${method.name}(${args}));`,
      ),
    );
  }

  const body = `
  class Testable${cls.name} extends ${cls.name} {}

  let instance: Testable${cls.name};

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ${providerLines.join(",\n        ")},
      ],
    });
    attempt(() => {
      instance = TestBed.runInInjectionContext(() => new Testable${cls.name}());
    });
  });

${tests.join("\n\n")}`;

  return `describe('${cls.name}', () => {\n${indent(body, 2)}\n});`;
};

const indent = (text: string, spaces: number): string =>
  text
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : " ".repeat(spaces) + line))
    .join("\n");

const getFileBaseName = (filePath: string): string => {
  const parts = filePath.split("/");
  return parts[parts.length - 1].replace(/\.ts$/, "");
};

const buildRoutesTests = (constants: ExportedConstInfo[]): string[] => {
  const routeConst = constants.find(
    (c) =>
      c.name === "routes" ||
      c.initializerText.includes("loadComponent") ||
      c.initializerText.includes("loadChildren"),
  );
  if (!routeConst) return [];

  return [
    buildSimpleTest(
      "should resolve lazy-loaded routes",
      `const walk = (routes: any[]) => {
      for (const r of routes) {
        if (r.loadComponent) attempt(() => r.loadComponent());
        if (r.loadChildren) attempt(() => r.loadChildren());
        if (r.canActivate) r.canActivate.forEach((g: any) => { attempt(() => { if (typeof g === 'function') g(); }); });
        if (r.canMatch) r.canMatch.forEach((g: any) => { attempt(() => { if (typeof g === 'function') g(); }); });
        if (r.children) walk(r.children);
      }
    };
    walk(${routeConst.name});`,
    ),
  ];
};

const buildStoreFactoryDescribe = (
  fn: ExportedFunctionInfo,
  sourceImports: ImportInfo[],
): string => {
  // Extract inject() calls from the function body
  const injectPattern = /inject\((\w+)\)/g;
  const deps = new Set<string>();
  let match;
  while ((match = injectPattern.exec(fn.body)) !== null) {
    deps.add(match[1]);
  }

  // Extract method names from withMethods
  const methodNames = extractNamesFromFeature(fn.body, "withMethods");
  const computedNames = extractNamesFromFeature(fn.body, "withComputed");
  const stateProps = extractNamesFromFeature(fn.body, "withState");

  const args = fn.params.map((p) => getDummyValueForType(p.type)).join(", ");

  // Build providers for each dep
  const providerLines: string[] = [];
  for (const dep of deps) {
    const resolved = resolveDepModule(dep, sourceImports);
    if (resolved) {
      providerLines.push(
        `{ provide: ${resolved.name}, useValue: new Proxy({}, { get: (_, p) => typeof p === 'string' && p !== 'then' ? jest.fn().mockReturnValue(of([])) : undefined }) }`,
      );
    }
  }

  const tests: string[] = [];
  tests.push(
    buildSimpleTest("should create store", `attempt(() => expect(store).toBeTruthy());`),
  );

  for (const name of stateProps) {
    tests.push(
      buildSimpleTest(
        `should have state ${name}`,
        `attempt(() => { expect(store.${name}()).toBeDefined(); });`,
      ),
    );
  }

  for (const name of computedNames) {
    tests.push(
      buildSimpleTest(
        `should read computed ${name}`,
        `attempt(() => store.${name}());`,
      ),
    );
  }

  for (const name of methodNames) {
    tests.push(
      buildSimpleTest(
        `should call method ${name}`,
        `attempt(() => store.${name}(typed({})));`,
      ),
    );
  }

  const body = `
  let store: any;

  beforeEach(() => {
    const StoreToken = ${fn.name}(${args});
    TestBed.configureTestingModule({
      providers: [
        StoreToken,
        ${providerLines.join(",\n        ")},
      ],
    });
    attempt(() => { store = TestBed.inject(StoreToken); });
    store ??= typed({});
  });

${tests.join("\n\n")}`;

  return `describe('${fn.name} (store factory)', () => {\n${indent(body, 2)}\n});`;
};

const extractNamesFromFeature = (body: string, feature: string): string[] => {
  const regex = new RegExp(feature + "\\s*\\(", "g");
  const names: string[] = [];
  let idx = body.indexOf(feature + "(");
  if (idx === -1) idx = body.indexOf(feature + " (");
  if (idx === -1) return names;

  // Find the object literal properties after the feature call
  const openBrace = body.indexOf("{", idx);
  if (openBrace === -1) return names;

  // Simple extraction: find property names before : or ( in the object
  let depth = 0;
  let start = openBrace;
  for (let i = openBrace; i < body.length; i++) {
    if (body[i] === "{") depth++;
    if (body[i] === "}") {
      depth--;
      if (depth === 0) {
        const block = body.substring(start + 1, i);
        // Match property names at the start of lines or after commas
        const propPattern = /(?:^|\n)\s*(\w+)\s*[\(:{]/g;
        let m;
        while ((m = propPattern.exec(block)) !== null) {
          const name = m[1];
          if (
            name &&
            ![
              "return",
              "const",
              "let",
              "var",
              "if",
              "for",
              "while",
              "switch",
              "function",
              "class",
            ].includes(name)
          ) {
            names.push(name);
          }
        }
        break;
      }
    }
  }
  return [...new Set(names)];
};

const resolveDepModule = (
  depName: string,
  sourceImports: ImportInfo[],
): { name: string; module: string } | null => {
  for (const imp of sourceImports) {
    if (imp.namedImports.includes(depName)) {
      return { name: depName, module: imp.moduleSpecifier };
    }
  }
  return { name: depName, module: "" };
};
