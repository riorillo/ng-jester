import * as ts from 'typescript';
import { ClassInfo, MethodInfo, PropertyInfo, ParamInfo, ConstructorParam, Visibility } from '../models/types';
import { ANGULAR_LIFECYCLE_HOOKS } from '../models/angular-types';
import { extractDecorators } from './decorator-parser';
import { getNodeText, getTypeText, hasModifier } from './ts-parser';

export const extractClasses = (sourceFile: ts.SourceFile): ClassInfo[] => {
  const classes: ClassInfo[] = [];

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isClassDeclaration(node) && node.name) {
      classes.push(parseClassDeclaration(node, sourceFile));
    }
  });

  return classes;
};

const parseClassDeclaration = (node: ts.ClassDeclaration, sourceFile: ts.SourceFile): ClassInfo => {
  const name = node.name?.text ?? 'AnonymousClass';
  const decoratorMetadata = extractDecorators(node, sourceFile);
  const constructorParams = extractConstructorParams(node, sourceFile);
  const constructorBody = extractConstructorBody(node, sourceFile);
  const methods = extractMethods(node, sourceFile);
  const properties = extractProperties(node, sourceFile);
  const lifecycleHooks = detectLifecycleHooks(methods);
  const parentClassName = extractParentClassName(node);

  return {
    name,
    artifactType: null,
    decoratorMetadata,
    constructorParams,
    constructorBody,
    injectCalls: [],
    methods,
    properties,
    signals: [],
    inputSignals: [],
    outputSignals: [],
    modelSignals: [],
    viewQueries: [],
    lifecycleHooks,
    usesRunInInjectionContext: false,
    parentClassName,
  };
};

const extractConstructorParams = (classNode: ts.ClassDeclaration, sourceFile: ts.SourceFile): ConstructorParam[] => {
  const constructor = classNode.members.find(ts.isConstructorDeclaration) as ts.ConstructorDeclaration | undefined;
  if (!constructor) return [];

  return constructor.parameters.map(param => parseConstructorParam(param, sourceFile));
};

const extractConstructorBody = (classNode: ts.ClassDeclaration, sourceFile: ts.SourceFile): string => {
  const constructor = classNode.members.find(ts.isConstructorDeclaration) as ts.ConstructorDeclaration | undefined;
  if (!constructor?.body) return '';
  return getNodeText(constructor.body, sourceFile);
};

const parseConstructorParam = (param: ts.ParameterDeclaration, sourceFile: ts.SourceFile): ConstructorParam => {
  const name = ts.isIdentifier(param.name) ? param.name.text : getNodeText(param.name, sourceFile);
  const type = getTypeText(param.type, sourceFile) ?? 'any';
  const isOptional = param.questionToken !== undefined || param.initializer !== undefined;
  const decorators = extractParamDecorators(param, sourceFile);

  return { name, type, isOptional, decorators };
};

const extractParamDecorators = (param: ts.ParameterDeclaration, sourceFile: ts.SourceFile): string[] => {
  const decorators = ts.canHaveDecorators(param) ? ts.getDecorators(param) : undefined;
  if (!decorators) return [];

  return decorators.map(d => {
    if (ts.isCallExpression(d.expression) && ts.isIdentifier(d.expression.expression)) {
      return d.expression.expression.text;
    }
    if (ts.isIdentifier(d.expression)) {
      return d.expression.text;
    }
    return getNodeText(d.expression, sourceFile);
  });
};

export const extractMethods = (classNode: ts.ClassDeclaration, sourceFile: ts.SourceFile): MethodInfo[] => {
  const methods: MethodInfo[] = [];

  for (const member of classNode.members) {
    if (ts.isMethodDeclaration(member) && member.name) {
      methods.push(parseMethod(member, sourceFile));
    } else if (ts.isPropertyDeclaration(member) && member.name && member.initializer) {
      const arrowMethod = tryParseArrowProperty(member, sourceFile);
      if (arrowMethod) methods.push(arrowMethod);
    } else if (ts.isGetAccessorDeclaration(member) && member.name) {
      methods.push(parseGetAccessor(member, sourceFile));
    }
  }

  return methods;
};

