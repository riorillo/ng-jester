import { MethodInfo, ClassInfo } from '../../models/types';

export const generateInjectionContextTest = (
  instanceVar: string,
  methodName: string,
  args: string,
): string =>
  `TestBed.runInInjectionContext(() => {\n  ${instanceVar}.${methodName}(${args});\n})`;

export const wrapInInjectionContextIfNeeded = (
  method: MethodInfo,
  callExpression: string,
): string => {
  if (!method.usesRunInInjectionContext) return callExpression;
  return `TestBed.runInInjectionContext(() => {\n    ${callExpression};\n  })`;
};

export const needsInjectionContextImport = (classInfo: ClassInfo): boolean =>
  classInfo.usesRunInInjectionContext ||
  classInfo.methods.some(m => m.usesRunInInjectionContext);
