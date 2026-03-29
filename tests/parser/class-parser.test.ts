import * as path from 'path';
import { parseFile } from '../../src/parser/ts-parser';
import { extractClasses } from '../../src/parser/class-parser';
import { extractImports } from '../../src/parser/import-parser';

describe('class-parser', () => {
  const componentFile = path.join(__dirname, '..', 'fixtures', 'sample.component.ts');
  const serviceFile = path.join(__dirname, '..', 'fixtures', 'sample.service.ts');

  it('should extract class from component file', () => {
    const sourceFile = parseFile(componentFile);
    const classes = extractClasses(sourceFile);
    expect(classes.length).toBe(1);
    expect(classes[0].name).toBe('SampleComponent');
  });

  it('should extract methods from component', () => {
    const sourceFile = parseFile(componentFile);
    const classes = extractClasses(sourceFile);
    const methods = classes[0].methods;
    const methodNames = methods.map(m => m.name);
    expect(methodNames).toContain('ngOnInit');
    expect(methodNames).toContain('increment');
    expect(methodNames).toContain('loadData');
    expect(methodNames).toContain('getLabel');
  });

  it('should detect async methods', () => {
    const sourceFile = parseFile(componentFile);
    const classes = extractClasses(sourceFile);
    const loadData = classes[0].methods.find(m => m.name === 'loadData');
    expect(loadData?.isAsync).toBe(true);
  });

  it('should extract lifecycle hooks', () => {
    const sourceFile = parseFile(componentFile);
    const classes = extractClasses(sourceFile);
    expect(classes[0].lifecycleHooks).toContain('ngOnInit');
    expect(classes[0].lifecycleHooks).toContain('ngOnDestroy');
  });

  it('should extract class from service file', () => {
    const sourceFile = parseFile(serviceFile);
    const classes = extractClasses(sourceFile);
    expect(classes.length).toBe(1);
    expect(classes[0].name).toBe('SampleService');
  });

  it('should extract imports', () => {
    const sourceFile = parseFile(componentFile);
    const imports = extractImports(sourceFile);
    expect(imports.length).toBeGreaterThan(0);
    const angularImport = imports.find(i => i.moduleSpecifier === '@angular/core');
    expect(angularImport).toBeDefined();
    expect(angularImport?.namedImports).toContain('Component');
  });

  it('should extract method params', () => {
    const sourceFile = parseFile(componentFile);
    const classes = extractClasses(sourceFile);
    const getLabel = classes[0].methods.find(m => m.name === 'getLabel');
    expect(getLabel?.params.length).toBe(1);
    expect(getLabel?.params[0].name).toBe('prefix');
    expect(getLabel?.params[0].type).toBe('string');
  });
});
