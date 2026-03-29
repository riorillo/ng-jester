export const indent = (text: string, level: number, spaces: number = 2): string =>
  text.split('\n').map(line => line.length > 0 ? ' '.repeat(level * spaces) + line : line).join('\n');

export const camelCase = (str: string): string =>
  str.replace(/[-_](.)/g, (_, c) => c.toUpperCase()).replace(/^[A-Z]/, c => c.toLowerCase());

export const pascalCase = (str: string): string =>
  str.replace(/[-_](.)/g, (_, c) => c.toUpperCase()).replace(/^[a-z]/, c => c.toUpperCase());

export const kebabCase = (str: string): string =>
  str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').toLowerCase();

export const quote = (str: string): string => `'${str}'`;

export const doubleQuote = (str: string): string => `"${str}"`;

export const joinLines = (lines: string[], separator: string = '\n'): string =>
  lines.filter(line => line !== null && line !== undefined).join(separator);

export const wrapInBlock = (header: string, body: string, indentLevel: number = 1): string =>
  `${header} {\n${indent(body, indentLevel)}\n}`;

export const wrapInDescribe = (name: string, body: string): string =>
  wrapInBlock(`describe('${name}', () =>`, body) + ';';

export const wrapInIt = (name: string, body: string): string =>
  wrapInBlock(`it('${name}', () =>`, body) + ';';

export const wrapInBeforeEach = (body: string, isAsync: boolean = false): string => {
  const prefix = isAsync ? 'async ' : '';
  return wrapInBlock(`beforeEach(${prefix}() =>`, body) + ';';
};

export const removeFileExtension = (filePath: string): string =>
  filePath.replace(/\.(ts|js)$/, '');

export const toSpecFileName = (filePath: string): string =>
  filePath.replace(/\.ts$/, '.spec.ts');

export const escapeStringLiteral = (str: string): string =>
  str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');

export const uniqueArray = <T>(arr: T[]): T[] => [...new Set(arr)];
