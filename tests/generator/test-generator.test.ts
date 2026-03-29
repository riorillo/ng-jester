import * as path from 'path';
import { generateTestsForFile } from '../../src/generator/test-generator';

describe('test-generator (e2e)', () => {
  const fixturesDir = path.join(__dirname, '..', 'fixtures');

  it('should generate test for component', () => {
    const results = generateTestsForFile(path.join(fixturesDir, 'sample.component.ts'));
    expect(results.length).toBe(1);
    expect(results[0].filePath).toMatch(/\.spec\.ts$/);
    expect(results[0].content).toContain('describe');
    expect(results[0].content).toContain('SampleComponent');
    expect(results[0].content).toContain('TestBed');
  });

  it('should generate test for service', () => {
    const results = generateTestsForFile(path.join(fixturesDir, 'sample.service.ts'));
    expect(results.length).toBe(1);
    expect(results[0].content).toContain('SampleService');
    expect(results[0].content).toContain('should create');
  });

  it('should generate test for pipe', () => {
    const results = generateTestsForFile(path.join(fixturesDir, 'sample.pipe.ts'));
    expect(results.length).toBe(1);
    expect(results[0].content).toContain('TruncatePipe');
    expect(results[0].content).toContain('transform');
  });

  it('should generate test for tanstack component', () => {
    const results = generateTestsForFile(path.join(fixturesDir, 'sample-tanstack.component.ts'));
    expect(results.length).toBe(1);
    expect(results[0].content).toContain('TanStackComponent');
    expect(results[0].content).toContain('jest.mock');
    expect(results[0].content).toContain('@tanstack/angular-query-experimental');
  });

  it('should include signal tests for component', () => {
    const results = generateTestsForFile(path.join(fixturesDir, 'sample.component.ts'));
    const content = results[0].content;
    expect(content).toContain('count');
    expect(content).toContain('signal');
  });

  it('should include input signal tests', () => {
    const results = generateTestsForFile(path.join(fixturesDir, 'sample.component.ts'));
    const content = results[0].content;
    expect(content).toContain('setInput');
  });

  it('should include method tests', () => {
    const results = generateTestsForFile(path.join(fixturesDir, 'sample.component.ts'));
    const content = results[0].content;
    expect(content).toContain('increment');
    expect(content).toContain('loadData');
    expect(content).toContain('getLabel');
  });

  it('should include lifecycle hook tests', () => {
    const results = generateTestsForFile(path.join(fixturesDir, 'sample.component.ts'));
    const content = results[0].content;
    expect(content).toContain('ngOnInit');
    expect(content).toContain('ngOnDestroy');
  });
});
