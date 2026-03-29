import * as path from 'path';
import { scanProject } from '../../src/scanner/file-scanner';

describe('file-scanner', () => {
  const fixturesDir = path.join(__dirname, '..', 'fixtures');

  it('should find .ts files in directory', () => {
    const files = scanProject(fixturesDir);
    expect(files.length).toBeGreaterThan(0);
  });

  it('should only return .ts files', () => {
    const files = scanProject(fixturesDir);
    for (const file of files) {
      expect(file).toMatch(/\.ts$/);
    }
  });

  it('should not return .spec.ts files', () => {
    const files = scanProject(fixturesDir);
    for (const file of files) {
      expect(file).not.toMatch(/\.spec\.ts$/);
    }
  });

  it('should throw for non-existent path', () => {
    expect(() => scanProject('/non/existent/path')).toThrow();
  });
});
