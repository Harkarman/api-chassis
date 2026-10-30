// Stand-in for a Sequelize model factory; it must receive the instance.
export function fakeSequelizeModel(instance) {
  if (!instance?.isFakeSequelize) {
    throw new Error('model factory was not given the database instance');
  }
  const rows = new Map();
  let seq = 0;
  return {
    async findAll() {
      return [...rows.values()];
    },
    async findAndCountAll() {
      const all = [...rows.values()];
      return {rows: all, count: all.length};
    },
    async findByPk(id) {
      return rows.get(String(id)) ?? null;
    },
    async findOne({where}) {
      return rows.get(String(where?.id)) ?? null;
    },
    async create(data) {
      const row = {id: String(++seq), ...data};
      rows.set(row.id, row);
      return row;
    },
  };
}

export default fakeSequelizeModel;