const tryParseArrowProperty = (prop: ts.PropertyDeclaration, sourceFile: ts.SourceFile): MethodInfo | null => {
  const init = prop.initializer;
  if (!init) return null;

  let arrow: ts.ArrowFunction | ts.FunctionExpression | undefined;
  if (ts.isArrowFunction(init)) arrow = init;
  else if (ts.isFunctionExpression(init)) arrow = init;
  else return null;

  const name = ts.isIdentifier(prop.name) ? prop.name.text : getNodeText(prop.name, sourceFile);
  const params = arrow.parameters.map(p => parseParam(p, sourceFile));
  const returnType = getTypeText(arrow.type, sourceFile);
  const visibility = getVisibility(prop);
  const isAsync = hasModifier(prop, ts.SyntaxKind.AsyncKeyword) ||
    (arrow.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false);
  const isStatic = hasModifier(prop, ts.SyntaxKind.StaticKeyword);
  const body = arrow.body ? getNodeText(arrow.body, sourceFile) : '';

  return {
    name,
    params,
    returnType,
    visibility,
    isAsync,
    isStatic,
    branches: [],
    body,
    usesRunInInjectionContext: body.includes('runInInjectionContext'),
  };
};

const parseMethod = (method: ts.MethodDeclaration, sourceFile: ts.SourceFile): MethodInfo => {
  const name = ts.isIdentifier(method.name) ? method.name.text : getNodeText(method.name, sourceFile);
  const params = method.parameters.map(p => parseParam(p, sourceFile));
  const returnType = getTypeText(method.type, sourceFile);
  const visibility = getVisibility(method);
  const isAsync = hasModifier(method, ts.SyntaxKind.AsyncKeyword);
  const isStatic = hasModifier(method, ts.SyntaxKind.StaticKeyword);
  const body = method.body ? getNodeText(method.body, sourceFile) : '';

  return {
    name,
    params,
    returnType,
    visibility,
    isAsync,
    isStatic,
    branches: [],
    body,
    usesRunInInjectionContext: body.includes('runInInjectionContext'),
  };
};

const parseGetAccessor = (getter: ts.GetAccessorDeclaration, sourceFile: ts.SourceFile): MethodInfo => {
  const name = ts.isIdentifier(getter.name) ? getter.name.text : getNodeText(getter.name, sourceFile);
  const returnType = getTypeText(getter.type, sourceFile);
  const visibility = getVisibility(getter as unknown as ts.MethodDeclaration);
  const body = getter.body ? getNodeText(getter.body, sourceFile) : '';

  return {
    name,
    params: [],
    returnType,
    visibility,
    isAsync: false,
    isStatic: false,
    branches: [],
    body,
    isGetter: true,
    usesRunInInjectionContext: body.includes('runInInjectionContext'),
  };
};

const parseParam = (param: ts.ParameterDeclaration, sourceFile: ts.SourceFile): ParamInfo => ({
  name: ts.isIdentifier(param.name) ? param.name.text : getNodeText(param.name, sourceFile),
  type: getTypeText(param.type, sourceFile),
  isOptional: param.questionToken !== undefined || param.initializer !== undefined,
  defaultValue: param.initializer ? getNodeText(param.initializer, sourceFile) : null,
});

const getVisibility = (node: ts.MethodDeclaration | ts.PropertyDeclaration): Visibility => {
  if (hasModifier(node, ts.SyntaxKind.PrivateKeyword)) return 'private';
  if (hasModifier(node, ts.SyntaxKind.ProtectedKeyword)) return 'protected';
  return 'public';
};

export const extractProperties = (classNode: ts.ClassDeclaration, sourceFile: ts.SourceFile): PropertyInfo[] => {
  const properties: PropertyInfo[] = [];

  for (const member of classNode.members) {
    if (ts.isPropertyDeclaration(member) && member.name) {
      properties.push(parseProperty(member, sourceFile));
    }
  }

  return properties;
};

const parseProperty = (prop: ts.PropertyDeclaration, sourceFile: ts.SourceFile): PropertyInfo => ({
  name: ts.isIdentifier(prop.name) ? prop.name.text : getNodeText(prop.name, sourceFile),
  type: getTypeText(prop.type, sourceFile),
  visibility: getVisibility(prop),
  isReadonly: hasModifier(prop, ts.SyntaxKind.ReadonlyKeyword),
  isStatic: hasModifier(prop, ts.SyntaxKind.StaticKeyword),
  initializer: prop.initializer ? getNodeText(prop.initializer, sourceFile) : null,
});

const detectLifecycleHooks = (methods: MethodInfo[]): string[] =>
  methods
    .filter(m => (ANGULAR_LIFECYCLE_HOOKS as readonly string[]).includes(m.name))
    .map(m => m.name);

const extractParentClassName = (node: ts.ClassDeclaration): string | undefined => {
  if (!node.heritageClauses) return undefined;
  for (const clause of node.heritageClauses) {
    if (clause.token === ts.SyntaxKind.ExtendsKeyword && clause.types.length > 0) {
      const expr = clause.types[0].expression;
      if (ts.isIdentifier(expr)) return expr.text;
    }
  }
  return undefined;
};
