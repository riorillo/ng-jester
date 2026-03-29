import { BranchInfo, MethodInfo } from '../../models/types';
import { getDummyValueForType, getFalsyDummyValueForType } from '../../utils/type-utils';

export const generateBranchTests = (
  method: MethodInfo,
  instanceVar: string,
  mockSetups: string[],
): string[] => {
  if (method.branches.length === 0) return [];
  return method.branches.map((branch, index) =>
    generateBranchTest(method, branch, index, instanceVar, mockSetups),
  );
};

const generateBranchTest = (
  method: MethodInfo,
  branch: BranchInfo,
  index: number,
  instanceVar: string,
  mockSetups: string[],
): string => {
  // For else/nullish/optional-chaining branches, use falsy/null args to trigger the alt path
  const useFalsy = branch.type === 'else' || branch.type === 'nullish-coalescing' || branch.type === 'optional-chaining';
  const args = method.params.map(p => useFalsy ? getFalsyDummyValueForType(p.type) : getDummyValueForType(p.type)).join(', ');
  const needsCast = method.visibility === 'protected' || method.visibility === 'private';
  const target = needsCast ? `exposed(${instanceVar})` : instanceVar;
  const callExpr = `${target}.${method.name}(${args})`;
  const branchDesc = describeBranch(branch, index);
  const isObservable = (method.returnType && /Observable/.test(method.returnType)) ||
    /return\s+.*\.(get|post|put|delete|patch|pipe)\s*\(/.test(method.body || '');

  const setupLines = mockSetups.length > 0
    ? mockSetups.join('\n    ') + '\n    '
    : '';

  if (isObservable) {
    return `it('${branchDesc}', () => {
    ${setupLines}attempt(() => ${callExpr}.subscribe({ next: () => {}, error: () => {} }));
  });`;
  }

  if (method.isAsync) {
    return `it('${branchDesc}', async () => {
    ${setupLines}await asyncAttempt(() => ${callExpr});
  });`;
  }

  return `it('${branchDesc}', () => {
    ${setupLines}attempt(() => ${callExpr});
  });`;
};

const describeBranch = (branch: BranchInfo, index: number): string => {
  const sanitizedCondition = sanitizeForTestName(branch.condition);
  switch (branch.type) {
    case 'if':
      return `should handle case when ${sanitizedCondition}`;
    case 'else':
      return `should handle case when ${sanitizedCondition} is falsy`;
    case 'switch-case':
      return `should match case ${sanitizedCondition}`;
    case 'ternary':
      return `should handle conditional for ${sanitizedCondition}`;
    case 'nullish-coalescing':
      return `should handle fallback for ${sanitizedCondition}`;
    case 'optional-chaining':
      return `should safely access ${sanitizedCondition}`;
    default:
      return `should cover branch ${index}`;
  }
};

const sanitizeForTestName = (condition: string): string =>
  condition
    .replace(/'/g, "\\'")
    .replace(/\n/g, ' ')
    .substring(0, 60)
    .trim();

export const generateNullBranchTest = (
  method: MethodInfo,
  instanceVar: string,
  depName: string,
  depMockVar: string,
): string => {
  const args = method.params.map(p => getDummyValueForType(p.type)).join(', ');
  return `it('should handle null path in ${method.name}', () => {
    ${depMockVar}.${depName} = null;
    attempt(() => ${instanceVar}.${method.name}(${args}));
  });`;
};
