import { ClassInfo, SignalStoreInfo, SignalStoreFeature, ParamInfo } from '../models/types';
import { AngularArtifactType, DECORATOR_TO_ARTIFACT, AngularDecorator } from '../models/angular-types';
import * as ts from 'typescript';
import { findVariableStatements, getNodeText } from '../parser/ts-parser';

export const classifyArtifact = (classInfo: ClassInfo): AngularArtifactType | null => {
  if (!classInfo.decoratorMetadata) return inferFromClassName(classInfo.name);

  const decoratorName = classInfo.decoratorMetadata.name as AngularDecorator;
  const baseType = DECORATOR_TO_ARTIFACT[decoratorName] ?? null;

  if (baseType === 'service') {
    return refineServiceType(classInfo);
  }

  return baseType;
};

// For @Injectable classes, check if they're guards or interceptors
const refineServiceType = (classInfo: ClassInfo): AngularArtifactType => {
  const methodNames = classInfo.methods.map(m => m.name);

  if (methodNames.includes('canActivate') || methodNames.includes('canDeactivate') ||
      methodNames.includes('canMatch') || methodNames.includes('canLoad')) {
    return 'guard';
  }

  if (methodNames.includes('intercept')) {
    return 'interceptor';
  }

  return 'service';
};

// Try to infer from class name when no decorator
const inferFromClassName = (name: string): AngularArtifactType | null => {
  const lower = name.toLowerCase();
  if (lower.endsWith('component')) return 'component';
  if (lower.endsWith('service')) return 'service';
  if (lower.endsWith('pipe')) return 'pipe';
  if (lower.endsWith('guard')) return 'guard';
  if (lower.endsWith('directive')) return 'directive';
  if (lower.endsWith('interceptor')) return 'interceptor';
  return null;
};

// Detect signalStore() variable declarations at module level
export const extractSignalStores = (sourceFile: ts.SourceFile): SignalStoreInfo[] => {
  const stores: SignalStoreInfo[] = [];
  const varStatements = findVariableStatements(sourceFile);

  for (const stmt of varStatements) {
    for (const decl of stmt.declarationList.declarations) {
      if (!decl.initializer || !ts.isCallExpression(decl.initializer)) continue;

      const callName = getCallName(decl.initializer);
      if (callName !== 'signalStore') continue;

      const name = ts.isIdentifier(decl.name) ? decl.name.text : 'UnknownStore';
      const features = parseSignalStoreFeatures(decl.initializer, sourceFile);
      const injectDependencies = extractInjectDependencies(decl.initializer, sourceFile);
      stores.push({ name, features, injectDependencies });
    }
  }

  return stores;
};

const getCallName = (call: ts.CallExpression): string | null => {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  return null;
};

const parseSignalStoreFeatures = (call: ts.CallExpression, sourceFile: ts.SourceFile): SignalStoreFeature[] => {
  const features: SignalStoreFeature[] = [];

  for (const arg of call.arguments) {
    if (!ts.isCallExpression(arg)) continue;
    const featureName = getCallName(arg);
    if (!featureName) continue;

    switch (featureName) {
      case 'withState':
        features.push(parseWithState(arg, sourceFile));
        break;
      case 'withComputed':
        features.push(parseWithComputed(arg, sourceFile));
        break;
      case 'withMethods':
        features.push(parseWithMethods(arg, sourceFile));
        break;
      case 'withProps':
        features.push(parseWithProps(arg, sourceFile));
        break;
      case 'withHooks':
        features.push({ kind: 'withHooks', stateProperties: [], computedProperties: [], methods: [] });
        break;
    }
  }

  return features;
};

const parseWithState = (call: ts.CallExpression, sourceFile: ts.SourceFile): SignalStoreFeature => {
  const stateProperties: { name: string; type: string | null; initialValue: string | null }[] = [];

  if (call.arguments.length > 0) {
    let arg = call.arguments[0];

    // If the arg is an identifier (variable reference), resolve it to its initializer
    if (ts.isIdentifier(arg)) {
      const resolved = resolveVariableInitializer(arg.text, sourceFile);
      if (resolved) arg = resolved;
    }

    if (ts.isObjectLiteralExpression(arg)) {
      for (const prop of arg.properties) {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          stateProperties.push({
            name: prop.name.text,
            type: null,
            initialValue: getNodeText(prop.initializer, sourceFile),
          });
        }
      }
    }
  }

  return { kind: 'withState', stateProperties, computedProperties: [], methods: [] };
};

