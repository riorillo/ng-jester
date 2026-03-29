import * as prettier from 'prettier';
import { GeneratedTest } from '../models/types';

const PRETTIER_OPTIONS: prettier.Options = {
  parser: 'typescript',
  singleQuote: true,
  trailingComma: 'es5',
  printWidth: 80,
  tabWidth: 2,
  useTabs: true,
  semi: true,
  bracketSpacing: true,
  arrowParens: 'avoid',
  bracketSameLine: true,
};

const formatContent = async (content: string): Promise<string> => {
  try {
    return await prettier.format(content, PRETTIER_OPTIONS);
  } catch {
    // If formatting fails (e.g. generated code has syntax issues), return as-is
    return content;
  }
};

export const formatGeneratedTests = async (tests: GeneratedTest[]): Promise<GeneratedTest[]> =>
  Promise.all(
    tests.map(async test => ({
      ...test,
      content: await formatContent(test.content),
    })),
  );
