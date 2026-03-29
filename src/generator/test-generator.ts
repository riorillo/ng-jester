import { ParsedFile, ClassInfo, GeneratedTest, ImportInfo, ProjectConfig, InjectCallInfo } from '../models/types';
import { parseFile } from '../parser/ts-parser';
import { extractImports } from '../parser/import-parser';
import { extractClasses } from '../parser/class-parser';
import { extractSignals, extractInputSignals, extractOutputSignals, extractModelSignals, extractViewQueries, extractInjectCalls, detectRunInInjectionContext } from '../parser/signal-parser';
import { classifyArtifact, extractSignalStores } from '../analyzer/artifact-classifier';
import { enrichAllMethods } from '../analyzer/branch-analyzer';
import { generateComponentTest } from './generators/component-generator';
import { generateServiceTest } from './generators/service-generator';
import { generatePipeTest } from './generators/pipe-generator';
import { generateGuardTest } from './generators/guard-generator';
import { generateDirectiveTest } from './generators/directive-generator';
import { generateInterceptorTest } from './generators/interceptor-generator';
import { generateSignalStoreTest } from './generators/signal-store-generator';
import { generateUtilityTest } from './generators/utility-generator';
import { extractFileExports } from '../parser/export-parser';
import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

const DEFAULT_CONFIG: ProjectConfig = { usesLocalize: false, usesTanStack: false, usesPrimeNG: false, usesOidc: false, usesZoneJs: false };

// Files that crash Jest workers and cannot be tested
const SKIP_PATTERNS: RegExp[] = [
  // Previously skipped staffing-proposal and staffing-position.store — now handled with better mocks
];

const shouldSkipFile = (filePath: string): boolean =>
  SKIP_PATTERNS.some(pattern => pattern.test(filePath));

export const generateTestsForFile = (filePath: string, config: ProjectConfig = DEFAULT_CONFIG): GeneratedTest[] => {
  if (shouldSkipFile(filePath)) return [];
  const parsedFile = parseSourceFile(filePath);
  const results: GeneratedTest[] = [];

  for (const classInfo of parsedFile.classes) {
    if (!classInfo.artifactType) continue;

    const test = generateTestForClass(classInfo, filePath, parsedFile.imports, config);
    if (test) results.push(test);
  }

  for (const store of parsedFile.signalStores) {
    results.push(generateSignalStoreTest(store, filePath, parsedFile.imports, config));
  }

  if (results.length === 0) {
    const sourceFile = parseFile(filePath);
    const fileExports = extractFileExports(sourceFile);
    const utilTest = generateUtilityTest(fileExports, filePath, parsedFile.imports, config);
    if (utilTest) results.push(utilTest);
  }

  return results;
};

const parseSourceFile = (filePath: string): ParsedFile => {
  const sourceFile = parseFile(filePath);
  const imports = extractImports(sourceFile);
  const allImports = [...imports];

  const classes = extractClasses(sourceFile).map(classInfo => {
    const enriched = enrichClassInfo(classInfo, sourceFile, filePath, imports);
    // Merge parent file imports so dependency types can be resolved
    if (classInfo.parentClassName) {
      const parentImports = resolveParentImports(classInfo.parentClassName, filePath, imports);
      for (const pi of parentImports) {
        if (!allImports.some(i => i.moduleSpecifier === pi.moduleSpecifier && i.namedImports.every(n => allImports.some(ai => ai.namedImports.includes(n))))) {
          allImports.push(pi);
        }
      }
    }
    return enriched;
  });
  const signalStores = extractSignalStores(sourceFile);

  return { filePath, imports: allImports, classes, signalStores };
};

const enrichClassInfo = (classInfo: ClassInfo, sourceFile: ts.SourceFile, filePath: string, fileImports: ImportInfo[]): ClassInfo => {
  let classNode: ts.ClassDeclaration | null = null;

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isClassDeclaration(node) && node.name?.text === classInfo.name) {
      classNode = node;
    }
  });

  if (!classNode) return { ...classInfo, artifactType: classifyArtifact(classInfo) };

  let injectCalls = extractInjectCalls(classNode, sourceFile);

  // Resolve parent class inject() calls if the class extends another
  if (classInfo.parentClassName) {
    const parentInjects = resolveParentInjectCalls(classInfo.parentClassName, filePath, fileImports);
    if (parentInjects.length > 0) {
      const existingTypes = new Set(injectCalls.map(i => i.serviceType));
      const newParentInjects = parentInjects.filter(i => !existingTypes.has(i.serviceType));
      injectCalls = [...injectCalls, ...newParentInjects];
    }
  }

  return {
    ...classInfo,
    artifactType: classifyArtifact(classInfo),
    methods: enrichAllMethods(classInfo.methods),
    signals: extractSignals(classNode, sourceFile),
    inputSignals: extractInputSignals(classNode, sourceFile),
    outputSignals: extractOutputSignals(classNode, sourceFile),
    modelSignals: extractModelSignals(classNode, sourceFile),
    viewQueries: extractViewQueries(classNode, sourceFile),
    injectCalls,
    usesRunInInjectionContext: detectRunInInjectionContext(classNode, sourceFile),
  };
};

