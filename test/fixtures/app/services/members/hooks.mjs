import {loggedIn} from 'api-chassis';

export default class MembersHooks {
  before = {find: [loggedIn]};
}
