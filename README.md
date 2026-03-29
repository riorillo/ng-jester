# ng-jester

![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)
![Node](https://img.shields.io/badge/Node-%3E%3D18-green?logo=node.js)
![Angular](https://img.shields.io/badge/Angular-14%2B-red?logo=angular)
![Jest](https://img.shields.io/badge/Jest-29-orange?logo=jest)

Tool CLI che analizza staticamente un progetto Angular e genera la boilerplate dei test Jest — configurazione `TestBed`, mock delle dipendenze, provider, gestione dei signal — per ogni artefatto rilevato.

L'output sono file `.spec.ts` strutturati e funzionanti, che costituiscono la base su cui sviluppare le asserzioni di logica di business.

### Risultati su un progetto reale (~6200 righe, Angular 19)

| | |
|---|---|
| File sorgente analizzati | ~193 |
| File `.spec.ts` generati | ~193 |
| Test case generati | ~2100 |
| Tempo di generazione | < 5 secondi |

---

## Indice

- [Installazione e utilizzo](#installazione-e-utilizzo)
- [Opzioni CLI](#opzioni-cli)
- [Cosa viene generato](#cosa-viene-generato)
- [Pipeline di elaborazione](#pipeline-di-elaborazione)
- [Artefatti supportati](#artefatti-supportati)
- [Feature Angular riconosciute](#feature-angular-riconosciute)
- [Struttura della boilerplate generata](#struttura-della-boilerplate-generata)
- [Utility condivise: spec-test-helpers](#utility-condivise-spec-test-helpers)
- [Rilevamento automatico delle dipendenze](#rilevamento-automatico-delle-dipendenze)
- [Architettura interna](#architettura-interna)
- [Estensione del tool](#estensione-del-tool)
- [Sviluppo](#sviluppo)

---

## Installazione e utilizzo

```bash
npm install
npm run build

node dist/cli/index.js <percorso-progetto-angular>
```

In sviluppo, senza compilazione:

```bash
npx ts-node src/cli/index.ts <percorso-progetto-angular>
```

I file `.spec.ts` vengono generati nella stessa directory dei rispettivi sorgenti.

## Opzioni CLI

```
ng-test-gen <project-path> [opzioni]
```

| Flag | Descrizione |
|---|---|
| `-d, --dry-run` | Anteprima senza scrittura su disco |
| `-v, --verbose` | Output dettagliato con elenco dei file trovati e dei percorsi generati |
| `-t, --type <tipi...>` | Filtro per tipo di artefatto: `component`, `service`, `pipe`, `guard`, `directive`, `interceptor`, `signal-store` |
| `--no-overwrite` | Preserva i file `.spec.ts` già esistenti |

```bash
# Generazione limitata a componenti e servizi, senza sovrascrittura
ng-test-gen ./src --type component service --no-overwrite

# Anteprima completa
ng-test-gen ./my-angular-app --dry-run --verbose
```

---

## Cosa viene generato

Per ogni file sorgente, il tool produce un `.spec.ts` contenente:

- **Configurazione `TestBed`** completa con tutti i provider necessari
- **Mock automatici** per ogni dipendenza iniettata, sia tramite costruttore che tramite `inject()`
- **Blocchi `it()`** per ogni metodo pubblico, lifecycle hook e segnale
- **Test sui branch** — un caso per ogni ramo rilevato: `if/else`, `switch/case`, ternari, optional chaining, nullish coalescing
- **Setup specifico** per il tipo di artefatto Angular (fixture per componenti, inject per servizi, host component per direttive, ecc.)

---

## Pipeline di elaborazione

Il tool processa ogni file sorgente attraverso una pipeline lineare a cinque stadi:

```
┌──────────┐    ┌────────┐    ┌──────────┐    ┌───────────┐    ┌────────┐
│ Scanner  │───▶│ Parser │───▶│ Analyzer │───▶│ Generator │───▶│ Writer │
│          │    │        │    │          │    │           │    │        │
│ Individua│    │ AST →  │    │ Classif. │    │ Strategy  │    │ Scrive │
│ i file   │    │ modelli│    │ + branch │    │ pattern   │    │ .spec  │
└──────────┘    └────────┘    └──────────┘    └───────────┘    └────────┘
     │               │              │               │               │
   string[]      ParsedFile    ClassInfo +      GeneratedTest    .spec.ts
                               SignalStoreInfo                  su disco
```

1. **Scanner** — individua ricorsivamente i file `.ts` del progetto, escludendo `node_modules`, file di test, moduli, configurazioni e ambienti
2. **Parser** — tramite l'API del compiler TypeScript, estrae dall'AST classi, decoratori, costruttori, metodi, signal, import e chiamate `inject()`
3. **Analyzer** — classifica il tipo di artefatto Angular, analizza i branch nel codice, estrae le dipendenze DI, identifica pattern TanStack Query e NGRX Signal Store
4. **Generator** — in base al tipo di artefatto, delega al generatore specifico tramite strategy pattern
5. **Writer** — applica la formattazione Prettier e scrive i file `.spec.ts` a fianco dei sorgenti

---

## Artefatti supportati

Ogni tipo di artefatto Angular dispone di un generatore dedicato con la relativa strategia di setup:

| Artefatto | Riconoscimento | Boilerplate generata |
|---|---|---|
| **Component** | `@Component` | `TestBed` + `ComponentFixture`, `NO_ERRORS_SCHEMA`, `setInput()` per signal inputs |
| **Service** | `@Injectable` | `TestBed.inject()`, subscribe su Observable, mock dei return value |
| **Pipe** | `@Pipe` | Istanziazione diretta per pipe pure; `TestBed` in presenza di dipendenze |
| **Guard** | `@Injectable` + metodi `canActivate`/`canDeactivate`/`canMatch`/`canLoad` | `TestBed` con mock di `ActivatedRouteSnapshot` e `RouterStateSnapshot` |
| **Directive** | `@Directive` | `TestBed` con componente host wrapper |
| **Interceptor** | `@Injectable` + metodo `intercept()` | `TestBed` con mock di `HttpRequest` e `HttpHandler` |
| **Signal Store** | Chiamata `signalStore(...)` | `inject()` in factory, test su state, computed e methods |
| **Utility** | Funzioni e costanti esportate | Chiamate dirette per le funzioni, asserzioni di esistenza per le costanti |

## Feature Angular riconosciute

- **Standalone components** (Angular 14+)
- **Signals**: `signal()`, `computed()`, `effect()`
- **Signal-based inputs/outputs**: `input()`, `input.required()`, `output()`, `model()`
- **View queries**: `viewChild()`, `viewChildren()`, `contentChild()`, `contentChildren()`
- **Dependency injection**: `inject()` function e constructor injection
- **NGRX Signal Store**: `withState()`, `withComputed()`, `withMethods()`
- **TanStack Query**: `injectQuery()`, `injectMutation()`

---

## Struttura della boilerplate generata

Dato il seguente servizio:

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

La boilerplate generata in `user.service.spec.ts`:

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

Il `TestBed`, i mock e la struttura dei test case sono pronti. Le asserzioni di logica di business vanno aggiunte a partire da questa base.

---

## Utility condivise: spec-test-helpers

Il tool genera un file `spec-test-helpers.ts` nella root del progetto target. Contiene le utility condivise da tutti i file di test generati:

| Funzione | Descrizione |
|---|---|
| `createMock()` | Restituisce un proxy profondo: qualsiasi proprietà letta o metodo invocato restituisce un valore valido. Compatibile con template, condizionali, iterazioni e coercizioni |
| `createEnrichedMock(overrides)` | Mock con override parziali: le proprietà specificate utilizzano i valori forniti, le restanti sono delegate al proxy |
| `createServiceMock()` | Factory di mock per servizi iniettati, con gestione di Symbol, iterabili e signal |
| `attempt(fn)` | Esegue una funzione sopprimendo `console.error`/`console.warn` e intercettando le eccezioni |
| `asyncAttempt(fn)` | Variante asincrona di `attempt()` |
| `exposed(instance)` | Restituisce l'istanza con tipo non vincolato, per accedere a membri privati o protetti senza errori di compilazione |
| `typed<T>(value)` | Cast tipizzato esplicito, alternativa strutturata a `as any` |

Il meccanismo a **proxy profondi** consente ai test di funzionare senza configurare manualmente ogni proprietà delle dipendenze. Si sovrascrivono esclusivamente le proprietà rilevanti per il caso di test specifico.

---

## Rilevamento automatico delle dipendenze

Prima della generazione, il tool analizza il `package.json` del progetto target (risalendo fino a 5 livelli dalla directory specificata) e adatta la boilerplate in base alle dipendenze rilevate:

| Dipendenza | Effetto sulla generazione |
|---|---|
| `@angular/localize` | Supporto per `$localize` nei template di test |
| `@tanstack/angular-query-experimental` | Mock specifici per `injectQuery()` e `injectMutation()` |
| `primeng` | Provider mock per i componenti PrimeNG |
| `angular-auth-oidc-client` | Mock per i servizi di autenticazione OIDC |
| `zone.js` | Gestione timer e flushing degli effect. Se il file `setup-jest.ts` indica una configurazione zoneless, il tool si adatta di conseguenza |

---

## Architettura interna

### Scanner (`src/scanner/`)

`file-scanner.ts` — percorre ricorsivamente il progetto e restituisce i path dei file `.ts` rilevanti, applicando filtri su directory (`node_modules`, `dist`, `.angular`, `e2e`, `assets`) e file (`*.spec.ts`, `*.d.ts`, `*.module.ts`, `environment*.ts`, `main.ts`, file di configurazione).

### Parser (`src/parser/`)

Sei moduli che operano sull'AST TypeScript per estrarre informazioni strutturate:

| Modulo | Responsabilità |
|---|---|
| `ts-parser.ts` | Utility di basso livello: `parseFile()`, `findNodes()`, `findClassDeclarations()` |
| `import-parser.ts` | Estrazione degli import → `ImportInfo[]` |
| `class-parser.ts` | Estrazione delle classi → `ClassInfo[]` con costruttore, metodi, proprietà, lifecycle hooks |
| `decorator-parser.ts` | Parsing dei decoratori Angular → `DecoratorMetadata` |
| `signal-parser.ts` | Rilevamento di signal, input/output/model signals, view queries, chiamate `inject()` |
| `export-parser.ts` | Estrazione di funzioni e costanti esportate per la generazione di test utility |

### Analyzer (`src/analyzer/`)

| Modulo | Responsabilità |
|---|---|
| `artifact-classifier.ts` | Classificazione dell'artefatto. Mappa decoratore → tipo base; per `@Injectable`, affina tramite euristica: presenza di `canActivate` → guard, `intercept` → interceptor |
| `dependency-analyzer.ts` | Estrazione delle dipendenze DI da costruttore e chiamate `inject()` |
| `branch-analyzer.ts` | Rilevamento dei rami: `if/else`, `switch/case`, ternari, optional chaining, nullish coalescing |
| `method-analyzer.ts` | Analisi dei metodi: async, return type, parametri, espressioni di chiamata |
| `inject-function-analyzer.ts` | Rilevamento di TanStack Query, inject custom, `runInInjectionContext()` |

### Generator (`src/generator/`)

Organizzato su tre livelli:

- **`test-generator.ts`** — orchestratore: coordina parsing, arricchimento del modello `ClassInfo`, dispatch al generatore specifico, e fallback al generatore utility
- **`generators/`** — 8 generatori specializzati, uno per tipo di artefatto. Tutti condividono la stessa firma: `(classInfo, filePath, imports, config) → GeneratedTest`
- **`helpers/`** — 9 moduli di supporto condivisi: generazione mock, gestione import, test per signal, test per branch, valori dummy, injection context, mock TanStack, spec helpers
- **`templates/test-template.ts`** — assemblaggio della struttura finale del file di test: import, `describe`, `beforeEach`, blocchi `it()`, `afterEach`

### Writer (`src/writer/`)

`file-writer.ts` — scrive i file `.spec.ts` nella stessa directory del sorgente corrispondente. Gestisce la creazione delle directory, il flag `--no-overwrite` e la modalità `--dry-run`. Produce un riepilogo con conteggio dei file scritti, saltati e in errore.

### Modelli (`src/models/`)

Tipi principali che attraversano la pipeline:

| Tipo | Descrizione |
|---|---|
| `ClassInfo` | Metadati completi della classe: decoratori, costruttore, metodi, proprietà, segnali, inject calls |
| `ParsedFile` | Output del parser: path, import, classi, signal stores |
| `MethodInfo` | Firma del metodo con branch rilevati |
| `BranchInfo` | Singolo ramo: tipo, condizione, numero di riga |
| `SignalStoreInfo` | NGRX Signal Store: nome, features, dipendenze |
| `GeneratedTest` | Output del generatore: path di destinazione e contenuto del test |
| `ProjectConfig` | Configurazione rilevata del progetto target |

---

## Estensione del tool

### Aggiungere un nuovo tipo di artefatto

L'aggiunta di un nuovo generatore richiede quattro interventi, seguendo il pattern degli artefatti esistenti.

**1.** Definire il tipo in `src/models/angular-types.ts`:

```typescript
export type AngularArtifactType =
  'component' | 'service' | 'pipe' | 'guard' | 'directive'
  | 'interceptor' | 'signal-store' | 'resolver';
```

**2.** Aggiungere la regola di classificazione in `src/analyzer/artifact-classifier.ts`:

```typescript
const refineServiceType = (classInfo: ClassInfo): AngularArtifactType => {
  const methodNames = classInfo.methods.map(m => m.name);
  if (methodNames.includes('resolve')) return 'resolver';
  // ... regole esistenti
};
```

**3.** Implementare il generatore in `src/generator/generators/resolver-generator.ts`:

```typescript
export const generateResolverTest = (
  classInfo: ClassInfo,
  sourceFilePath: string,
  sourceImports: ImportInfo[],
  config: ProjectConfig,
): GeneratedTest => {
  const dependencies = analyzeDependencies(classInfo.constructorParams, classInfo.injectCalls);
  const mocks = generateMocks(dependencies);
  // ... costruzione dei test case tramite le funzioni template

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

**4.** Registrare il generatore nel dispatcher in `src/generator/test-generator.ts`:

```typescript
case 'resolver':
  return generateResolverTest(classInfo, filePath, imports, config);
```

---

## Sviluppo

```bash
npm run build                                      # Compilazione TypeScript → dist/
npm test                                           # Esecuzione di tutti i test
npm test -- --testPathPattern='parser'             # Test di un singolo modulo
npm test -- --testNamePattern='should extract'     # Test filtrati per nome
npm run test:watch                                 # Modalità watch
npm run lint                                       # Type-check senza emissione (tsc --noEmit)
```

I test risiedono in `tests/`, con struttura speculare a `src/`. Le fixture in `tests/fixtures/` sono file Angular di esempio utilizzati come input per i test del generatore.
