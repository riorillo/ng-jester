import { DependencyInfo } from '../../analyzer/dependency-analyzer';
import { ClassInfo, ProjectConfig } from '../../models/types';
import { isAngularType, isHttpType, isRouterType, getAngularTypeMock } from '../../utils/type-utils';

export interface MockDefinition {
  variableName: string;
  type: string;
  mockObject: string;
  providerEntry: string;
}

export const generateMocks = (dependencies: DependencyInfo[]): MockDefinition[] =>
  dependencies.map(generateMock);

const stripGenerics = (type: string): string => {
  const idx = type.indexOf('<');
  return idx >= 0 ? type.substring(0, idx) : type;
};

// Types that should use the real Angular implementation instead of mocks
const REAL_PROVIDER_TYPES = new Set(['FormBuilder']);

const generateMock = (dep: DependencyInfo): MockDefinition => {
  const variableName = `mock${capitalize(dep.name)}`;
  const baseType = stripGenerics(dep.type);
  if (REAL_PROVIDER_TYPES.has(baseType)) {
    return { variableName, type: baseType, mockObject: 'typed(undefined)', providerEntry: '' };
  }
  const mockObject = generateMockObject(baseType);
  const providerEntry = `{ provide: ${baseType}, useValue: ${variableName} }`;

  return { variableName, type: baseType, mockObject, providerEntry };
};

// Proxy function calls that reference the shared spec-test-helpers.ts utility file.
// The actual implementations are generated into the target project by spec-helpers-content.ts.
const DEEP_PROXY_MOCK = 'createServiceMock()';
const RICH_PROXY_ITEM = 'createMockItem()';
const generateMockObject = (type: string): string => {
  if (isAngularType(type)) return getAngularTypeMock(type);
  if (isHttpType(type)) return getAngularTypeMock(type);
  if (isRouterType(type)) return getAngularTypeMock(type);
  return DEEP_PROXY_MOCK;
};

export const generateMockVariable = (mock: MockDefinition): string =>
  `const ${mock.variableName} = ${mock.mockObject};`;

export const generateProviders = (mocks: MockDefinition[]): string => {
  // Deduplicate by provider type — keep only the FIRST provider for each type
  const seen = new Set<string>();
  return mocks
    .filter(m => {
      if (m.providerEntry.length === 0) return false;
      if (seen.has(m.type)) return false;
      seen.add(m.type);
      return true;
    })
    .map(m => m.providerEntry)
    .join(',\n        ');
};

export const generateMockMethodSpy = (mockVarName: string, methodName: string, returnValue: string): string =>
  `${mockVarName}.${methodName} = jest.fn().mockReturnValue(${returnValue})`;

const capitalize = (str: string): string =>
  str.charAt(0).toUpperCase() + str.slice(1);

export const generateMockDeclarations = (mocks: MockDefinition[]): string =>
  mocks.filter(m => m.providerEntry.length > 0).map(generateMockVariable).join('\n');

// Analyze the class methods to discover what mock methods are needed
// by checking what methods are called on injected deps in the source
export const enrichMockWithMethods = (
  mock: MockDefinition,
  classInfo: ClassInfo,
  depFieldName: string,
): MockDefinition => {
  // For known Angular types that already have complete mocks, skip enrichment
  if (isAngularType(mock.type) || isHttpType(mock.type) || isRouterType(mock.type)) return mock;

  const methodsUsed = findMethodsCalledOnDependency(depFieldName, classInfo);
  if (methodsUsed.length === 0) return mock;

  const mockMethods = methodsUsed.map(m => {
    if (m.isProperty && m.needsObservable) return `${m.name}: of([${RICH_PROXY_ITEM}])`;
    if (m.needsObservable) return `${m.name}: jest.fn().mockReturnValue(of([${RICH_PROXY_ITEM}]))`;
    if (m.needsPromise) return `${m.name}: jest.fn().mockResolvedValue([${RICH_PROXY_ITEM}])`;
    // Non-observable properties use deep Proxy to handle nested access (e.g. store.nested.load())
    if (m.isProperty) return `${m.name}: ${DEEP_PROXY_MOCK}`;
    return `${m.name}: jest.fn().mockReturnValue([${RICH_PROXY_ITEM}])`;
  }).join(', ');
  // Wrap in Proxy so undetected property accesses don't crash
  // Fallback uses DEEP_PROXY_MOCK for nested access (e.g. store.query.isLoading())
  return {
    ...mock,
    mockObject: `createEnrichedMock({ ${mockMethods} })`,
  };
};

interface MethodCallInfo {
  name: string;
  needsObservable: boolean;
  needsPromise: boolean;
  isProperty: boolean;
  isNestedAccess: boolean;
}

