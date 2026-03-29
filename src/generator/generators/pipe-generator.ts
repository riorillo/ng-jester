import { ClassInfo, GeneratedTest, ImportInfo, ProjectConfig } from '../../models/types';
import { analyzeDependencies } from '../../analyzer/dependency-analyzer';
import { generateMocks, generateProviders, generateMockDeclarations, enrichMockWithMethods, generateExtraProviders } from '../helpers/mock-generator';
import { generateTestImports, renderImports, deduplicateImportLines } from '../helpers/import-generator';
import { generateMethodCall } from '../helpers/dummy-value-generator';
import { assembleTestFile, buildPipeBeforeEach, buildCreationTest, buildSimpleTest, buildServiceBeforeEach } from '../templates/test-template';
import { toSpecFileName } from '../../utils/string-utils';
import { getDummyValueForType } from '../../utils/type-utils';

export const generatePipeTest = (
  classInfo: ClassInfo,
  sourceFilePath: string,
  sourceImports: ImportInfo[],
  config: ProjectConfig = { usesLocalize: false, usesTanStack: false, usesPrimeNG: false, usesOidc: false, usesZoneJs: false },
): GeneratedTest => {
  const hasDI = classInfo.constructorParams.length > 0 || classInfo.injectCalls.length > 0;

  if (hasDI) {
    // Pipe with DI — use TestBed like a service
    const dependencies = analyzeDependencies(classInfo.constructorParams, classInfo.injectCalls);
    let mocks = generateMocks(dependencies);
    mocks = mocks.map((m, i) => enrichMockWithMethods(m, classInfo, dependencies[i].name));
    const extra = generateExtraProviders(config, dependencies.map(d => d.type));

    let importLines = renderImports(generateTestImports(classInfo, `./${getBaseName(sourceFilePath)}`, 'service', dependencies, sourceImports, config.usesLocalize));
    if (extra.imports) importLines += '\n' + extra.imports;
    if (config.usesZoneJs) importLines = "import 'zone.js';\n" + importLines;
    importLines = deduplicateImportLines(importLines);

    const mockDecls = generateMockDeclarations(mocks);
    const providers = [classInfo.name, generateProviders(mocks)].filter(Boolean).join(',\n        ');
    const extraProviders = extra.providers ? `,\n        ${extra.providers}` : '';
    const beforeEach = buildServiceBeforeEach(classInfo.name, providers + extraProviders);

    const testCases: string[] = [];
    testCases.push(buildCreationTest('service'));

    const transformMethod = classInfo.methods.find(m => m.name === 'transform');
    if (transformMethod) {
      const args = transformMethod.params.map(p => getDummyValueForType(p.type)).join(', ');
      testCases.push(buildSimpleTest(
        'should transform value',
        `attempt(() => exposed(service).transform(${args}));`,
      ));
    }

    return {
      filePath: toSpecFileName(sourceFilePath),
      content: assembleTestFile({
        imports: importLines,
        jestMocks: [],
        describeBlock: classInfo.name,
        beforeEachBlock: `${mockDecls}\n\n${beforeEach}`,
        testCases,
        afterContent: '',
      }),
      sourceFilePath,
    };
  }
  const imports = generateTestImports(classInfo, `./${getBaseName(sourceFilePath)}`, 'pipe', [], sourceImports);

  const beforeEach = buildPipeBeforeEach(classInfo.name);

  const testCases: string[] = [];
  testCases.push(buildCreationTest('pipe'));

  const transformMethod = classInfo.methods.find(m => m.name === 'transform');
  if (transformMethod) {
    const args = transformMethod.params.map(p => getDummyValueForType(p.type)).join(', ');
    testCases.push(buildSimpleTest(
      'should transform value',
      `attempt(() => pipe.transform(${args}));`,
    ));

    testCases.push(buildSimpleTest(
      'should handle null input',
      `attempt(() => pipe.transform(typed(null)));`,
    ));
  }

  for (const method of classInfo.methods) {
    if (method.name !== 'transform' && method.visibility === 'public') {
      testCases.push(buildSimpleTest(
        `should call ${method.name}`,
        `${generateMethodCall('pipe', method)};`,
      ));
    }
  }

  return {
    filePath: toSpecFileName(sourceFilePath),
    content: assembleTestFile({
      imports: renderImports(imports),
      jestMocks: [],
      describeBlock: classInfo.name,
      beforeEachBlock: beforeEach,
      testCases,
      afterContent: '',
    }),
    sourceFilePath,
  };
};

const getBaseName = (filePath: string): string => {
  const parts = filePath.split('/');
  return parts[parts.length - 1].replace(/\.ts$/, '');
};
