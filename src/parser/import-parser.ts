import * as ts from 'typescript';
import { ImportInfo } from '../models/types';

export const extractImports = (sourceFile: ts.SourceFile): ImportInfo[] => {
  const imports: ImportInfo[] = [];

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node)) {
      imports.push(parseImportDeclaration(node, sourceFile));
    }
  });

  return imports;
};

const parseImportDeclaration = (node: ts.ImportDeclaration, sourceFile: ts.SourceFile): ImportInfo => {
  const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
  const namedImports: string[] = [];
  let defaultImport: string | null = null;
  let namespaceImport: string | null = null;

  const importClause = node.importClause;
  if (importClause) {
    if (importClause.name) {
      defaultImport = importClause.name.text;
    }

    const bindings = importClause.namedBindings;
    if (bindings) {
      if (ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          namedImports.push(element.name.text);
        }
      } else if (ts.isNamespaceImport(bindings)) {
        namespaceImport = bindings.name.text;
      }
    }
  }

  return { moduleSpecifier, namedImports, defaultImport, namespaceImport };
};

export const findImportForSymbol = (imports: ImportInfo[], symbolName: string): ImportInfo | undefined =>
  imports.find(imp => imp.namedImports.includes(symbolName) || imp.defaultImport === symbolName);

export const getImportModuleForType = (imports: ImportInfo[], typeName: string): string | null => {
  const imp = findImportForSymbol(imports, typeName);
  return imp ? imp.moduleSpecifier : null;
};