const findMethodsCalledOnDependency = (depFieldName: string, classInfo: ClassInfo): MethodCallInfo[] => {
  const methodMap = new Map<string, MethodCallInfo>();
  const escapedName = depFieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Unified pattern: match this.dep.IDENTIFIER and optionally capture trailing ( or .subscribe/.pipe
  const accessPattern = new RegExp(
    `this\\.${escapedName}\\.([a-zA-Z_$][a-zA-Z0-9_$]*)`,
    'g',
  );

  // Collect all code bodies to scan: methods + property initializers + constructor body
  const codeBodies: string[] = [
    ...classInfo.methods.map(m => m.body),
    ...classInfo.properties.map(p => p.initializer || ''),
    classInfo.constructorBody || '',
  ];

  const allCode = codeBodies.join('\n');

  // Find all accesses first
  const allAccesses = new Set<string>();
  let match;
  accessPattern.lastIndex = 0;
  while ((match = accessPattern.exec(allCode)) !== null) {
    allAccesses.add(match[1]);
  }

  // Now categorize each access
  for (const name of allAccesses) {
    const escapedAccess = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Check if it's used as an Observable (has .subscribe or .pipe after it, or used in toSignal/pipe)
    const obsPattern = new RegExp(
      `this\\.${escapedName}\\.${escapedAccess}[\\s\\S]{0,50}\\.(subscribe|pipe)\\s*\\(`,
    );
    const toSignalPattern = new RegExp(
      `toSignal\\s*\\(\\s*this\\.${escapedName}\\.${escapedAccess}`,
    );
    // Check if called as a method whose result is subscribed/piped
    const methodObsPattern = new RegExp(
      `this\\.${escapedName}\\.${escapedAccess}\\s*\\([^)]*\\)\\s*\\.\\s*(subscribe|pipe)\\s*\\(`,
    );
    // Check if awaited
    const awaitPattern = new RegExp(
      `await\\s+this\\.${escapedName}\\.${escapedAccess}\\s*\\(`,
    );
    // Check if it's a method call (followed by parenthesis)
    const callPattern = new RegExp(
      `this\\.${escapedName}\\.${escapedAccess}\\s*\\(`,
    );
    // Check if it has nested property access (e.g. this.dep.nested.method())
    const nestedPattern = new RegExp(
      `this\\.${escapedName}\\.${escapedAccess}\\.`,
    );

    const isObservable = obsPattern.test(allCode) || toSignalPattern.test(allCode) || methodObsPattern.test(allCode);
    const isPromise = awaitPattern.test(allCode);
    const isMethodCall = callPattern.test(allCode);
    const isNested = nestedPattern.test(allCode);

    if (isObservable && !isMethodCall) {
      // It's an Observable property (like isAuthenticated$)
      methodMap.set(name, { name, needsObservable: true, needsPromise: false, isProperty: true, isNestedAccess: false });
    } else if (isObservable) {
      methodMap.set(name, { name, needsObservable: true, needsPromise: false, isProperty: false, isNestedAccess: false });
    } else if (isPromise) {
      methodMap.set(name, { name, needsObservable: false, needsPromise: true, isProperty: false, isNestedAccess: false });
    } else if (isNested) {
      // Nested object access (e.g. this.dep.nested.load()) — needs deep Proxy
      methodMap.set(name, { name, needsObservable: false, needsPromise: false, isProperty: true, isNestedAccess: true });
    } else if (isMethodCall) {
      methodMap.set(name, { name, needsObservable: false, needsPromise: false, isProperty: false, isNestedAccess: false });
    } else {
      // Pure property access — use deep Proxy to handle any nested usage
      methodMap.set(name, { name, needsObservable: false, needsPromise: false, isProperty: true, isNestedAccess: false });
    }
  }

  return [...methodMap.values()];
};

export interface ExtraProviders {
  providers: string;
  imports: string;
}

export const generateExtraProviders = (config: ProjectConfig, existingTypes: string[] = []): ExtraProviders => {
  const providers: string[] = [];
  const imports: string[] = [];
  const alreadyProvided = new Set(existingTypes.map(t => stripGenerics(t)));

  // Always add common Angular providers for transitive deps (standalone components import
  // other components/stores that may use providedIn: 'root' services needing HttpClient, etc.)
  if (!alreadyProvided.has('HttpClient')) {
    providers.push("{ provide: HttpClient, useValue: typed({ get: jest.fn().mockReturnValue(of({content:[{id:'test',name:'test'}],items:[{id:'test'}],totalElements:1,id:'test',name:'test'})), post: jest.fn().mockReturnValue(of({id:'test'})), put: jest.fn().mockReturnValue(of({id:'test'})), delete: jest.fn().mockReturnValue(of({id:'test'})), patch: jest.fn().mockReturnValue(of({id:'test'})) }) }");
    imports.push("import { HttpClient } from '@angular/common/http';");
  }
  if (!alreadyProvided.has('Router')) {
    providers.push("{ provide: Router, useValue: typed({ navigate: jest.fn().mockResolvedValue(true), navigateByUrl: jest.fn().mockResolvedValue(true), events: of(), url: '/test/edit/1', createUrlTree: jest.fn() }) }");
    imports.push("import { Router, ActivatedRoute } from '@angular/router';");
  }
  if (!alreadyProvided.has('ActivatedRoute')) {
    providers.push("{ provide: ActivatedRoute, useValue: typed({ params: of({ id: '1' }), queryParams: of({}), paramMap: of({ get: () => '1', has: () => true, getAll: () => ['1'] }), queryParamMap: of({ get: () => null, has: () => false, getAll: () => [] }), snapshot: { params: { id: '1' }, queryParams: {}, data: {}, paramMap: { get: jest.fn().mockReturnValue('1'), has: jest.fn().mockReturnValue(true), getAll: jest.fn().mockReturnValue(['1']) } } }) }");
    if (!imports.some(i => i.includes('ActivatedRoute'))) {
      imports.push("import { ActivatedRoute } from '@angular/router';");
    }
  }
  // DestroyRef is needed by rxMethod from @ngrx/signals and takeUntilDestroyed
  if (!alreadyProvided.has('DestroyRef')) {
    providers.push("{ provide: DestroyRef, useValue: typed({ onDestroy: jest.fn() }) }");
    imports.push("import { DestroyRef } from '@angular/core';");
  }

  if (config.usesTanStack && !alreadyProvided.has('QueryClient')) {
    providers.push('{ provide: QueryClient, useValue: new QueryClient() }');
    imports.push("import { QueryClient } from '@tanstack/angular-query-experimental';");
  }

  if (config.usesPrimeNG) {
    if (!alreadyProvided.has('MessageService')) {
      providers.push('{ provide: MessageService, useValue: { add: jest.fn(), clear: jest.fn() } }');
    }
    if (!alreadyProvided.has('ConfirmationService')) {
      providers.push('{ provide: ConfirmationService, useValue: { confirm: jest.fn(), close: jest.fn() } }');
    }
    if (!alreadyProvided.has('MessageService') || !alreadyProvided.has('ConfirmationService')) {
      imports.push("import { MessageService, ConfirmationService } from 'primeng/api';");
    }
  }

  if (config.usesOidc && !alreadyProvided.has('OidcSecurityService')) {
    const oidcMock = [
      '{ provide: OidcSecurityService, useValue: {',
      "    checkAuth: jest.fn().mockReturnValue(of({ isAuthenticated: false })),",
      '    isAuthenticated$: of(false),',
      '    authorize: jest.fn(),',
      '    logoff: jest.fn(),',
      "    getAccessToken: jest.fn().mockReturnValue(of(''))",
      '  } }',
    ].join('\n        ');
    providers.push(oidcMock);
    imports.push("import { OidcSecurityService } from 'angular-auth-oidc-client';");
    imports.push("import { of } from 'rxjs';");
  }

  return {
    providers: providers.join(',\n        '),
    imports: imports.join('\n'),
  };
};

// jest.mock for @angular/core/rxjs-interop — makes toObservable() emit synchronously
// so constructor subscribe callbacks fire during component creation.
// Returns a deep Proxy so any nested property access (e.g. data.allocazioniDiStaffing.map) works safely.
export const generateRxjsInteropMock = (): string =>
  `jest.mock('@angular/core/rxjs-interop', () => {
  const { of, identity } = require('rxjs');
  const _leaf = {id:'test',name:'test',label:'test',value:1,code:'test',description:'test',toString:()=>'test',valueOf:()=>1,[Symbol.toPrimitive]:()=>'test'};
  const _mkSafe = (d: number = 0): any => {
    if (d > 3) return _leaf;
    const arr = [_leaf];
    return new Proxy(Object.assign((...args: any[]) => arr, { length: 1, [Symbol.iterator]: arr[Symbol.iterator].bind(arr) }), {
      get: (t: any, p: any) => {
        if (p === Symbol.toPrimitive || p === 'valueOf' || p === 'toString') return () => 'test';
        if (p === 'then' || typeof p === 'symbol') return undefined;
        if (p === 'length') return 1;
        if (p in Array.prototype && typeof (Array.prototype as Record<string, any>)[p] === 'function') return (arr as Record<string, any>)[p].bind(arr);
        return p in t ? t[p] : _mkSafe(d + 1);
      },
      apply: () => arr,
    });
  };
  return {
    toObservable: () => of(_mkSafe()),
    takeUntilDestroyed: () => identity,
    toSignal: (obs: any, opts?: any) => { try { return require('@angular/core').signal(opts?.initialValue ?? null); } catch(_) { return () => opts?.initialValue ?? null; } },
    outputToObservable: () => of(),
    outputFromObservable: () => ({}),
  };
});`;
