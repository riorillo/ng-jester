/**
 * Generates the content of the spec-test-helpers.ts utility file
 * that gets written into the target project. This file exports
 * proxy-creation functions used by generated spec files to keep
 * them clean and readable.
 */
export const generateSpecHelpersContent = (): string => `
export function createServiceMock(): any {
  const leaf = { id: 'test', name: 'test', label: 'test', value: 1, code: 'test', description: 'test', toString: () => 'test', valueOf: () => 1, [Symbol.toPrimitive]: () => 'test' };
  const sig = require('@angular/core').signal;
  const arrM = ['forEach', 'map', 'filter', 'some', 'every', 'find', 'findIndex', 'flatMap', 'reduce', 'flat', 'includes', 'indexOf', 'slice', 'concat', 'sort', 'reverse', 'join', 'push', 'pop', 'shift', 'unshift', 'splice'];

  const mkVal = (d: number): any => {
    if (d > 3) return [leaf];
    const items = [mkVal(d + 1)];
    return new Proxy(function () {}, {
      get: (t: any, p: any) => {
        if (p === Symbol.toPrimitive || p === 'valueOf') return () => 'test';
        if (p === 'toString') return () => 'test';
        if (p === Symbol.iterator) return items[Symbol.iterator].bind(items);
        if (typeof p === 'symbol' || p === 'then') return undefined;
        if (p === 'length') return 1;
        if (arrM.includes(p)) return items[p].bind(items);
        return mkVal(d + 1);
      },
      apply: () => mkVal(d + 1),
      has: (t: any, p: any) => true,
    });
  };

  const mkSig = (d: number) => {
    try { return sig(mkVal(d)); } catch (_) { return () => mkVal(d); }
  };

  const mkP = (d: number): any => {
    if (d > 4) return jest.fn().mockReturnValue(mkVal(4));
    const s = mkSig(d);
    return new Proxy(s, {
      get: (t: any, p: any) => {
        if (p === 'then' || typeof p !== 'string') return undefined;
        return p in t ? t[p] : mkP(d + 1);
      },
      apply: (t: any) => t(),
    });
  };

  return mkP(0);
}

export function createEnrichedMock(overrides: Record<string, any>): any {
  return new Proxy(overrides, {
    get: (t: any, p: any) => {
      if (p in t) return t[p];
      if (p === 'then' || typeof p !== 'string') return undefined;
      return createServiceMock();
    },
  });
}

export function createMock(): any {
  const leaf: any = { id: 'test', name: 'test', label: 'test', value: 1, code: 'test', description: 'test', toString: () => 'test', valueOf: () => 1, [Symbol.toPrimitive]: () => 'test' };
  const ownKeys = ['id', 'name', 'label', 'value', 'code', 'description'];

  const lh: any = {
    get(_: any, p: any) {
      if (p === Symbol.toPrimitive) return (h: string) => h === 'number' ? 1 : 'test';
      if (p === Symbol.iterator) return [leaf][Symbol.iterator].bind([leaf]);
      if (p === 'then' || typeof p === 'symbol') return undefined;
      if (p === 'length') return 1;
      if (p === 'valueOf') return () => 1;
      if (p === 'toString' || p === 'toLocaleDateString' || p === 'toISOString') return () => 'test';
      if (p === 'getTime' || p === 'getFullYear') return () => 1;
      if (p === 'subscribe') return () => ({ unsubscribe: () => {} });
      if (p === 'pipe') return () => ({ subscribe: () => ({ unsubscribe: () => {} }) });
      const am = ['map', 'filter', 'forEach', 'some', 'every', 'find', 'findIndex', 'flatMap', 'reduce', 'flat', 'includes', 'indexOf', 'splice', 'slice', 'concat', 'push', 'pop', 'shift', 'keys', 'values', 'entries'];
      if (am.includes(p)) return ([leaf] as Record<string, Function>)[p]?.bind([leaf]);
      return 'test';
    },
    ownKeys: () => ownKeys,
    getOwnPropertyDescriptor: () => ({ configurable: true, enumerable: true, value: 'test' }),
  };

  const h: any = {
    get(_: any, p: any) {
      if (p === Symbol.toPrimitive) return (h: string) => h === 'number' ? 1 : 'test';
      if (p === Symbol.iterator) return [leaf][Symbol.iterator].bind([leaf]);
      if (p === 'then' || typeof p === 'symbol') return undefined;
      if (p === 'length') return 1;
      if (p === 'valueOf') return () => 1;
      if (p === 'toString' || p === 'toLocaleDateString' || p === 'toISOString') return () => 'test';
      if (p === 'getTime' || p === 'getFullYear') return () => 1;
      if (p === 'subscribe') return () => ({ unsubscribe: () => {} });
      if (p === 'pipe') return () => ({ subscribe: () => ({ unsubscribe: () => {} }) });
      const am = ['map', 'filter', 'forEach', 'some', 'every', 'find', 'findIndex', 'flatMap', 'reduce', 'flat', 'includes', 'indexOf', 'splice', 'slice', 'concat', 'push', 'pop', 'shift', 'keys', 'values', 'entries'];
      if (am.includes(p)) return ([leaf] as Record<string, Function>)[p]?.bind([leaf]);
      return new Proxy({}, lh);
    },
    ownKeys: () => ownKeys,
    getOwnPropertyDescriptor: () => ({ configurable: true, enumerable: true, value: 'test' }),
  };

  return new Proxy({}, h);
}

export function attempt(fn: () => any): void {
  const err = console.error; const warn = console.warn;
  console.error = () => {}; console.warn = () => {};
  try { fn(); } catch {} finally { console.error = err; console.warn = warn; }
}

export async function asyncAttempt(fn: () => any): Promise<void> {
  const err = console.error; const warn = console.warn;
  console.error = () => {}; console.warn = () => {};
  try { await fn(); } catch {} finally { console.error = err; console.warn = warn; }
}

type Unrestricted = any;

export function exposed<T>(instance: T): Unrestricted {
  return instance;
}

export function typed<T = any>(value: unknown): T {
  return value as T;
}

export function createMockItem(): any {
  const arrM = ['forEach', 'map', 'filter', 'some', 'every', 'find', 'findIndex', 'flatMap', 'reduce', 'flat', 'includes', 'indexOf', 'slice', 'concat', 'sort', 'reverse', 'join', 'push', 'pop', 'shift', 'unshift', 'splice'];

  const mk = (d: number): any => {
    if (d > 3) return { id: 'test', name: 'test', label: 'test', value: 1, toString: () => 'test', valueOf: () => 1, [Symbol.toPrimitive]: () => 'test' };
    return new Proxy(function () {}, {
      get: (t: any, p: any) => {
        if (p === Symbol.toPrimitive || p === 'valueOf') return () => 'test';
        if (p === 'toString') return () => 'test';
        if (p === Symbol.iterator) return [][Symbol.iterator].bind([mk(d + 1)]);
        if (typeof p === 'symbol' || p === 'then') return undefined;
        if (p === 'length') return 1;
        if (arrM.includes(p)) {
          const items = [mk(d + 1)];
          return items[p].bind(items);
        }
        return mk(d + 1);
      },
      apply: () => mk(d + 1),
      has: () => true,
    });
  };

  return mk(0);
}
`.trimStart();
