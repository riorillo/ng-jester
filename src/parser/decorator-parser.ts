import * as ts from 'typescript';
import { DecoratorMetadata } from '../models/types';
import { ANGULAR_DECORATORS } from '../models/angular-types';
import { getNodeText } from './ts-parser';

export const extractDecorators = (node: ts.ClassDeclaration, sourceFile: ts.SourceFile): DecoratorMetadata | null => {
  const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
  if (!decorators) return null;

  for (const decorator of decorators) {
    const metadata = parseDecorator(decorator, sourceFile);
    if (metadata && isAngularDecorator(metadata.name)) {
      return metadata;
    }
  }

  return null;
};

const parseDecorator = (decorator: ts.Decorator, sourceFile: ts.SourceFile): DecoratorMetadata | null => {
  const expr = decorator.expression;

  if (ts.isCallExpression(expr)) {
    const name = getDecoratorName(expr.expression, sourceFile);
    if (!name) return null;

    const args = parseDecoratorArgs(expr, sourceFile);
    return { name, args };
  }

  if (ts.isIdentifier(expr)) {
    return { name: expr.text, args: {} };
  }

  return null;
};

const getDecoratorName = (expr: ts.Expression, _sourceFile: ts.SourceFile): string | null => {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) return expr.name.text;
  return null;
};

const parseDecoratorArgs = (callExpr: ts.CallExpression, sourceFile: ts.SourceFile): Record<string, unknown> => {
  const args: Record<string, unknown> = {};
  if (callExpr.arguments.length === 0) return args;

  const firstArg = callExpr.arguments[0];
  if (ts.isObjectLiteralExpression(firstArg)) {
    for (const prop of firstArg.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        args[prop.name.text] = getNodeText(prop.initializer, sourceFile);
      }
    }
  }

  return args;
};

const isAngularDecorator = (name: string): boolean =>
  (ANGULAR_DECORATORS as readonly string[]).includes(name);

export const isComponentDecorator = (metadata: DecoratorMetadata | null): boolean =>
  metadata?.name === 'Component';

export const isInjectableDecorator = (metadata: DecoratorMetadata | null): boolean =>
  metadata?.name === 'Injectable';

export const isPipeDecorator = (metadata: DecoratorMetadata | null): boolean =>
  metadata?.name === 'Pipe';

export const isDirectiveDecorator = (metadata: DecoratorMetadata | null): boolean =>
  metadata?.name === 'Directive';
