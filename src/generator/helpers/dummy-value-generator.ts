import { ParamInfo, MethodInfo } from '../../models/types';
import { getDummyValueForType, getFalsyDummyValueForType } from '../../utils/type-utils';

export const generateDummyArgs = (params: ParamInfo[]): string =>
  params.map(p => getDummyValueForType(p.type)).join(', ');

export const generateFalsyArgs = (params: ParamInfo[]): string =>
  params.map(p => getFalsyDummyValueForType(p.type)).join(', ');

export const generateMethodCall = (instanceVar: string, method: MethodInfo): string => {
  const cast = method.visibility === 'protected' || method.visibility === 'private';
  const target = cast ? `exposed(${instanceVar})` : instanceVar;
  if (method.isGetter) {
    return `${target}.${method.name}`;
  }
  const args = generateDummyArgs(method.params);
  return `${target}.${method.name}(${args})`;
};

export const generateFalsyMethodCall = (instanceVar: string, method: MethodInfo): string => {
  const cast = method.visibility === 'protected' || method.visibility === 'private';
  const target = cast ? `exposed(${instanceVar})` : instanceVar;
  if (method.isGetter) return `${target}.${method.name}`;
  const args = generateFalsyArgs(method.params);
  return `${target}.${method.name}(${args})`;
};

export const generateDummyValue = (type: string | null): string =>
  getDummyValueForType(type);

export const generateDummyObject = (properties: { name: string; type: string | null }[]): string => {
  if (properties.length === 0) return '{}';
  const props = properties.map(p => `${p.name}: ${getDummyValueForType(p.type)}`).join(', ');
  return `{ ${props} }`;
};
