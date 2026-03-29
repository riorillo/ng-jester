// References the createMock() function from the shared spec-test-helpers.ts utility file.
// The actual implementation is generated into the target project by spec-helpers-content.ts.
const RICH_PROXY = 'createMock()';

const PRIMITIVE_DEFAULTS: Record<string, string> = {
  string: "'test'",
  number: '1',
  boolean: 'true',
  void: 'undefined',
  undefined: 'undefined',
  null: 'null',
  any: RICH_PROXY,
  unknown: '{}',
  never: 'undefined as never',
  object: RICH_PROXY,
  bigint: 'BigInt(1)',
  symbol: "Symbol('test')",
};

const FALSY_DEFAULTS: Record<string, string> = {
  string: "''",
  number: '0',
  boolean: 'false',
  any: 'typed(null)',
  unknown: 'typed(null)',
  object: 'typed(null)',
};

export const getFalsyDummyValueForType = (type: string | null): string => {
  if (!type) return 'typed(null)';
  const normalized = type.trim();
  if (FALSY_DEFAULTS[normalized]) return FALSY_DEFAULTS[normalized];
  if (isArrayType(normalized)) return '[]';
  if (normalized.includes('|') && normalized.includes('null')) return 'typed(null)';
  return 'typed(null)';
};

export const getDummyValueForType = (type: string | null): string => {
  if (!type) return RICH_PROXY;

  const normalized = type.trim();

  if (PRIMITIVE_DEFAULTS[normalized]) return PRIMITIVE_DEFAULTS[normalized];

  if (isObservableType(normalized)) return `of(${getDummyValueForInnerType(normalized)})`;
  if (isPromiseType(normalized)) return `Promise.resolve(${getDummyValueForInnerType(normalized)})`;
  if (isSignalType(normalized)) return `signal(${getDummyValueForInnerType(normalized)})`;
  if (isArrayType(normalized)) return `[${RICH_PROXY}, ${RICH_PROXY}]`;
  if (isMapType(normalized)) return 'new Map()';
  if (isSetType(normalized)) return 'new Set()';
  if (normalized === 'Date') return 'new Date()';
  if (normalized === 'RegExp') return '/test/';
  if (normalized === 'FormGroup' || normalized === 'FormControl') return `new ${normalized}({})`;
  if (isEventType(normalized)) return getEventMock(normalized);
  if (normalized.startsWith('{')) return generateObjectLiteralDummy(normalized);
  if (normalized.includes('|')) return getDummyValueForType(normalized.split('|')[0].trim());

  return RICH_PROXY;
};

export const isObservableType = (type: string): boolean =>
  /^Observable</.test(type) || type === 'Observable';

export const isPromiseType = (type: string): boolean =>
  /^Promise</.test(type) || type === 'Promise';

export const isSignalType = (type: string): boolean =>
  /^(WritableSignal|Signal|InputSignal|ModelSignal)</.test(type);

export const isArrayType = (type: string): boolean =>
  type.endsWith('[]') || /^Array</.test(type);

export const isMapType = (type: string): boolean =>
  /^Map</.test(type);

export const isSetType = (type: string): boolean =>
  /^Set</.test(type);

export const isAngularType = (type: string): boolean =>
  ['ElementRef', 'TemplateRef', 'ViewContainerRef', 'ChangeDetectorRef', 'Renderer2', 'NgZone', 'Injector', 'ApplicationRef', 'EnvironmentInjector', 'DestroyRef'].includes(type);

export const isRouterType = (type: string): boolean =>
  ['Router', 'ActivatedRoute', 'ActivatedRouteSnapshot', 'RouterStateSnapshot'].includes(type);

export const isHttpType = (type: string): boolean =>
  ['HttpClient', 'HttpHandler', 'HttpRequest', 'HttpHeaders', 'HttpParams'].includes(type);

const EVENT_TYPES = ['Event', 'MouseEvent', 'KeyboardEvent', 'DragEvent', 'InputEvent', 'FocusEvent', 'TouchEvent', 'PointerEvent', 'WheelEvent', 'ClipboardEvent'];

export const isEventType = (type: string): boolean =>
  EVENT_TYPES.includes(type);

