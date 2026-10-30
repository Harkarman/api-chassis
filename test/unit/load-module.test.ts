import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadOptionalModule} from '../../src/services/load-module';
import {FIXTURES} from '../helpers/start-app';

const modules = path.join(FIXTURES, 'modules');

describe('loadOptionalModule', () => {
  it('loads an existing module', async () => {
    const mod = await loadOptionalModule(path.join(modules, 'present'));
    expect(mod.default).toEqual({present: true});
  });

  it('returns undefined when there is no file', async () => {
    expect(
      await loadOptionalModule(path.join(modules, 'absent'))
    ).toBeUndefined();
  });

  it('rethrows errors from inside an existing file', async () => {
    await expect(
      loadOptionalModule(path.join(modules, 'imports-missing'))
    ).rejects.toThrow(/api-chassis-test-missing-package/);
  });
});
