import { ConstructorParam, InjectCallInfo } from '../models/types';

export interface DependencyInfo {
  name: string;
  type: string;
  isOptional: boolean;
  source: 'constructor' | 'inject' | 'custom-inject';
  functionName: string;
}

const PRIMITIVE_TYPES = new Set(['string', 'number', 'boolean', 'any', 'void', 'never', 'undefined', 'null', 'object', 'unknown', 'symbol', 'bigint']);

const isPrimitiveType = (type: string): boolean =>
  PRIMITIVE_TYPES.has(type.toLowerCase());

export const analyzeDependencies = (
  constructorParams: ConstructorParam[],
  injectCalls: InjectCallInfo[],
): DependencyInfo[] => {
  const fromConstructor = constructorParams
    .filter(p => !isPrimitiveType(p.type))
    .map(mapConstructorParam);
  const fromInject = injectCalls
    .filter(call => call.kind === 'inject')
    .map(mapInjectCall);

  return [...fromConstructor, ...fromInject];
};

const mapConstructorParam = (param: ConstructorParam): DependencyInfo => ({
  name: param.name,
  type: param.type,
  isOptional: param.isOptional || param.decorators.includes('Optional'),
  source: 'constructor',
  functionName: 'constructor',
});

const mapInjectCall = (call: InjectCallInfo): DependencyInfo => ({
  name: call.name,
  type: call.serviceType,
  isOptional: call.isOptional,
  source: 'inject',
  functionName: 'inject',
});

export const getCustomInjectCalls = (injectCalls: InjectCallInfo[]): InjectCallInfo[] =>
  injectCalls.filter(call => call.kind === 'custom');

export const getTanStackInjectCalls = (injectCalls: InjectCallInfo[]): InjectCallInfo[] =>
  injectCalls.filter(call =>
    call.kind === 'injectQuery' || call.kind === 'injectMutation' ||
    call.kind === 'injectQueryClient' || call.kind === 'injectInfiniteQuery' ||
    call.kind === 'injectIsFetching' || call.kind === 'injectIsMutating'
  );

export const hasAngularDI = (constructorParams: ConstructorParam[], injectCalls: InjectCallInfo[]): boolean =>
  constructorParams.length > 0 || injectCalls.some(c => c.kind === 'inject');

export const getAllProvidableTypes = (deps: DependencyInfo[]): string[] =>
  [...new Set(deps.map(d => d.type))];
