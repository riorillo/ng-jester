import { SignalInfo, InputSignalInfo, OutputSignalInfo, ModelSignalInfo } from '../../models/types';
import { getDummyValueForType } from '../../utils/type-utils';

const isAccessible = (_signal: { name: string; visibility?: string }): boolean =>
  true;

const needsCast = (signal: { visibility?: string }): boolean =>
  signal.visibility === 'protected' || signal.visibility === 'private';

export const generateSignalTests = (signals: SignalInfo[], instanceVar: string): string[] =>
  signals.filter(isAccessible).flatMap(s => generateSignalTest(s, instanceVar));

const generateSignalTest = (signal: SignalInfo, instanceVar: string): string[] => {
  const tests: string[] = [];

  switch (signal.kind) {
    case 'signal':
      tests.push(generateWritableSignalTest(signal, instanceVar));
      break;
    case 'computed':
      tests.push(generateComputedSignalTest(signal, instanceVar));
      break;
    case 'effect':
      tests.push(generateEffectTest(signal, instanceVar));
      break;
  }

  return tests;
};

const signalAccessor = (signal: { name: string; visibility?: string }, instanceVar: string): string =>
  needsCast(signal) ? `exposed(${instanceVar}).${signal.name}` : `${instanceVar}.${signal.name}`;

const generateWritableSignalTest = (signal: SignalInfo, instanceVar: string): string => {
  const effectiveType = signal.type || inferTypeFromInitialValue(signal.initialValue ?? undefined);
  const dummyValue = getDummyValueForType(effectiveType);
  const accessor = signalAccessor(signal, instanceVar);
  const assertion = isPrimitiveValue(dummyValue)
    ? `expect(${accessor}()).toBe(${dummyValue});`
    : `expect(${accessor}()).toBeDefined();`;
  return `it('should update ${signal.name} signal', () => {
    attempt(() => { ${accessor}.set(${dummyValue}); ${assertion} });
  });`;
};

const generateComputedSignalTest = (signal: SignalInfo, instanceVar: string): string => {
  const accessor = signalAccessor(signal, instanceVar);
  return `it('should read computed ${signal.name}', () => {
    attempt(() => ${accessor}());
  });`;
};

const generateEffectTest = (signal: SignalInfo, instanceVar: string): string => {
  const accessor = signalAccessor(signal, instanceVar);
  return `it('should have effect ${signal.name}', () => {
    expect(${accessor}).toBeDefined();
  });`;
};

export const generateInputSignalTests = (inputs: InputSignalInfo[], fixtureVar: string): string[] => {
  const accessibleInputs = inputs.filter(isAccessible);
  const requiredInputs = accessibleInputs.filter(i => i.required);
  return accessibleInputs.map(input => generateInputSignalTest(input, fixtureVar, requiredInputs));
};

const generateInputSignalTest = (input: InputSignalInfo, fixtureVar: string, requiredInputs: InputSignalInfo[]): string => {
  const dummyValue = getDummyValueForType(input.type);
  const setRequiredLines = requiredInputs
    .filter(ri => ri.name !== input.name)
    .map(ri => `  ${fixtureVar}.componentRef.setInput('${ri.name}', ${getDummyValueForType(ri.type)});`)
    .join('\n');
  const preamble = setRequiredLines ? setRequiredLines + '\n' : '';
  const assertion = isPrimitiveValue(dummyValue)
    ? `expect(${fixtureVar}.componentInstance.${input.name}()).toBe(${dummyValue});`
    : `expect(${fixtureVar}.componentInstance.${input.name}()).toBeDefined();`;
  return `it('should accept input ${input.name}', () => {
    if (!${fixtureVar}) return;
${preamble}    ${fixtureVar}.componentRef.setInput('${input.name}', ${dummyValue});
    attempt(() => ${fixtureVar}.detectChanges());
    ${assertion}
  });`;
};

const isPrimitiveValue = (value: string): boolean =>
  value === 'null' || value === 'undefined' || value === 'true' || value === 'false' ||
  value === "''" || /^-?\d+(\.\d+)?$/.test(value) || value === '0' || value === "''";


export const generateOutputSignalTests = (outputs: OutputSignalInfo[], instanceVar: string): string[] =>
  outputs.filter(isAccessible).map(output => generateOutputSignalTest(output, instanceVar));

const generateOutputSignalTest = (output: OutputSignalInfo, instanceVar: string): string =>
  `it('should have output ${output.name}', () => {
    if (!${instanceVar}) return;
    let emitted = false;
    ${instanceVar}.${output.name}.subscribe(() => { emitted = true; });
    ${instanceVar}.${output.name}.emit(${getDummyValueForType(output.type)});
    expect(emitted).toBe(true);
  });`;

export const generateModelSignalTests = (models: ModelSignalInfo[], fixtureVar: string, instanceVar: string): string[] =>
  models.filter(isAccessible).map(model => generateModelSignalTest(model, fixtureVar, instanceVar));

const generateModelSignalTest = (model: ModelSignalInfo, fixtureVar: string, instanceVar: string): string => {
  const dummyValue = getDummyValueForType(model.type);
  const assertion = isPrimitiveValue(dummyValue)
    ? `expect(${instanceVar}.${model.name}()).toBe(${dummyValue});`
    : `expect(${instanceVar}.${model.name}()).toBeDefined();`;
  return `it('should support model ${model.name}', () => {
    if (!${fixtureVar}) return;
    ${fixtureVar}.componentRef.setInput('${model.name}', ${dummyValue});
    attempt(() => ${fixtureVar}.detectChanges());
    ${assertion}
  });`;
};

const inferTypeFromInitialValue = (initialValue?: string): string | null => {
  if (!initialValue) return null;
  const v = initialValue.trim();
  if (/^-?\d+(\.\d+)?$/.test(v)) return 'number';
  if (v === 'true' || v === 'false') return 'boolean';
  if (v.startsWith("'") || v.startsWith('"') || v.startsWith('`')) return 'string';
  return null;
};
