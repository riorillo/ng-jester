import * as ts from 'typescript';
import {
  SignalInfo,
  InputSignalInfo,
  OutputSignalInfo,
  ModelSignalInfo,
  ViewQueryInfo,
  InjectCallInfo,
} from '../models/types';
import {
  SIGNAL_FUNCTIONS,
  TANSTACK_INJECT_FUNCTIONS,
  SignalKind,
  ViewQueryKind,
  InjectCallKind,
} from '../models/angular-types';
import { Visibility } from '../models/types';
import { getNodeText, getTypeText } from './ts-parser';

// --- Internal helpers ---

const getVisibility = (property: ts.PropertyDeclaration): Visibility => {
  if (property.modifiers) {
    for (const mod of property.modifiers) {
      if (mod.kind === ts.SyntaxKind.PrivateKeyword) return 'private';
      if (mod.kind === ts.SyntaxKind.ProtectedKeyword) return 'protected';
    }
  }
  if (property.name && ts.isPrivateIdentifier(property.name)) return 'private';
  return 'public';
};

const getCallExpressionName = (expr: ts.Expression): string | null => {
  if (ts.isIdentifier(expr)) {
    return expr.text;
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return expr.name.text;
  }
  return null;
};

const extractTypeArgument = (
  callExpr: ts.CallExpression,
  sourceFile: ts.SourceFile,
): string | null => {
  const typeArgs = callExpr.typeArguments;
  if (typeArgs && typeArgs.length > 0) {
    return getTypeText(typeArgs[0], sourceFile);
  }
  return null;
};

const isPropertyWithCallInitializer = (
  member: ts.ClassElement,
): { property: ts.PropertyDeclaration; call: ts.CallExpression } | null => {
  if (!ts.isPropertyDeclaration(member)) return null;
  const initializer = member.initializer;
  if (!initializer || !ts.isCallExpression(initializer)) return null;
  return { property: member, call: initializer };
};

// --- Exported extractors ---

export const extractSignals = (
  classNode: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
): SignalInfo[] => {
  const signals: SignalInfo[] = [];

  for (const member of classNode.members) {
    const result = isPropertyWithCallInitializer(member);
    if (!result) continue;

    const { property, call } = result;
    const fnName = getCallExpressionName(call.expression);
    if (!fnName || !(SIGNAL_FUNCTIONS as readonly string[]).includes(fnName)) continue;

    const name = property.name ? getNodeText(property.name, sourceFile) : '';
    const kind = fnName as SignalKind;
    const type = extractTypeArgument(call, sourceFile);
    const initialValue =
      kind === 'signal' && call.arguments.length > 0
        ? getNodeText(call.arguments[0], sourceFile)
        : null;

    const visibility = getVisibility(property);
    signals.push({ name, kind, type, initialValue, visibility });
  }

  return signals;
};

export const extractInputSignals = (
  classNode: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
): InputSignalInfo[] => {
  const inputs: InputSignalInfo[] = [];

  for (const member of classNode.members) {
    const result = isPropertyWithCallInitializer(member);
    if (!result) continue;

    const { property, call } = result;
    const expr = call.expression;

    let required = false;

    if (ts.isIdentifier(expr) && expr.text === 'input') {
      required = false;
    } else if (
      ts.isPropertyAccessExpression(expr) &&
      ts.isIdentifier(expr.expression) &&
      expr.expression.text === 'input' &&
      expr.name.text === 'required'
    ) {
      required = true;
    } else {
      continue;
    }

    const name = property.name ? getNodeText(property.name, sourceFile) : '';
    const type = extractTypeArgument(call, sourceFile);
    const defaultValue =
      !required && call.arguments.length > 0
        ? getNodeText(call.arguments[0], sourceFile)
        : null;

    const visibility = getVisibility(property);
    inputs.push({ name, required, type, defaultValue, visibility });
  }

  return inputs;
};

export const extractOutputSignals = (
  classNode: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
): OutputSignalInfo[] => {
  const outputs: OutputSignalInfo[] = [];

  for (const member of classNode.members) {
    const result = isPropertyWithCallInitializer(member);
    if (!result) continue;

    const { property, call } = result;
    if (!ts.isIdentifier(call.expression) || call.expression.text !== 'output') continue;

    const name = property.name ? getNodeText(property.name, sourceFile) : '';
    const type = extractTypeArgument(call, sourceFile);

    const visibility = getVisibility(property);
    outputs.push({ name, type, visibility });
  }

  return outputs;
};

