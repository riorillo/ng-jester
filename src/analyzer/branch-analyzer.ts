import * as ts from 'typescript';
import { BranchInfo, MethodInfo } from '../models/types';
import { parseSource, getNodeText } from '../parser/ts-parser';

export const analyzeBranches = (method: MethodInfo): BranchInfo[] => {
  if (!method.body || method.body.trim() === '') return [];

  // Wrap body in a function to make it valid TS
  const wrappedSource = `function __analyze() ${method.body}`;
  const sourceFile = parseSource(wrappedSource, 'branch-analysis.ts');

  const branches: BranchInfo[] = [];
  walkForBranches(sourceFile, sourceFile, branches);
  return branches;
};

const walkForBranches = (node: ts.Node, sourceFile: ts.SourceFile, branches: BranchInfo[]): void => {
  if (ts.isIfStatement(node)) {
    const condition = getNodeText(node.expression, sourceFile);
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
    branches.push({ type: 'if', condition, line });
    if (node.elseStatement) {
      branches.push({ type: 'else', condition, line: sourceFile.getLineAndCharacterOfPosition(node.elseStatement.getStart(sourceFile)).line });
    }
  }

  if (ts.isSwitchStatement(node)) {
    for (const clause of node.caseBlock.clauses) {
      if (ts.isCaseClause(clause)) {
        const condition = getNodeText(clause.expression, sourceFile);
        const line = sourceFile.getLineAndCharacterOfPosition(clause.getStart(sourceFile)).line;
        branches.push({ type: 'switch-case', condition, line });
      }
    }
  }

  if (ts.isConditionalExpression(node)) {
    const condition = getNodeText(node.condition, sourceFile);
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
    branches.push({ type: 'ternary', condition, line });
  }

  // Check for nullish coalescing (??)
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    const condition = getNodeText(node.left, sourceFile);
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
    branches.push({ type: 'nullish-coalescing', condition, line });
  }

  ts.forEachChild(node, child => walkForBranches(child, sourceFile, branches));
};

export const enrichMethodWithBranches = (method: MethodInfo): MethodInfo => ({
  ...method,
  branches: analyzeBranches(method),
});

export const enrichAllMethods = (methods: MethodInfo[]): MethodInfo[] =>
  methods.map(enrichMethodWithBranches);

export const getMethodBranchCount = (method: MethodInfo): number =>
  method.branches.length;

export const hasBranches = (method: MethodInfo): boolean =>
  method.branches.length > 0;
