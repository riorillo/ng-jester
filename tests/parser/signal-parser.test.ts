import * as path from 'path';
import * as ts from 'typescript';
import { parseFile } from '../../src/parser/ts-parser';
import { extractSignals, extractInputSignals, extractOutputSignals, extractModelSignals, extractInjectCalls } from '../../src/parser/signal-parser';

describe('signal-parser', () => {
  const componentFile = path.join(__dirname, '..', 'fixtures', 'sample.component.ts');
  const tanstackFile = path.join(__dirname, '..', 'fixtures', 'sample-tanstack.component.ts');

  const getClassNode = (filePath: string): ts.ClassDeclaration => {
    const sourceFile = parseFile(filePath);
    let classNode: ts.ClassDeclaration | null = null;
    ts.forEachChild(sourceFile, node => {
      if (ts.isClassDeclaration(node)) classNode = node;
    });
    return classNode!;
  };

  it('should extract signals from component', () => {
    const sourceFile = parseFile(componentFile);
    const classNode = getClassNode(componentFile);
    const signals = extractSignals(classNode, sourceFile);
    const names = signals.map(s => s.name);
    expect(names).toContain('count');
    expect(names).toContain('double');
    expect(names).toContain('logger');
  });

  it('should classify signal kinds', () => {
    const sourceFile = parseFile(componentFile);
    const classNode = getClassNode(componentFile);
    const signals = extractSignals(classNode, sourceFile);
    const count = signals.find(s => s.name === 'count');
    const double = signals.find(s => s.name === 'double');
    const logger = signals.find(s => s.name === 'logger');
    expect(count?.kind).toBe('signal');
    expect(double?.kind).toBe('computed');
    expect(logger?.kind).toBe('effect');
  });

  it('should extract input signals', () => {
    const sourceFile = parseFile(componentFile);
    const classNode = getClassNode(componentFile);
    const inputs = extractInputSignals(classNode, sourceFile);
    expect(inputs.length).toBe(2);
    const name = inputs.find(i => i.name === 'name');
    const age = inputs.find(i => i.name === 'age');
    expect(name?.required).toBe(true);
    expect(age?.required).toBe(false);
  });

  it('should extract output signals', () => {
    const sourceFile = parseFile(componentFile);
    const classNode = getClassNode(componentFile);
    const outputs = extractOutputSignals(classNode, sourceFile);
    expect(outputs.length).toBe(1);
    expect(outputs[0].name).toBe('clicked');
  });

  it('should extract model signals', () => {
    const sourceFile = parseFile(componentFile);
    const classNode = getClassNode(componentFile);
    const models = extractModelSignals(classNode, sourceFile);
    expect(models.length).toBe(1);
    expect(models[0].name).toBe('value');
  });

  it('should extract inject calls', () => {
    const sourceFile = parseFile(componentFile);
    const classNode = getClassNode(componentFile);
    const injects = extractInjectCalls(classNode, sourceFile);
    expect(injects.length).toBeGreaterThanOrEqual(1);
    const userService = injects.find(i => i.serviceType === 'UserService');
    expect(userService).toBeDefined();
    expect(userService?.kind).toBe('inject');
  });

  it('should extract tanstack inject calls', () => {
    const sourceFile = parseFile(tanstackFile);
    const classNode = getClassNode(tanstackFile);
    const injects = extractInjectCalls(classNode, sourceFile);
    const queryCall = injects.find(i => i.functionName === 'injectQuery');
    const mutationCall = injects.find(i => i.functionName === 'injectMutation');
    const clientCall = injects.find(i => i.functionName === 'injectQueryClient');
    expect(queryCall).toBeDefined();
    expect(queryCall?.kind).toBe('injectQuery');
    expect(mutationCall).toBeDefined();
    expect(mutationCall?.kind).toBe('injectMutation');
    expect(clientCall).toBeDefined();
    expect(clientCall?.kind).toBe('injectQueryClient');
  });
});
