import {externalDisallow} from 'api-chassis';

export default class InternalHooks {
  before = {find: [externalDisallow]};
}
