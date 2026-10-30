export default class Secure {
  async find(query, user) {
    return [{user: user ?? null}];
  }
}
