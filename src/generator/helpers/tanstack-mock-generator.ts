import { TanStackQueryInfo } from '../../analyzer/inject-function-analyzer';
import { TanStackInjectFunction } from '../../models/angular-types';

export interface TanStackMockDefinition {
  variableName: string;
  functionName: string;
  mockObject: string;
  jestMockStatement: string;
}

export const generateTanStackMocks = (queries: TanStackQueryInfo[]): TanStackMockDefinition[] =>
  queries.map(generateTanStackMock);

const generateTanStackMock = (query: TanStackQueryInfo): TanStackMockDefinition => {
  const mockObject = getTanStackMockObject(query.functionName);
  const variableName = `mock${capitalize(query.variableName)}`;

  return {
    variableName,
    functionName: query.functionName,
    mockObject,
    jestMockStatement: generateJestMock(query.functionName, variableName),
  };
};

const getTanStackMockObject = (functionName: TanStackInjectFunction | string): string => {
  switch (functionName) {
    case 'injectQuery':
    case 'injectInfiniteQuery':
      return `{
    data: jest.fn().mockReturnValue([]),
    isLoading: jest.fn().mockReturnValue(false),
    isError: jest.fn().mockReturnValue(false),
    error: jest.fn().mockReturnValue(null),
    status: jest.fn().mockReturnValue('success'),
    refetch: jest.fn(),
    isFetching: jest.fn().mockReturnValue(false),
    isSuccess: jest.fn().mockReturnValue(true),
  }`;
    case 'injectMutation':
      return `{
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue({}),
    isPending: jest.fn().mockReturnValue(false),
    isError: jest.fn().mockReturnValue(false),
    error: jest.fn().mockReturnValue(null),
    data: jest.fn().mockReturnValue([]),
    status: jest.fn().mockReturnValue('idle'),
    reset: jest.fn(),
  }`;
    case 'injectQueryClient':
      return `{
    invalidateQueries: jest.fn(),
    resetQueries: jest.fn(),
    refetchQueries: jest.fn(),
    getQueryData: jest.fn(),
    setQueryData: jest.fn(),
    removeQueries: jest.fn(),
    clear: jest.fn(),
  }`;
    case 'injectIsFetching':
    case 'injectIsMutating':
      return `jest.fn().mockReturnValue(0)`;
    default:
      return `typed({})`;
  }
};

const generateJestMock = (functionName: string, variableName: string): string =>
  `const ${variableName} = ${getTanStackMockObject(functionName)};`;

export const generateTanStackJestMockModule = (mocks: TanStackMockDefinition[]): string => {
  if (mocks.length === 0) return '';

  // Deduplicate by functionName (multiple injectQuery calls share the same mock factory)
  const seen = new Set<string>();
  const uniqueMocks = mocks.filter(m => {
    if (seen.has(m.functionName)) return false;
    seen.add(m.functionName);
    return true;
  });

  const mockEntries = uniqueMocks.map(m =>
    `  ${m.functionName}: jest.fn().mockReturnValue(${m.mockObject})`
  ).join(',\n');

  return `jest.mock('@tanstack/angular-query-experimental', () => ({\n  ...jest.requireActual('@tanstack/angular-query-experimental'),\n${mockEntries}\n}));`;
};

export const generateCustomInjectMock = (functionName: string, modulePath: string, mockObject: string): string =>
  `jest.mock('${modulePath}', () => ({\n  ...jest.requireActual('${modulePath}'),\n  ${functionName}: jest.fn().mockReturnValue(${mockObject})\n}));`;

export const generateCustomInjectMocks = (
  customInjects: { variableName: string; functionName: string; argsText: string | null }[],
  sourceImports: { moduleSpecifier: string; namedImports: string[] }[],
): string[] => {
  if (customInjects.length === 0) return [];

  // Group by module path
  const byModule = new Map<string, { functionName: string; mockObject: string }[]>();

  for (const ci of customInjects) {
    const modulePath = findImportPath(ci.functionName, sourceImports);
    if (!modulePath) continue;

    const mockObject = generateCustomInjectMockObject(ci.functionName);
    if (!byModule.has(modulePath)) byModule.set(modulePath, []);
    byModule.get(modulePath)!.push({ functionName: ci.functionName, mockObject });
  }

  const mocks: string[] = [];
  for (const [modulePath, entries] of byModule) {
    // Deduplicate by functionName
    const seen = new Set<string>();
    const unique = entries.filter(e => {
      if (seen.has(e.functionName)) return false;
      seen.add(e.functionName);
      return true;
    });

    const mockEntries = unique.map(e =>
      `  ${e.functionName}: jest.fn().mockReturnValue(${e.mockObject})`
    ).join(',\n');

    mocks.push(`jest.mock('${modulePath}', () => ({\n  ...jest.requireActual('${modulePath}'),\n${mockEntries}\n}));`);
  }

  return mocks;
};

const findImportPath = (
  functionName: string,
  sourceImports: { moduleSpecifier: string; namedImports: string[] }[],
): string | null => {
  for (const imp of sourceImports) {
    if (imp.namedImports.includes(functionName)) {
      return imp.moduleSpecifier;
    }
  }
  return null;
};

const generateCustomInjectMockObject = (_functionName: string): string => {
  // Return a Proxy that handles any property access
  // Properties return signal-like functions (callable + return empty array by default)
  return `new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'symbol') return undefined;
      const fn = jest.fn().mockReturnValue([]);
      fn.set = jest.fn();
      fn.update = jest.fn();
      fn.subscribe = jest.fn().mockReturnValue({ unsubscribe: jest.fn() });
      fn.pipe = jest.fn().mockReturnValue({ subscribe: jest.fn() });
      fn.emit = jest.fn();
      return fn;
    }
  })`;
};

const capitalize = (str: string): string =>
  str.charAt(0).toUpperCase() + str.slice(1);