const getEventMock = (type: string): string => {
  const base = '{ preventDefault: jest.fn(), stopPropagation: jest.fn(), target: {} }';
  if (type === 'DragEvent') return `typed({ preventDefault: jest.fn(), stopPropagation: jest.fn(), target: {}, dataTransfer: { files: [] } })`;
  if (type === 'KeyboardEvent') return `typed({ preventDefault: jest.fn(), stopPropagation: jest.fn(), key: '', code: '' })`;
  if (type === 'InputEvent') return `typed({ preventDefault: jest.fn(), stopPropagation: jest.fn(), target: { value: '' } })`;
  return `typed(${base})`;
};

const getDummyValueForInnerType = (type: string): string => {
  const match = type.match(/<(.+)>$/);
  if (!match) return '{}';
  return getDummyValueForType(match[1]);
};

// Parse object literal types like { startDate: Date; endDate: Date } and generate matching objects
const generateObjectLiteralDummy = (type: string): string => {
  const inner = type.slice(1, -1).trim();
  if (!inner) return '{}';

  const props: string[] = [];
  // Split by ; or , handling nested braces
  let depth = 0;
  let current = '';
  for (const ch of inner) {
    if (ch === '{' || ch === '<' || ch === '(') depth++;
    else if (ch === '}' || ch === '>' || ch === ')') depth--;
    else if ((ch === ';' || ch === ',') && depth === 0) {
      if (current.trim()) props.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) props.push(current.trim());

  const entries = props
    .map(prop => {
      const colonIdx = prop.indexOf(':');
      if (colonIdx === -1) return null;
      const name = prop.slice(0, colonIdx).trim().replace(/\?$/, '');
      const propType = prop.slice(colonIdx + 1).trim();
      return `${name}: ${getDummyValueForType(propType)}`;
    })
    .filter(Boolean);

  return entries.length > 0 ? `{ ${entries.join(', ')} }` : '{}';
};

export const getAngularTypeMock = (type: string): string => {
  const mocks: Record<string, string> = {
    ElementRef: 'typed({ nativeElement: {} })',
    TemplateRef: 'typed({ elementRef: { nativeElement: {} } })',
    ViewContainerRef: 'typed({ createEmbeddedView: jest.fn(), clear: jest.fn() })',
    ChangeDetectorRef: 'typed({ detectChanges: jest.fn(), markForCheck: jest.fn() })',
    Renderer2: 'typed({ createElement: jest.fn(), appendChild: jest.fn(), setAttribute: jest.fn(), listen: jest.fn() })',
    NgZone: 'typed({ run: jest.fn((fn: Function) => fn()), runOutsideAngular: jest.fn((fn: Function) => fn()) })',
    Injector: 'typed({ get: jest.fn() })',
    ApplicationRef: 'typed({ tick: jest.fn() })',
    EnvironmentInjector: 'typed({ get: jest.fn(), runInContext: jest.fn((fn: Function) => fn()) })',
    DestroyRef: 'typed({ onDestroy: jest.fn() })',
    ActivatedRoute: "typed({ params: of({ id: '1' }), queryParams: of({}), paramMap: of({ get: () => '1', has: () => true, getAll: () => ['1'] }), queryParamMap: of({ get: () => null, has: () => false, getAll: () => [] }), snapshot: { params: { id: '1' }, queryParams: {}, data: {}, paramMap: { get: jest.fn().mockReturnValue('1'), has: jest.fn().mockReturnValue(true), getAll: jest.fn().mockReturnValue(['1']) } } })",
    Router: "typed({ navigate: jest.fn().mockResolvedValue(true), navigateByUrl: jest.fn().mockResolvedValue(true), events: of(), url: '/test/edit/1', createUrlTree: jest.fn() })",
    HttpClient: `typed({ get: jest.fn().mockReturnValue(of({content:[{id:'test',name:'test',label:'test',value:1}],items:[{id:'test'}],results:[{id:'test'}],totalElements:1,number:0,size:10,data:[{id:'test'}],id:'test',name:'test',value:1})), post: jest.fn().mockReturnValue(of({id:'test',name:'test',value:1})), put: jest.fn().mockReturnValue(of({id:'test',name:'test',value:1})), delete: jest.fn().mockReturnValue(of({id:'test',name:'test',value:1})), patch: jest.fn().mockReturnValue(of({id:'test',name:'test',value:1})) })`,
  };
  return mocks[type] || '';
};

export const needsRxjsImport = (type: string | null): boolean =>
  type !== null && (isObservableType(type) || type === 'Subject' || type === 'BehaviorSubject' || type === 'ReplaySubject');

export const extractGenericTypeParam = (type: string): string | null => {
  const match = type.match(/<(.+)>$/);
  return match ? match[1] : null;
};
