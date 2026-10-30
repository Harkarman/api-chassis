// After hooks receive (...methodArgs, result, previousHookData).
const result = args => args[args.length - 2];

export default class WidgetHooks {
  after = {
    get: [(...args) => ({...result(args), hooked: true})],
    find: [(...args) => result(args).map(row => ({...row, listed: true}))],
  };
}
