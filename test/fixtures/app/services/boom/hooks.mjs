import {disallow} from 'api-chassis';

export default class BoomHooks {
  before = {remove: [disallow]};
}
