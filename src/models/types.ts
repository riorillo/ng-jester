import { AngularArtifactType, SignalKind, ViewQueryKind, InjectCallKind } from './angular-types';

// --- Parser output types ---

export interface ImportInfo {
  moduleSpecifier: string;
  namedImports: string[];
  defaultImport: string | null;
  namespaceImport: string | null;
}

export interface ParamInfo {
  name: string;
  type: string | null;
  isOptional: boolean;
  defaultValue: string | null;
}

export interface PropertyInfo {
  name: string;
  type: string | null;
  visibility: Visibility;
  isReadonly: boolean;
  isStatic: boolean;
  initializer: string | null;
}

export type Visibility = 'public' | 'private' | 'protected';

export interface ConstructorParam {
  name: string;
  type: string;
  isOptional: boolean;
  decorators: string[];
}

export interface DecoratorMetadata {
  name: string;
  args: Record<string, unknown>;
}

export interface SignalInfo {
  name: string;
  kind: SignalKind;
  type: string | null;
  initialValue: string | null;
  visibility?: Visibility;
}

export interface InputSignalInfo {
  name: string;
  required: boolean;
  type: string | null;
  defaultValue: string | null;
  visibility?: Visibility;
}

export interface OutputSignalInfo {
  name: string;
  type: string | null;
  visibility?: Visibility;
}

export interface ModelSignalInfo {
  name: string;
  type: string | null;
  required: boolean;
  visibility?: Visibility;
}

export interface ViewQueryInfo {
  name: string;
  kind: ViewQueryKind;
  type: string | null;
}

export interface InjectCallInfo {
  name: string;
  serviceType: string;
  isOptional: boolean;
  kind: InjectCallKind;
  functionName: string;
  args: string | null;
}

export interface BranchInfo {
  type: 'if' | 'else' | 'switch-case' | 'ternary' | 'nullish-coalescing' | 'optional-chaining';
  condition: string;
  line: number;
}

export interface MethodInfo {
  name: string;
  params: ParamInfo[];
  returnType: string | null;
  visibility: Visibility;
  isAsync: boolean;
  isStatic: boolean;
  branches: BranchInfo[];
  body: string;
  isGetter?: boolean;
  usesRunInInjectionContext: boolean;
}

export interface ClassInfo {
  name: string;
  artifactType: AngularArtifactType | null;
  decoratorMetadata: DecoratorMetadata | null;
  constructorParams: ConstructorParam[];
  constructorBody: string;
  injectCalls: InjectCallInfo[];
  methods: MethodInfo[];
  properties: PropertyInfo[];
  signals: SignalInfo[];
  inputSignals: InputSignalInfo[];
  outputSignals: OutputSignalInfo[];
  modelSignals: ModelSignalInfo[];
  viewQueries: ViewQueryInfo[];
  lifecycleHooks: string[];
  usesRunInInjectionContext: boolean;
  parentClassName?: string;
}

export interface ParsedFile {
  filePath: string;
  imports: ImportInfo[];
  classes: ClassInfo[];
  signalStores: SignalStoreInfo[];
}

// --- Signal Store types ---

export interface SignalStoreFeature {
  kind: 'withState' | 'withComputed' | 'withMethods' | 'withHooks' | 'withProps';
  stateProperties: { name: string; type: string | null; initialValue: string | null }[];
  computedProperties: { name: string }[];
  methods: { name: string; params: ParamInfo[] }[];
}

export interface SignalStoreInfo {
  name: string;
  features: SignalStoreFeature[];
  injectDependencies: string[];
}

// --- Generator output types ---

export interface GeneratedTest {
  filePath: string;
  content: string;
  sourceFilePath: string;
}

// --- CLI types ---

export interface ProjectConfig {
  usesLocalize: boolean;
  usesTanStack: boolean;
  usesPrimeNG: boolean;
  usesOidc: boolean;
  usesZoneJs: boolean;
}

export interface CliOptions {
  projectPath: string;
  dryRun: boolean;
  verbose: boolean;
  typeFilter: AngularArtifactType[] | null;
  overwrite: boolean;
}
