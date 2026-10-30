import {createRequire} from 'module';
import path from 'path';
import {pathToFileURL} from 'url';

declare const require: NodeJS.Require | undefined;

/**
 * Directory that holds `services/` and `micro-services/`. Falls back to the
 * entry script's directory (what `require.main` gave under CommonJS).
 */
export function resolveRootDir(rootDir?: string): string {
  if (rootDir) {
    return rootDir;
  }
  const entry =
    (typeof require === 'function' ? require.main?.filename : undefined) ??
    process.argv[1];
  if (!entry) {
    throw new Error('Please provide service path');
  }
  return path.dirname(entry);
}

/**
 * Loads a user module by path without an extension, the way `require` would,
 * so CommonJS, ts-node/tsx and ESM projects all resolve `services/<name>`.
 * Returns an object whose `default` is the module's default export.
 */
export async function loadModule(modulePath: string): Promise<any> {
  const requireFrom = createRequire(modulePath);
  const resolved = resolveModule(requireFrom, modulePath);
  let mod: any;
  try {
    mod = requireFrom(resolved);
  } catch (error: any) {
    // ESM with top-level await (or Node without require(esm)) needs import().
    if (
      error?.code !== 'ERR_REQUIRE_ASYNC_MODULE' &&
      error?.code !== 'ERR_REQUIRE_ESM'
    ) {
      throw error;
    }
    mod = await import(pathToFileURL(resolved).href);
  }
  if (mod && (mod.__esModule || Object.hasOwn(mod, 'default'))) {
    return mod;
  }
  return {default: mod};
}

/**
 * Like `loadModule`, but returns undefined when no file exists at the path.
 * Errors from inside an existing file (syntax errors, a missing package it
 * imports) still throw, so a broken model or hooks file isn't silently ignored.
 */
export async function loadOptionalModule(
  modulePath: string
): Promise<any | undefined> {
  try {
    resolveModule(createRequire(modulePath), modulePath);
  } catch (error: any) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      return undefined;
    }
    throw error;
  }
  return loadModule(modulePath);
}

// require.resolve only tries .js/.json/.node (plus loader-registered ones
// like .ts), so explicit .mjs/.cjs files need checking by hand.
const EXPLICIT_EXTENSIONS = ['.mjs', '.cjs', '/index.mjs', '/index.cjs'];

function resolveModule(requireFrom: NodeJS.Require, modulePath: string) {
  try {
    return requireFrom.resolve(modulePath);
  } catch (error: any) {
    for (const suffix of EXPLICIT_EXTENSIONS) {
      try {
        return requireFrom.resolve(modulePath + suffix);
      } catch {
        // try the next candidate
      }
    }
    throw error;
  }
}

/** Directory entries that are support files rather than services. */
export function isServiceEntry(file: string): boolean {
  return !/^\.|^index\.|\.d\.[cm]?ts$|\.map$/.test(file);
}
