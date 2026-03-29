import * as ts from 'typescript';
import { getNodeText, getTypeText, hasModifier } from './ts-parser';

export interface ExportedFunctionInfo {
  name: string;
  params: { name: string; type: string | null }[];
  returnType: string | null;
  isAsync: boolean;
  body: string;
  returnsSignalStore: boolean;
}

export interface ExportedConstInfo {
  name: string;
  type: string | null;
  initializerText: string;
  isZodSchema: boolean;
  functionProperties: { name: string; paramCount: number }[];
}

export interface ExportedClassInfo {
  name: string;
  isAbstract: boolean;
  staticMethods: { name: string; params: { name: string; type: string | null }[] }[];
  instanceMethods: { name: string; params: { name: string; type: string | null }[] }[];
  constructorParams: { name: string; type: string | null }[];
  body: string;
}

export interface FileExports {
  functions: ExportedFunctionInfo[];
  constants: ExportedConstInfo[];
  classes: ExportedClassInfo[];
}

const isExported = (node: ts.Node): boolean =>
  hasModifier(node, ts.SyntaxKind.ExportKeyword);

const isZodSchema = (text: string): boolean =>
  /\bz\./.test(text) || /\.transform\(/.test(text) || /Schema\.parse/.test(text) || /\.pipe\(/.test(text);

const extractParams = (params: ts.NodeArray<ts.ParameterDeclaration>, sourceFile: ts.SourceFile): { name: string; type: string | null }[] =>
  params.map(p => ({
    name: p.name.getText(sourceFile),
    type: getTypeText(p.type, sourceFile),
  }));

const extractArrowFunction = (
  name: string,
  initializer: ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
): ExportedFunctionInfo => {
  const body = initializer.body ? getNodeText(initializer.body, sourceFile) : '';
  return {
    name,
    params: extractParams(initializer.parameters, sourceFile),
    returnType: getTypeText(initializer.type, sourceFile),
    isAsync: hasModifier(initializer, ts.SyntaxKind.AsyncKeyword),
    body,
    returnsSignalStore: body.includes('signalStore('),
  };
};

const hasAngularDecorator = (node: ts.ClassDeclaration): boolean => {
  const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
  if (!decorators) return false;
  const angularDecorators = new Set(['Component', 'Directive', 'Pipe', 'Injectable', 'NgModule']);
  return decorators.some(d => {
    const expr = d.expression;
    const name = ts.isCallExpression(expr) ? expr.expression.getText() : expr.getText();
    return angularDecorators.has(name);
  });
};

export const extractFileExports = (sourceFile: ts.SourceFile): FileExports => {
  const functions: ExportedFunctionInfo[] = [];
  const constants: ExportedConstInfo[] = [];
  const classes: ExportedClassInfo[] = [];

  ts.forEachChild(sourceFile, (node) => {
    // Exported function declarations: export function foo() { ... }
    if (ts.isFunctionDeclaration(node) && isExported(node) && node.name) {
      const body = node.body ? getNodeText(node.body, sourceFile) : '';
      functions.push({
        name: node.name.text,
        params: extractParams(node.parameters, sourceFile),
        returnType: getTypeText(node.type, sourceFile),
        isAsync: hasModifier(node, ts.SyntaxKind.AsyncKeyword),
        body,
        returnsSignalStore: body.includes('signalStore('),
      });
    }

    // Exported variable statements: export const foo = ...
    if (ts.isVariableStatement(node) && isExported(node)) {
      for (const decl of node.declarationList.declarations) {
        const name = decl.name.getText(sourceFile);
        const initializer = decl.initializer;

        if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
          functions.push(extractArrowFunction(name, initializer, sourceFile));
        } else {
          const initText = initializer ? getNodeText(initializer, sourceFile) : '';
          const functionProperties = extractFunctionProperties(initializer, sourceFile);
          constants.push({
            name,
            type: getTypeText(decl.type, sourceFile),
            initializerText: initText,
            isZodSchema: isZodSchema(initText),
            functionProperties,
          });
        }
      }
    }

    // Exported class declarations without Angular decorators
    if (ts.isClassDeclaration(node) && isExported(node) && node.name && !hasAngularDecorator(node)) {
      const staticMethods: ExportedClassInfo['staticMethods'] = [];
      const instanceMethods: ExportedClassInfo['instanceMethods'] = [];
      let constructorParams: { name: string; type: string | null }[] = [];
      const isAbstract = hasModifier(node, ts.SyntaxKind.AbstractKeyword);

      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name) {
          const methodName = member.name.getText(sourceFile);
          const params = extractParams(member.parameters, sourceFile);
          const isPrivate = hasModifier(member, ts.SyntaxKind.PrivateKeyword);
          if (isPrivate) continue;

          if (hasModifier(member, ts.SyntaxKind.StaticKeyword)) {
            staticMethods.push({ name: methodName, params });
          } else {
            instanceMethods.push({ name: methodName, params });
          }
        }

        if (ts.isConstructorDeclaration(member)) {
          constructorParams = extractParams(member.parameters, sourceFile);
        }
      }

      classes.push({
        name: node.name.text,
        isAbstract,
        staticMethods,
        instanceMethods,
        constructorParams,
        body: getNodeText(node, sourceFile),
      });
    }
  });

  return { functions, constants, classes };
};

const extractFunctionProperties = (
  init: ts.Expression | undefined,
  sourceFile: ts.SourceFile,
): { name: string; paramCount: number }[] => {
  if (!init || !ts.isObjectLiteralExpression(init)) return [];
  const result: { name: string; paramCount: number }[] = [];
  for (const prop of init.properties) {
    if (ts.isPropertyAssignment(prop) && prop.initializer) {
      const name = prop.name ? prop.name.getText(sourceFile) : '';
      if (ts.isArrowFunction(prop.initializer) || ts.isFunctionExpression(prop.initializer)) {
        result.push({ name, paramCount: prop.initializer.parameters.length });
      }
    }
  }
  return result;
};
