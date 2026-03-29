import { MethodInfo, ClassInfo } from '../models/types';

export interface MethodTestInfo {
  method: MethodInfo;
  needsAsync: boolean;
  needsInjectionContext: boolean;
  hasReturnValue: boolean;
  callExpression: string;
  returnsObservable: boolean;
}

export const analyzeMethodsForTesting = (classInfo: ClassInfo, instanceVar: string): MethodTestInfo[] =>
  classInfo.methods
    .filter(m => !isLifecycleHook(m.name))
    .map(m => analyzeMethod(m, instanceVar));

const analyzeMethod = (method: MethodInfo, instanceVar: string): MethodTestInfo => {
  const args = method.params.map(p => getDummyArgPlaceholder(p.type)).join(', ');
  const isObservable = hasObservableReturn(method) || hasObservableBody(method);

  return {
    method,
    needsAsync: method.isAsync || hasPromiseReturn(method),
    needsInjectionContext: method.usesRunInInjectionContext,
    hasReturnValue: method.returnType !== null && method.returnType !== 'void',
    callExpression: `${instanceVar}.${method.name}(${args})`,
    returnsObservable: isObservable,
  };
};

const getDummyArgPlaceholder = (type: string | null): string => {
  if (!type) return 'typed({})';
  return 'typed({})';
};

const isLifecycleHook = (name: string): boolean =>
  ['ngOnInit', 'ngOnDestroy', 'ngOnChanges', 'ngDoCheck',
   'ngAfterContentInit', 'ngAfterContentChecked',
   'ngAfterViewInit', 'ngAfterViewChecked'].includes(name);

const hasObservableReturn = (method: MethodInfo): boolean =>
  method.returnType !== null && /Observable/.test(method.returnType);

const hasObservableBody = (method: MethodInfo): boolean =>
  /return\s+.*\.(get|post|put|delete|patch|pipe)\s*\(/.test(method.body || '') ||
  /return\s+.*\.pipe\s*\(/.test(method.body || '');

const hasPromiseReturn = (method: MethodInfo): boolean =>
  method.returnType !== null && /Promise/.test(method.returnType);

export const getLifecycleHookMethods = (classInfo: ClassInfo): MethodInfo[] =>
  classInfo.methods.filter(m => isLifecycleHook(m.name));

export const getPublicMethods = (classInfo: ClassInfo): MethodInfo[] =>
  classInfo.methods.filter(m => m.visibility === 'public');

export const getNonLifecyclePublicMethods = (classInfo: ClassInfo): MethodInfo[] =>
  classInfo.methods.filter(m => m.visibility === 'public' && !isLifecycleHook(m.name));

export const getMethodsUsingInjectionContext = (classInfo: ClassInfo): MethodInfo[] =>
  classInfo.methods.filter(m => m.usesRunInInjectionContext);