const generateTestForClass = (
  classInfo: ClassInfo,
  filePath: string,
  imports: ImportInfo[],
  config: ProjectConfig = DEFAULT_CONFIG,
): GeneratedTest | null => {
  switch (classInfo.artifactType) {
    case 'component':
      return generateComponentTest(classInfo, filePath, imports, config);
    case 'service':
      return generateServiceTest(classInfo, filePath, imports, config);
    case 'pipe':
      return generatePipeTest(classInfo, filePath, imports, config);
    case 'guard':
      return generateGuardTest(classInfo, filePath, imports, config);
    case 'directive':
      return generateDirectiveTest(classInfo, filePath, imports, config);
    case 'interceptor':
      return generateInterceptorTest(classInfo, filePath, imports, config);
    default:
      return null;
  }
};

export const generateTestsForFiles = (filePaths: string[], config: ProjectConfig = DEFAULT_CONFIG): GeneratedTest[] =>
  filePaths.flatMap(f => generateTestsForFile(f, config));

// Resolve parent class inject() calls by finding and parsing the parent class file
const resolveParentInjectCalls = (parentClassName: string, childFilePath: string, childImports: ImportInfo[]): InjectCallInfo[] => {
  const parsed = parseParentClass(parentClassName, childFilePath, childImports);
  return parsed?.injectCalls ?? [];
};

// Resolve parent class imports so we can generate proper import statements for parent dependencies
const resolveParentImports = (parentClassName: string, childFilePath: string, childImports: ImportInfo[]): ImportInfo[] => {
  const parsed = parseParentClass(parentClassName, childFilePath, childImports);
  if (!parsed) return [];
  // Convert parent imports to be relative from child file's perspective
  const parentDir = path.dirname(parsed.parentPath);
  const childDir = path.dirname(childFilePath);
  return parsed.imports.map(imp => {
    if (imp.moduleSpecifier.startsWith('.')) {
      const absPath = path.resolve(parentDir, imp.moduleSpecifier);
      const relPath = path.relative(childDir, absPath);
      return { ...imp, moduleSpecifier: relPath.startsWith('.') ? relPath : './' + relPath };
    }
    return imp;
  });
};

interface ParentParseResult {
  injectCalls: InjectCallInfo[];
  imports: ImportInfo[];
  parentPath: string;
}

const parentParseCache = new Map<string, ParentParseResult | null>();

const parseParentClass = (parentClassName: string, childFilePath: string, childImports: ImportInfo[]): ParentParseResult | null => {
  const parentImport = childImports.find(i => i.namedImports.includes(parentClassName));
  if (!parentImport) return null;

  const childDir = path.dirname(childFilePath);
  let parentPath = path.resolve(childDir, parentImport.moduleSpecifier);
  if (!parentPath.endsWith('.ts')) parentPath += '.ts';

  if (parentParseCache.has(parentPath)) return parentParseCache.get(parentPath)!;

  if (!fs.existsSync(parentPath)) {
    parentParseCache.set(parentPath, null);
    return null;
  }

  try {
    const parentSourceFile = parseFile(parentPath);
    const parentImports = extractImports(parentSourceFile);

    let parentClassNode: ts.ClassDeclaration | null = null;
    ts.forEachChild(parentSourceFile, (node) => {
      if (ts.isClassDeclaration(node) && node.name?.text === parentClassName) {
        parentClassNode = node;
      }
    });
    if (!parentClassNode) {
      parentParseCache.set(parentPath, null);
      return null;
    }

    const result: ParentParseResult = {
      injectCalls: extractInjectCalls(parentClassNode, parentSourceFile),
      imports: parentImports,
      parentPath,
    };
    parentParseCache.set(parentPath, result);
    return result;
  } catch {
    parentParseCache.set(parentPath, null);
    return null;
  }
};