// Resolve a variable name to its initializer expression in the same source file
const resolveVariableInitializer = (name: string, sourceFile: ts.SourceFile): ts.Expression | null => {
  for (const stmt of sourceFile.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
          return decl.initializer;
        }
      }
    }
  }
  return null;
};

const parseWithComputed = (call: ts.CallExpression, sourceFile: ts.SourceFile): SignalStoreFeature => {
  const computedProperties: { name: string }[] = [];

  if (call.arguments.length > 0) {
    const arg = call.arguments[0];
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
      const objLiteral = findReturnedObjectLiteral(arg.body);

      if (objLiteral) {
        for (const prop of objLiteral.properties) {
          if ((ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) && ts.isIdentifier(prop.name)) {
            computedProperties.push({ name: prop.name.text });
          }
        }
      }
    }
  }

  return { kind: 'withComputed', stateProperties: [], computedProperties, methods: [] };
};

const parseWithMethods = (call: ts.CallExpression, sourceFile: ts.SourceFile): SignalStoreFeature => {
  const methods: { name: string; params: ParamInfo[] }[] = [];

  if (call.arguments.length > 0) {
    const arg = call.arguments[0];
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
      const objLiteral = findReturnedObjectLiteral(arg.body);

      if (objLiteral) {
        for (const prop of objLiteral.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            const params = extractParamsFromInitializer(prop.initializer, sourceFile);
            methods.push({ name: prop.name.text, params });
          } else if (ts.isMethodDeclaration(prop) && ts.isIdentifier(prop.name)) {
            const params = extractParamsFromSignature(prop.parameters, sourceFile);
            methods.push({ name: prop.name.text, params });
          } else if (ts.isShorthandPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            methods.push({ name: prop.name.text, params: [] });
          }
        }
      }
    }
  }

  return { kind: 'withMethods', stateProperties: [], computedProperties: [], methods };
};

const extractParamsFromInitializer = (init: ts.Expression, sourceFile: ts.SourceFile): ParamInfo[] => {
  if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
    return extractParamsFromSignature(init.parameters, sourceFile);
  }
  return [];
};

const extractParamsFromSignature = (
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
  sourceFile: ts.SourceFile,
): ParamInfo[] => {
  return parameters.map(p => ({
    name: p.name.getText(sourceFile),
    type: p.type ? p.type.getText(sourceFile) : null,
    isOptional: !!p.questionToken || !!p.initializer,
    defaultValue: p.initializer ? p.initializer.getText(sourceFile) : null,
  }));
};

const findReturnedObjectLiteral = (body: ts.ConciseBody): ts.ObjectLiteralExpression | null => {
  if (ts.isObjectLiteralExpression(body)) return body;
  if (ts.isParenthesizedExpression(body) && ts.isObjectLiteralExpression(body.expression)) return body.expression;
  if (ts.isBlock(body)) {
    for (const stmt of body.statements) {
      if (ts.isReturnStatement(stmt) && stmt.expression) {
        if (ts.isObjectLiteralExpression(stmt.expression)) return stmt.expression;
        if (ts.isParenthesizedExpression(stmt.expression) && ts.isObjectLiteralExpression(stmt.expression.expression)) {
          return stmt.expression.expression;
        }
      }
    }
  }
  return null;
};

const parseWithProps = (call: ts.CallExpression, sourceFile: ts.SourceFile): SignalStoreFeature => {
  const computedProperties: { name: string }[] = [];

  if (call.arguments.length > 0) {
    const arg = call.arguments[0];
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
      const objLiteral = findReturnedObjectLiteral(arg.body);
      if (objLiteral) {
        for (const prop of objLiteral.properties) {
          if ((ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) && ts.isIdentifier(prop.name)) {
            computedProperties.push({ name: prop.name.text });
          }
        }
      }
    }
  }

  return { kind: 'withProps', stateProperties: [], computedProperties, methods: [] };
};

const extractInjectDependencies = (call: ts.CallExpression, sourceFile: ts.SourceFile): string[] => {
  const deps = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === 'inject' && node.arguments.length > 0) {
        const arg = node.arguments[0];
        deps.add(getNodeText(arg, sourceFile));
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(call, visit);
  return Array.from(deps);
};
