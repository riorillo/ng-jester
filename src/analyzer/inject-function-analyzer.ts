import { InjectCallInfo, ClassInfo, MethodInfo } from '../models/types';
import { TANSTACK_INJECT_FUNCTIONS, TanStackInjectFunction } from '../models/angular-types';

export interface TanStackQueryInfo {
  variableName: string;
  functionName: TanStackInjectFunction;
  argsText: string | null;
}

export interface CustomInjectInfo {
  variableName: string;
  functionName: string;
  argsText: string | null;
}

export interface InjectionContextUsage {
  methodName: string;
  method: MethodInfo;
}

export const extractTanStackQueries = (injectCalls: InjectCallInfo[]): TanStackQueryInfo[] =>
  injectCalls
    .filter(call => isTanStackFunction(call.functionName))
    .map(call => ({
      variableName: call.name,
      functionName: call.functionName as TanStackInjectFunction,
      argsText: call.args,
    }));

export const extractCustomInjects = (injectCalls: InjectCallInfo[]): CustomInjectInfo[] =>
  injectCalls
    .filter(call => call.kind === 'custom')
    .map(call => ({
      variableName: call.name,
      functionName: call.functionName,
      argsText: call.args,
    }));

export const findInjectionContextMethods = (classInfo: ClassInfo): InjectionContextUsage[] =>
  classInfo.methods
    .filter(m => m.usesRunInInjectionContext)
    .map(m => ({ methodName: m.name, method: m }));

export const needsTanStackMocking = (injectCalls: InjectCallInfo[]): boolean =>
  injectCalls.some(call => isTanStackFunction(call.functionName));

export const needsCustomInjectMocking = (injectCalls: InjectCallInfo[]): boolean =>
  injectCalls.some(call => call.kind === 'custom');

export const needsInjectionContextHandling = (classInfo: ClassInfo): boolean =>
  classInfo.usesRunInInjectionContext || classInfo.methods.some(m => m.usesRunInInjectionContext);

const isTanStackFunction = (functionName: string): boolean =>
  (TANSTACK_INJECT_FUNCTIONS as readonly string[]).includes(functionName);

export const groupInjectCallsByKind = (injectCalls: InjectCallInfo[]): Record<string, InjectCallInfo[]> => {
  const groups: Record<string, InjectCallInfo[]> = {};
  for (const call of injectCalls) {
    const key = call.kind;
    if (!groups[key]) groups[key] = [];
    groups[key].push(call);
  }
  return groups;
};

export const getInjectModuleSources = (injectCalls: InjectCallInfo[]): string[] => {
  const tanstackCalls = extractTanStackQueries(injectCalls);
  const sources: string[] = [];
  if (tanstackCalls.length > 0) {
    sources.push('@tanstack/angular-query-experimental');
  }
  return sources;
};
