import * as ts from 'typescript';
import * as fs from 'fs';

export const parseFile = (filePath: string): ts.SourceFile => {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseSource(content, filePath);
};

export const parseSource = (content: string, fileName: string = 'source.ts'): ts.SourceFile =>
  ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

export const getNodeText = (node: ts.Node, sourceFile: ts.SourceFile): string =>
  node.getText(sourceFile);

export const findNodes = <T extends ts.Node>(
  sourceFile: ts.SourceFile,
  kind: ts.SyntaxKind,
): T[] => {
  const result: T[] = [];
  const visit = (node: ts.Node): void => {
    if (node.kind === kind) result.push(node as T);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return result;
};

export const findClassDeclarations = (sourceFile: ts.SourceFile): ts.ClassDeclaration[] =>
  findNodes<ts.ClassDeclaration>(sourceFile, ts.SyntaxKind.ClassDeclaration);

export const findVariableStatements = (sourceFile: ts.SourceFile): ts.VariableStatement[] =>
  findNodes<ts.VariableStatement>(sourceFile, ts.SyntaxKind.VariableStatement);

export const getTypeText = (node: ts.TypeNode | undefined, sourceFile: ts.SourceFile): string | null => {
  if (!node) return null;
  return node.getText(sourceFile);
};

export const hasModifier = (node: ts.Node, modifier: ts.SyntaxKind): boolean => {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some(m => m.kind === modifier) ?? false;
};
