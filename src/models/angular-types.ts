export type AngularArtifactType = 'component' | 'service' | 'pipe' | 'guard' | 'directive' | 'interceptor' | 'signal-store';

export type AngularLifecycleHook = 
  | 'ngOnInit' | 'ngOnDestroy' | 'ngOnChanges' | 'ngDoCheck'
  | 'ngAfterContentInit' | 'ngAfterContentChecked'
  | 'ngAfterViewInit' | 'ngAfterViewChecked';

export const ANGULAR_LIFECYCLE_HOOKS: readonly AngularLifecycleHook[] = [
  'ngOnInit', 'ngOnDestroy', 'ngOnChanges', 'ngDoCheck',
  'ngAfterContentInit', 'ngAfterContentChecked',
  'ngAfterViewInit', 'ngAfterViewChecked',
];

export const ANGULAR_DECORATORS = ['Component', 'Injectable', 'Pipe', 'Directive', 'NgModule'] as const;

export type AngularDecorator = typeof ANGULAR_DECORATORS[number];

export const DECORATOR_TO_ARTIFACT: Record<AngularDecorator, AngularArtifactType> = {
  Component: 'component',
  Injectable: 'service',
  Pipe: 'pipe',
  Directive: 'directive',
  NgModule: 'service', // treat as service for testing purposes
};

// Angular signal-related function names
export const SIGNAL_FUNCTIONS = ['signal', 'computed', 'effect'] as const;
export const INPUT_FUNCTIONS = ['input'] as const;
export const OUTPUT_FUNCTIONS = ['output'] as const;
export const MODEL_FUNCTIONS = ['model'] as const;
export const VIEW_QUERY_FUNCTIONS = ['viewChild', 'viewChildren', 'contentChild', 'contentChildren'] as const;

export const TANSTACK_INJECT_FUNCTIONS = ['injectQuery', 'injectMutation', 'injectQueryClient', 'injectInfiniteQuery', 'injectIsFetching', 'injectIsMutating'] as const;
export type TanStackInjectFunction = typeof TANSTACK_INJECT_FUNCTIONS[number];

export type SignalKind = 'signal' | 'computed' | 'effect';
export type ViewQueryKind = 'viewChild' | 'viewChildren' | 'contentChild' | 'contentChildren';
export type InjectCallKind = 'inject' | 'injectQuery' | 'injectMutation' | 'injectQueryClient' | 'injectInfiniteQuery' | 'injectIsFetching' | 'injectIsMutating' | 'custom';
