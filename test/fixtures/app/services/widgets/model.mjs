// In-memory stand-in for a Mongoose model.
const rows = new Map();
let seq = 0;
const match = (row, query) =>
  Object.entries(query).every(([key, value]) =>
    value && typeof value === 'object' && '$gt' in value
      ? Number(row[key]) > Number(value.$gt)
      : String(row[key]) === String(value)
  );

export default {
  async find(query) {
    return [...rows.values()].filter(row => match(row, query));
  },
  async findOne(query) {
    return [...rows.values()].find(row => match(row, query)) ?? null;
  },
  async create(data) {
    const row = {_id: String(++seq), ...data};
    rows.set(row._id, row);
    return {toJSON: () => ({...row})};
  },
  async findOneAndUpdate({_id}, {$set}) {
    const row = rows.get(_id);
    if (!row) return null;
    Object.assign(row, $set);
    return {...row};
  },
  async findOneAndDelete({_id}) {
    const row = rows.get(_id) ?? null;
    rows.delete(_id);
    return row;
  },
};
