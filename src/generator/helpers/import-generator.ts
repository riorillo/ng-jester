import { ClassInfo, ImportInfo } from '../../models/types';
import { AngularArtifactType } from '../../models/angular-types';
import { DependencyInfo } from '../../analyzer/dependency-analyzer';

export interface TestImport {
  moduleSpecifier: string;
  namedImports: string[];
}

export const generateTestImports = (
  classInfo: ClassInfo,
  sourceRelativePath: string,
  artifactType: AngularArtifactType,
  dependencies: DependencyInfo[],
  sourceImports: ImportInfo[],
  projectUsesLocalize = false,
): TestImport[] => {
  const imports: TestImport[] = [];

  // Angular testing imports
  imports.push(getAngularTestingImport(artifactType));

  // Angular core imports (NO_ERRORS_SCHEMA for components/directives)
  const coreImport = getAngularCoreImport(artifactType);
  if (coreImport) imports.push(coreImport);

  // Import the class under test
  imports.push({
    moduleSpecifier: sourceRelativePath,
    namedImports: [classInfo.name],
  });

  // Import dependency types for mocking
  const depImports = getDependencyImports(dependencies, sourceImports);
  imports.push(...depImports);

  // RxJS imports if needed
  if (needsRxjsImport(classInfo, dependencies)) {
    imports.push({ moduleSpecifier: 'rxjs', namedImports: ['of'] });
  }

  // Angular Forms modules (needed for overrideComponent to preserve form directives)
  if (artifactType === 'component') {
    imports.push({ moduleSpecifier: '@angular/forms', namedImports: ['ReactiveFormsModule', 'FormsModule'] });
  }

  // $localize polyfill
  if (needsLocalizeImport(classInfo, sourceImports, projectUsesLocalize)) {
    imports.push({ moduleSpecifier: '@angular/localize/init', namedImports: [] });
  }

  return mergeImports(imports);
};

const getAngularTestingImport = (artifactType: AngularArtifactType): TestImport => {
  const namedImports = ['TestBed'];

  if (artifactType === 'component' || artifactType === 'directive') {
    namedImports.push('ComponentFixture');
  }

  return { moduleSpecifier: '@angular/core/testing', namedImports };
};

const getAngularCoreImport = (artifactType: AngularArtifactType): TestImport | null => {
  if (artifactType === 'component' || artifactType === 'directive') {
    return { moduleSpecifier: '@angular/core', namedImports: ['NO_ERRORS_SCHEMA'] };
  }
  return null;
};

const stripGenerics = (type: string): string => {
  const idx = type.indexOf('<');
  return idx >= 0 ? type.substring(0, idx) : type;
};

const ANGULAR_CORE_TYPES = new Set([
  'ElementRef', 'TemplateRef', 'ViewContainerRef', 'ChangeDetectorRef',
  'Renderer2', 'NgZone', 'Injector', 'ApplicationRef', 'EnvironmentInjector', 'DestroyRef',
]);

const ANGULAR_ROUTER_TYPES = new Set([
  'Router', 'ActivatedRoute', 'ActivatedRouteSnapshot', 'RouterStateSnapshot',
]);

const ANGULAR_HTTP_TYPES = new Set([
  'HttpClient', 'HttpHandler',
]);

const getDependencyImports = (dependencies: DependencyInfo[], sourceImports: ImportInfo[]): TestImport[] => {
  const imports: TestImport[] = [];

  for (const dep of dependencies) {
    const baseType = stripGenerics(dep.type);
    const sourceImport = sourceImports.find(
      imp => imp.namedImports.includes(baseType) || imp.defaultImport === baseType,
    );

    if (sourceImport) {
      imports.push({
        moduleSpecifier: sourceImport.moduleSpecifier,
        namedImports: [baseType],
      });
    } else if (ANGULAR_CORE_TYPES.has(baseType)) {
      imports.push({ moduleSpecifier: '@angular/core', namedImports: [baseType] });
    } else if (ANGULAR_ROUTER_TYPES.has(baseType)) {
      imports.push({ moduleSpecifier: '@angular/router', namedImports: [baseType] });
    } else if (ANGULAR_HTTP_TYPES.has(baseType)) {
      imports.push({ moduleSpecifier: '@angular/common/http', namedImports: [baseType] });
    }
  }

  return imports;
};

const needsRxjsImport = (classInfo: ClassInfo, dependencies: DependencyInfo[]): boolean => {
  const allBodies = classInfo.methods.map(m => m.body).join(' ');
  const allInitializers = classInfo.properties.map(p => p.initializer || '').join(' ');
  const TYPES_WITH_OF_MOCK = ['HttpClient', 'Router', 'ActivatedRoute'];
  return allBodies.includes('Observable') || allBodies.includes('subscribe') ||
    allBodies.includes('pipe(') || allInitializers.includes('toSignal') ||
    allInitializers.includes('subscribe') ||
    dependencies.some(d => TYPES_WITH_OF_MOCK.includes(stripGenerics(d.type))) ||
    dependencies.length > 0; // conservatively import of() when there are deps, since enriched mocks may use of()
};

const needsLocalizeImport = (classInfo: ClassInfo, sourceImports: ImportInfo[], projectUsesLocalize: boolean): boolean => {
  const allBodies = classInfo.methods.map(m => m.body).join(' ');
  const allInitializers = classInfo.properties.map(p => p.initializer || '').join(' ');
  if (allBodies.includes('$localize') || allInitializers.includes('$localize')) return true;
  if (sourceImports.some(imp => imp.moduleSpecifier.includes('@angular/localize'))) return true;
  // If the project uses @angular/localize, all components with external templates may need it
  return projectUsesLocalize;
};

const mergeImports = (imports: TestImport[]): TestImport[] => {
  const merged = new Map<string, Set<string>>();

  for (const imp of imports) {
    if (!merged.has(imp.moduleSpecifier)) {
      merged.set(imp.moduleSpecifier, new Set());
    }
    for (const name of imp.namedImports) {
      merged.get(imp.moduleSpecifier)!.add(name);
    }
  }

  return Array.from(merged.entries()).map(([moduleSpecifier, names]) => ({
    moduleSpecifier,
    namedImports: Array.from(names).sort(),
  }));
};

export const renderImports = (imports: TestImport[]): string =>
  imports
    .map(imp => {
      if (imp.namedImports.length === 0) {
        return `import '${imp.moduleSpecifier}';`;
      }
      const names = imp.namedImports.join(', ');
      return `import { ${names} } from '${imp.moduleSpecifier}';`;
    })
    .join('\n');

export const deduplicateImportLines = (importBlock: string): string => {
  const lines = importBlock.split('\n');
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !seen.has(trimmed)) {
      if (trimmed) seen.add(trimmed);
      result.push(line);
    }
  }
  return result.join('\n');
};
