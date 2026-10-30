// A single-file CommonJS service: mounted at /flat.
module.exports = class Flat {
  async find() {
    return [{flat: true}];
  }
};
