import * as fs from 'fs';
import * as path from 'path';

const EXCLUDED_DIRS = ['node_modules', 'dist', '.angular', '.git', 'e2e', 'coverage', 'assets'];
const EXCLUDED_FILES = [
  /\.spec\.ts$/,
  /\.test\.ts$/,
  /\.d\.ts$/,
  /\.module\.ts$/,
  /environment.*\.ts$/,
  /main\.ts$/,
  /polyfills\.ts$/,
  /karma\.conf/,
  /jest\.config/,
  /tsconfig/,
  /webpack/,
  /\.stories\.ts$/,
  /app\.config\.ts$/,
];

export const scanProject = (projectPath: string): string[] => {
  const absolutePath = path.resolve(projectPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Project path does not exist: ${absolutePath}`);
  }
  return scanDirectory(absolutePath);
};

const scanDirectory = (dirPath: string): string[] => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (!isExcludedDir(entry.name)) {
        files.push(...scanDirectory(fullPath));
      }
    } else if (entry.isFile() && isAngularSourceFile(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
};

const isExcludedDir = (dirName: string): boolean =>
  EXCLUDED_DIRS.includes(dirName) || dirName.startsWith('.');

const isAngularSourceFile = (fileName: string): boolean =>
  fileName.endsWith('.ts') && !fileName.includes(' ') && !EXCLUDED_FILES.some(pattern => pattern.test(fileName));
