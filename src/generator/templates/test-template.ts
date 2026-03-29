import { joinLines } from '../../utils/string-utils';
import { getDummyValueForType } from '../../utils/type-utils';

const getDummyForBeforeEach = (type?: string): string =>
  getDummyValueForType(type ?? null);

export interface TestFileStructure {
  imports: string;
  jestMocks: string[];
  describeBlock: string;
  beforeEachBlock: string;
  testCases: string[];
  afterContent: string;
}

export const assembleTestFile = (structure: TestFileStructure): string => {
  const parts: string[] = [];

  // Imports
  parts.push(structure.imports);
  parts.push('');

  // Jest mocks (must be at top level, after imports)
  if (structure.jestMocks.length > 0) {
    parts.push(...structure.jestMocks);
    parts.push('');
  }

  // Main describe block
  const describeBody = buildDescribeBody(structure);
  parts.push(`describe('${escapeQuote(structure.describeBlock)}', () => {`);
  parts.push(indentBlock(describeBody, 2));
  parts.push('});');
  parts.push('');

  return joinLines(parts, '\n');
};

const buildDescribeBody = (structure: TestFileStructure): string => {
  const parts: string[] = [];

  // Variable declarations (extracted from beforeEach if needed)
  parts.push(structure.beforeEachBlock);
  parts.push('');

  // Test cases
  for (const testCase of structure.testCases) {
    parts.push(testCase);
    parts.push('');
  }

  // Additional content
  if (structure.afterContent) {
    parts.push(structure.afterContent);
  }

  return joinLines(parts, '\n');
};

const indentBlock = (content: string, spaces: number): string =>
  content
    .split('\n')
    .map(line => (line.trim() === '' ? '' : ' '.repeat(spaces) + line))
    .join('\n');

const escapeQuote = (str: string): string =>
  str.replace(/'/g, "\\'");

export const buildComponentBeforeEach = (
  className: string,
  providers: string,
  hasInputSignals: boolean,
  requiredInputs: { name: string; type?: string }[] = [],
): string => {
  const providerBlock = providers
    ? `\n        ${providers},`
    : '';

  const setRequiredInputs = requiredInputs
    .map(ri => `  fixture.componentRef.setInput('${ri.name}', ${getDummyForBeforeEach(ri.type)});`)
    .join('\n');
  const setInputsBlock = setRequiredInputs ? '\n' + setRequiredInputs : '';

  return `let component: ${className};
let fixture: ComponentFixture<${className}>;

beforeEach(async () => {
  jest.useFakeTimers();
  await TestBed.configureTestingModule({
    imports: [${className}],
    providers: [${providerBlock}
    ],
    schemas: [NO_ERRORS_SCHEMA],
  })
  .overrideComponent(${className}, {
    set: { imports: [ReactiveFormsModule, FormsModule], schemas: [NO_ERRORS_SCHEMA] },
  })
  .compileComponents();

  attempt(() => {
    fixture = TestBed.createComponent(${className});
    component = fixture.componentInstance;${setInputsBlock}
    fixture.detectChanges();
    attempt(() => TestBed.flushEffects());
    fixture.detectChanges();
  });
});

afterEach(() => {
  attempt(() => fixture?.destroy());
  jest.useRealTimers();
});`;
};

export const buildServiceBeforeEach = (
  className: string,
  providers: string,
): string => {
  const providerBlock = providers
    ? `\n      providers: [\n        ${className},\n        ${providers}\n      ],`
    : `\n      providers: [${className}],`;

  return `let service: ${className};

beforeEach(() => {
  jest.useFakeTimers();
  TestBed.configureTestingModule({${providerBlock}
  });

  attempt(() => { service = TestBed.inject(${className}); });
});

afterEach(() => {
  jest.useRealTimers();
});`;
};

export const buildPipeBeforeEach = (className: string): string =>
  `let pipe: ${className};

beforeEach(() => {
  pipe = new ${className}();
});`;

export const buildGuardBeforeEach = (
  className: string,
  providers: string,
): string => {
  const providerBlock = providers
    ? `\n      providers: [\n        ${className},\n        ${providers}\n      ],`
    : `\n      providers: [${className}],`;

  return `let guard: ${className};

beforeEach(() => {
  TestBed.configureTestingModule({${providerBlock}
  });

  attempt(() => { guard = TestBed.inject(${className}); });
});`;
};

export const buildDirectiveBeforeEach = (
  className: string,
  providers: string,
  selector: string,
): string => {
  const providerBlock = providers
    ? `\n      providers: [\n        ${providers}\n      ],`
    : '';

  return `let fixture: ComponentFixture<TestHostComponent>;

@Component({
  standalone: true,
  imports: [${className}],
  template: '<div ${selector || 'appTest'}></div>',
})
class TestHostComponent {}

beforeEach(async () => {
  await TestBed.configureTestingModule({
    imports: [TestHostComponent, ${className}],${providerBlock}
  }).compileComponents();

  attempt(() => {
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    attempt(() => TestBed.flushEffects());
    fixture.detectChanges();
  });
});`;
};

export const buildInterceptorBeforeEach = (
  className: string,
  providers: string,
): string => {
  const providerBlock = providers
    ? `\n        ${providers}`
    : '';

  return `let interceptor: ${className};

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      ${className},${providerBlock}
    ],
  });

  attempt(() => { interceptor = TestBed.inject(${className}); });
});`;
};

export const buildSignalStoreBeforeEach = (storeName: string, providers?: string): string => {
  const providerBlock = providers
    ? `[\n        ${storeName},\n        ${providers}\n      ]`
    : `[${storeName}]`;
  return `let store: InstanceType<typeof ${storeName}>;

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: ${providerBlock},
  });

  attempt(() => { store = TestBed.inject(${storeName}); });
  attempt(() => TestBed.flushEffects());
});`;
};

export const buildSimpleTest = (description: string, body: string): string =>
  `it('${escapeQuote(description)}', () => {\n  ${body}\n});`;

export const buildAsyncTest = (description: string, body: string): string =>
  `it('${escapeQuote(description)}', async () => {\n  ${body}\n});`;

export const buildCreationTest = (instanceVar: string): string =>
  buildSimpleTest('should create', `attempt(() => expect(${instanceVar}).toBeTruthy());`);
