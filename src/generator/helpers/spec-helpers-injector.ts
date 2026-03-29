import * as path from 'path';
import { GeneratedTest } from '../../models/types';
import { generateSpecHelpersContent } from './spec-helpers-content';

const SPEC_HELPERS_FILENAME = 'spec-test-helpers.ts';

const PROXY_FUNCTION_NAMES = [
  'createServiceMock',
  'createEnrichedMock',
  'createMock',
  'createMockItem',
  'exposed',
  'typed',
  'attempt',
  'asyncAttempt',
];

/**
 * Post-processes generated tests to add the spec-test-helpers utility file
 * and inject import statements into spec files that use proxy functions.
 */
export const injectSpecHelpers = (
  tests: GeneratedTest[],
  projectRoot: string,
): GeneratedTest[] => {
  if (tests.length === 0) return tests;

  const helperFilePath = path.join(projectRoot, SPEC_HELPERS_FILENAME);
  const helperContent = generateSpecHelpersContent();

  const helperFile: GeneratedTest = {
    filePath: helperFilePath,
    content: helperContent,
    sourceFilePath: '',
  };

  const processedTests = tests.map(test => {
    if (!test.sourceFilePath) return test;

    const usedFunctions = PROXY_FUNCTION_NAMES.filter(fn => test.content.includes(fn));
    if (usedFunctions.length === 0) return test;

    const specDir = path.dirname(test.filePath);
    let relativePath = path.relative(specDir, helperFilePath).replace(/\.ts$/, '');
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }

    const importLine = `import { ${usedFunctions.join(', ')} } from '${relativePath}';`;
    const content = addImportLine(test.content, importLine);

    return { ...test, content };
  });

  return [helperFile, ...processedTests];
};

/**
 * Adds an import line after the existing imports block.
 * Finds the last import statement and inserts after it.
 */
const addImportLine = (content: string, importLine: string): string => {
  const lines = content.split('\n');
  let lastImportIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('import ') || trimmed.startsWith("import '") || trimmed.startsWith('import "')) {
      lastImportIndex = i;
    }
    // Stop searching after the first non-import, non-empty line (to avoid matching deep into the file)
    if (lastImportIndex >= 0 && trimmed.length > 0 && !trimmed.startsWith('import')) {
      break;
    }
  }

  if (lastImportIndex >= 0) {
    lines.splice(lastImportIndex + 1, 0, importLine);
  } else {
    // No imports found, add at the top
    lines.unshift(importLine);
  }

  return lines.join('\n');
};