export const extractModelSignals = (
  classNode: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
): ModelSignalInfo[] => {
  const models: ModelSignalInfo[] = [];

  for (const member of classNode.members) {
    const result = isPropertyWithCallInitializer(member);
    if (!result) continue;

    const { property, call } = result;
    const expr = call.expression;

    let required = false;

    if (ts.isIdentifier(expr) && expr.text === 'model') {
      required = false;
    } else if (
      ts.isPropertyAccessExpression(expr) &&
      ts.isIdentifier(expr.expression) &&
      expr.expression.text === 'model' &&
      expr.name.text === 'required'
    ) {
      required = true;
    } else {
      continue;
    }

    const name = property.name ? getNodeText(property.name, sourceFile) : '';
    const type = extractTypeArgument(call, sourceFile);

    const visibility = getVisibility(property);
    models.push({ name, type, required, visibility });
  }

  return models;
};

export const extractViewQueries = (
  classNode: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
): ViewQueryInfo[] => {
  const queries: ViewQueryInfo[] = [];
  const viewQueryNames: readonly string[] = ['viewChild', 'viewChildren', 'contentChild', 'contentChildren'];

  for (const member of classNode.members) {
    const result = isPropertyWithCallInitializer(member);
    if (!result) continue;

    const { property, call } = result;
    const fnName = getCallExpressionName(call.expression);
    if (!fnName || !viewQueryNames.includes(fnName)) continue;

    const name = property.name ? getNodeText(property.name, sourceFile) : '';
    const kind = fnName as ViewQueryKind;

    // Type argument takes precedence; fall back to first arg if it's an identifier (component ref)
    let type = extractTypeArgument(call, sourceFile);
    if (!type && call.arguments.length > 0 && ts.isIdentifier(call.arguments[0])) {
      type = call.arguments[0].text;
    }

    queries.push({ name, kind, type });
  }

  return queries;
};

export const extractInjectCalls = (
  classNode: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
): InjectCallInfo[] => {
  const injectCalls: InjectCallInfo[] = [];
  const tanstackNames: readonly string[] = TANSTACK_INJECT_FUNCTIONS;

  for (const member of classNode.members) {
    const result = isPropertyWithCallInitializer(member);
    if (!result) continue;

    const { property, call } = result;
    const fnName = getCallExpressionName(call.expression);
    if (!fnName) continue;

    // Must be 'inject' or start with 'inject'
    if (fnName !== 'inject' && !fnName.startsWith('inject')) continue;

    const name = property.name ? getNodeText(property.name, sourceFile) : '';

    let kind: InjectCallKind;
    let serviceType = '';
    let isOptional = false;
    let args: string | null = null;

    if (fnName === 'inject') {
      kind = 'inject';
      if (call.arguments.length > 0) {
        serviceType = getNodeText(call.arguments[0], sourceFile);
      }
      // Check for { optional: true } in second argument
      if (call.arguments.length > 1) {
        const optionsArg = call.arguments[1];
        if (ts.isObjectLiteralExpression(optionsArg)) {
          for (const prop of optionsArg.properties) {
            if (
              ts.isPropertyAssignment(prop) &&
              ts.isIdentifier(prop.name) &&
              prop.name.text === 'optional' &&
              prop.initializer.kind === ts.SyntaxKind.TrueKeyword
            ) {
              isOptional = true;
            }
          }
        }
      }
    } else if (tanstackNames.includes(fnName as typeof TANSTACK_INJECT_FUNCTIONS[number])) {
      kind = fnName as InjectCallKind;
      if (call.arguments.length > 0) {
        args = call.arguments.map(a => getNodeText(a, sourceFile)).join(', ');
      }
    } else {
      kind = 'custom';
      if (call.arguments.length > 0) {
        args = call.arguments.map(a => getNodeText(a, sourceFile)).join(', ');
      }
    }

    injectCalls.push({ name, serviceType, isOptional, kind, functionName: fnName, args });
  }

  return injectCalls;
};

export const detectRunInInjectionContext = (
  classNode: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
): boolean => {
  const visit = (node: ts.Node): boolean => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'runInInjectionContext'
    ) {
      return true;
    }
    return ts.forEachChild(node, visit) ?? false;
  };

  for (const member of classNode.members) {
    if (ts.isMethodDeclaration(member) && member.body) {
      if (visit(member.body)) return true;
    }
  }

  return false;
};
