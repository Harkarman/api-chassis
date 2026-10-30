import {BadRequest} from 'api-chassis';

export default class Boom {
  async find() {
    throw {message: 'no status here'};
  }
  async get() {
    throw new Error('internal detail');
  }
  async create() {
    new BadRequest('nope');
  }
  async update() {
    throw {status: 409, message: 'conflict'};
  }
  async remove() {
    return {removed: true};
  }
}
