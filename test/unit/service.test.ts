import {describe, expect, it, vi} from 'vitest';
import {ChassisService} from '../../src/services/service';

const sequelizeModel = () => ({
  findAll: vi.fn(async () => []),
  findAndCountAll: vi.fn(async () => ({rows: [], count: 0})),
});

describe('ChassisService pagination', () => {
  it('honours a subclass field', async () => {
    class Paged extends ChassisService<any, 'postgres'> {
      pagination = true;
    }
    const Model = sequelizeModel();
    await new Paged({Model, dialect: 'postgres'}).find({});
    expect(Model.findAndCountAll).toHaveBeenCalled();
    expect(Model.findAll).not.toHaveBeenCalled();
  });

  it('honours the constructor option', async () => {
    const Model = sequelizeModel();
    await new ChassisService<any, 'postgres'>({
      Model,
      dialect: 'postgres',
      pagination: true,
    }).find({});
    expect(Model.findAndCountAll).toHaveBeenCalled();
  });

  it('defaults to an array', async () => {
    const Model = sequelizeModel();
    await new ChassisService<any, 'postgres'>({
      Model,
      dialect: 'postgres',
    }).find({});
    expect(Model.findAll).toHaveBeenCalled();
  });
});
