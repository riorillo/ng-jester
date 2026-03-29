# ng-jester

![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)
![Node](https://img.shields.io/badge/Node-%3E%3D18-green?logo=node.js)
![Angular](https://img.shields.io/badge/Angular-14%2B-red?logo=angular)
![Jest](https://img.shields.io/badge/Jest-29-orange?logo=jest)

A CLI tool that statically analyzes an Angular project and generates Jest test boilerplate — `TestBed` configuration, dependency mocks, providers, signal handling — for every detected artifact.

The output is structured, working `.spec.ts` files that serve as the foundation for writing business logic assertions.

## Table of Contents

- [Installation and usage](#installation-and-usage)
- [CLI options](#cli-options)
- [What gets generated](#what-gets-generated)
- [Processing pipeline](#processing-pipeline)
- [Supported artifacts](#supported-artifacts)
- [Recognized Angular features](#recognized-angular-features)
- [Generated boilerplate structure](#generated-boilerplate-structure)
- [Shared utilities: spec-test-helpers](#shared-utilities-spec-test-helpers)
- [Automatic dependency detection](#automatic-dependency-detection)
- [Internal architecture](#internal-architecture)
- [Extending the tool](#extending-the-tool)
- [Development](#development)

---

## Installation and usage

```bash
npm install
npm run build

node dist/cli/index.js <angular-project-path>
```

During development, without compilation:

```bash
npx ts-node src/cli/index.ts <angular-project-path>
```

The `.spec.ts` files are generated in the same directory as their corresponding source files.

## CLI options

```
ng-test-gen <project-path> [options]
```

| Flag | Description |
|---|---|
| `-d, --dry-run` | Preview without writing to disk |
| `-v, --verbose` | Detailed output listing found files and generated paths |
| `-t, --type <types...>` | Filter by artifact type: `component`, `service`, `pipe`, `guard`, `directive`, `interceptor`, `signal-store` |
| `--no-overwrite` | Preserve already existing `.spec.ts` files |

```bash
# Generate only for components and services, without overwriting
ng-test-gen ./src --type component service --no-overwrite

# Full preview
ng-test-gen ./my-angular-app --dry-run --verbose
```

---

## What gets generated

For each source file, the tool produces a `.spec.ts` containing:

- **`TestBed` configuration** with all required providers
- **Automatic mocks** for every injected dependency, both via constructor and via `inject()`
- **`it()` blocks** for every public method, lifecycle hook, and signal
- **Branch tests** — one case per detected branch: `if/else`, `switch/case`, ternaries, optional chaining, nullish coalescing
- **Artifact-specific setup** for each Angular artifact type (fixtures for components, inject for services, host component for directives, etc.)

---

## Processing pipeline

The tool processes each source file through a linear five-stage pipeline:

```
┌──────────┐    ┌────────┐    ┌──────────┐    ┌───────────┐    ┌────────┐
│ Scanner  │───▶│ Parser │───▶│ Analyzer │───▶│ Generator │───▶│ Writer │
│          │    │        │    │          │    │           │    │        │
│ Finds    │    │ AST →  │    │ Classif. │    │ Strategy  │    │ Writes │
│ files    │    │ models │    │ + branch │    │ pattern   │    │ .spec  │
└──────────┘    └────────┘    └──────────┘    └───────────┘    └────────┘
     │               │              │               │               │
   string[]      ParsedFile    ClassInfo +      GeneratedTest    .spec.ts
                               SignalStoreInfo                   on disk
```

1. **Scanner** — recursively finds `.ts` files in the project, excluding `node_modules`, test files, modules, configurations, and environments
2. **Parser** — using the TypeScript compiler API, extracts classes, decorators, constructors, methods, signals, imports, and `inject()` calls from the AST
3. **Analyzer** — classifies the Angular artifact type, analyzes code branches, extracts DI dependencies, identifies TanStack Query and NGRX Signal Store patterns
4. **Generator** — based on the artifact type, delegates to the specific generator via strategy pattern
5. **Writer** — applies Prettier formatting and writes `.spec.ts` files alongside the source files

---

## Supported artifacts

Each Angular artifact type has a dedicated generator with its own setup strategy:

| Artifact | Detection | Generated boilerplate |
|---|---|---|
| **Component** | `@Component` | `TestBed` + `ComponentFixture`, `NO_ERRORS_SCHEMA`, `setInput()` for signal inputs |
| **Service** | `@Injectable` | `TestBed.inject()`, Observable subscription, mock return values |
| **Pipe** | `@Pipe` | Direct instantiation for pure pipes; `TestBed` when dependencies are present |
| **Guard** | `@Injectable` + `canActivate`/`canDeactivate`/`canMatch`/`canLoad` methods | `TestBed` with `ActivatedRouteSnapshot` and `RouterStateSnapshot` mocks |
| **Directive** | `@Directive` | `TestBed` with a wrapper host component |
| **Interceptor** | `@Injectable` + `intercept()` method | `TestBed` with `HttpRequest` and `HttpHandler` mocks |
| **Signal Store** | `signalStore(...)` call | `inject()` in factory, tests on state, computed, and methods |
| **Utility** | Exported functions and constants | Direct function calls, existence assertions for constants |

## Recognized Angular features

- **Standalone components** (Angular 14+)
- **Signals**: `signal()`, `computed()`, `effect()`
- **Signal-based inputs/outputs**: `input()`, `input.required()`, `output()`, `model()`
- **View queries**: `viewChild()`, `viewChildren()`, `contentChild()`, `contentChildren()`
- **Dependency injection**: `inject()` function and constructor injection
- **NGRX Signal Store**: `withState()`, `withComputed()`, `withMethods()`
- **TanStack Query**: `injectQuery()`, `injectMutation()`

---

## Generated boilerplate structure

Given the following service:

```typescript
@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>('/api/users');
  }

  getUserById(id: number): Observable<User> {
    if (id <= 0) throw new Error('Invalid id');
    return this.http.get<User>(`/api/users/${id}`);
  }
}
```

The boilerplate generated in `user.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { UserService } from './user.service';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { attempt, exposed, typed, createMock } from '../spec-test-helpers';

describe('UserService', () => {
  const mockHttp = typed({
    get: jest.fn().mockReturnValue(of(createMock())),
    post: jest.fn().mockReturnValue(of(createMock())),
  });

  let service: UserService;

  beforeEach(() => {
    jest.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        UserService,
        { provide: HttpClient, useValue: mockHttp },
      ],
    });
    attempt(() => { service = TestBed.inject(UserService); });
  });

  afterEach(() => { jest.useRealTimers(); });

  it('should create', () => {
    attempt(() => expect(service).toBeTruthy());
  });

  it('should call getUsers', () => {
    attempt(() => {
      service.getUsers().subscribe({ next: () => {}, error: () => {} });
      jest.runAllTimers();
    });
  });

  it('should call getUserById', () => {
    attempt(() => {
      service.getUserById(1).subscribe({ next: () => {}, error: () => {} });
    });
  });

  it('should handle branch: id <= 0', () => {
    attempt(() => service.getUserById(0).subscribe({ next: () => {}, error: () => {} }));
  });
});
```

The `TestBed`, mocks, and test case structure are ready. Business logic assertions are added on top of this foundation.

---

## Shared utilities: spec-test-helpers

The tool generates a `spec-test-helpers.ts` file in the root of the target project. It contains utilities shared by all generated test files:

| Function | Description |
|---|---|
| `createMock()` | Returns a deep proxy: any property read or method invoked returns a valid value. Compatible with templates, conditionals, iterations, and coercions |
| `createEnrichedMock(overrides)` | Mock with partial overrides: specified properties use the provided values, the rest are delegated to the proxy |
| `createServiceMock()` | Mock factory for injected services, with handling for Symbols, iterables, and signals |
| `attempt(fn)` | Executes a function suppressing `console.error`/`console.warn` and catching exceptions |
| `asyncAttempt(fn)` | Async variant of `attempt()` |
| `exposed(instance)` | Returns the instance with an unconstrained type, to access private or protected members without compilation errors |
| `typed<T>(value)` | Explicit typed cast, a structured alternative to `as any` |

The **deep proxy** mechanism allows tests to work without manually configuring every property of dependencies. Only the properties relevant to the specific test case need to be overridden.

---

## Automatic dependency detection

Before generation, the tool analyzes the `package.json` of the target project (searching up to 5 levels from the specified directory) and adapts the boilerplate based on detected dependencies:

| Dependency | Effect on generation |
|---|---|
| `@angular/localize` | Support for `$localize` in test templates |
| `@tanstack/angular-query-experimental` | Specific mocks for `injectQuery()` and `injectMutation()` |
| `primeng` | Mock providers for PrimeNG components |
| `angular-auth-oidc-client` | Mocks for OIDC authentication services |
| `zone.js` | Timer management and effect flushing. If the `setup-jest.ts` file indicates a zoneless configuration, the tool adapts accordingly |

---

## Internal architecture

### Scanner (`src/scanner/`)

`file-scanner.ts` — recursively traverses the project and returns the paths of relevant `.ts` files, applying filters on directories (`node_modules`, `dist`, `.angular`, `e2e`, `assets`) and files (`*.spec.ts`, `*.d.ts`, `*.module.ts`, `environment*.ts`, `main.ts`, configuration files).

### Parser (`src/parser/`)

Six modules operating on the TypeScript AST to extract structured information:

| Module | Responsibility |
|---|---|
| `ts-parser.ts` | Low-level utilities: `parseFile()`, `findNodes()`, `findClassDeclarations()` |
| `import-parser.ts` | Import extraction → `ImportInfo[]` |
| `class-parser.ts` | Class extraction → `ClassInfo[]` with constructor, methods, properties, lifecycle hooks |
| `decorator-parser.ts` | Angular decorator parsing → `DecoratorMetadata` |
| `signal-parser.ts` | Detection of signals, input/output/model signals, view queries, `inject()` calls |
| `export-parser.ts` | Extraction of exported functions and constants for utility test generation |

### Analyzer (`src/analyzer/`)

| Module | Responsibility |
|---|---|
| `artifact-classifier.ts` | Artifact classification. Maps decorator → base type; for `@Injectable`, refines via heuristics: presence of `canActivate` → guard, `intercept` → interceptor |
| `dependency-analyzer.ts` | DI dependency extraction from constructor and `inject()` calls |
| `branch-analyzer.ts` | Branch detection: `if/else`, `switch/case`, ternaries, optional chaining, nullish coalescing |
| `method-analyzer.ts` | Method analysis: async, return type, parameters, call expressions |
| `inject-function-analyzer.ts` | Detection of TanStack Query, custom injects, `runInInjectionContext()` |

### Generator (`src/generator/`)

Organized on three levels:

- **`test-generator.ts`** — orchestrator: coordinates parsing, `ClassInfo` model enrichment, dispatch to the specific generator, and fallback to the utility generator
- **`generators/`** — 8 specialized generators, one per artifact type. All share the same signature: `(classInfo, filePath, imports, config) → GeneratedTest`
- **`helpers/`** — 9 shared support modules: mock generation, import management, signal tests, branch tests, dummy values, injection context, TanStack mocks, spec helpers
- **`templates/test-template.ts`** — final test file structure assembly: imports, `describe`, `beforeEach`, `it()` blocks, `afterEach`

### Writer (`src/writer/`)

`file-writer.ts` — writes `.spec.ts` files in the same directory as the corresponding source file. Handles directory creation, the `--no-overwrite` flag, and `--dry-run` mode. Produces a summary with counts of written, skipped, and errored files.

### Models (`src/models/`)

Main types flowing through the pipeline:

| Type | Description |
|---|---|
| `ClassInfo` | Complete class metadata: decorators, constructor, methods, properties, signals, inject calls |
| `ParsedFile` | Parser output: path, imports, classes, signal stores |
| `MethodInfo` | Method signature with detected branches |
| `BranchInfo` | Single branch: type, condition, line number |
| `SignalStoreInfo` | NGRX Signal Store: name, features, dependencies |
| `GeneratedTest` | Generator output: destination path and test content |
| `ProjectConfig` | Detected configuration of the target project |

---

## Extending the tool

### Adding a new artifact type

Adding a new generator requires four changes, following the pattern of existing artifacts.

**1.** Define the type in `src/models/angular-types.ts`:

```typescript
export type AngularArtifactType =
  'component' | 'service' | 'pipe' | 'guard' | 'directive'
  | 'interceptor' | 'signal-store' | 'resolver';
```

**2.** Add the classification rule in `src/analyzer/artifact-classifier.ts`:

```typescript
const refineServiceType = (classInfo: ClassInfo): AngularArtifactType => {
  const methodNames = classInfo.methods.map(m => m.name);
  if (methodNames.includes('resolve')) return 'resolver';
  // ... existing rules
};
```

**3.** Implement the generator in `src/generator/generators/resolver-generator.ts`:

```typescript
export const generateResolverTest = (
  classInfo: ClassInfo,
  sourceFilePath: string,
  sourceImports: ImportInfo[],
  config: ProjectConfig,
): GeneratedTest => {
  const dependencies = analyzeDependencies(classInfo.constructorParams, classInfo.injectCalls);
  const mocks = generateMocks(dependencies);
  // ... build test cases using template functions

  return {
    filePath: toSpecFileName(sourceFilePath),
    content: assembleTestFile({
      imports, jestMocks: [], describeBlock: classInfo.name,
      beforeEachBlock, testCases, afterContent: '',
    }),
    sourceFilePath,
  };
};
```

**4.** Register the generator in the dispatcher in `src/generator/test-generator.ts`:

```typescript
case 'resolver':
  return generateResolverTest(classInfo, filePath, imports, config);
```

---

## Development

```bash
npm run build                                      # TypeScript compilation → dist/
npm test                                           # Run all tests
npm test -- --testPathPattern='parser'             # Test a single module
npm test -- --testNamePattern='should extract'     # Filter tests by name
npm run test:watch                                 # Watch mode
npm run lint                                       # Type-check without emitting (tsc --noEmit)
```

Tests live in `tests/`, mirroring the `src/` structure. Fixtures in `tests/fixtures/` are sample Angular files used as input for generator tests.
