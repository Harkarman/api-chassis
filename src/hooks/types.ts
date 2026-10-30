export interface HooksMethods {
  before?: {
    readonly all?: Function[];
    readonly find: Function[];
    readonly get: Function[];
    readonly create: Function[];
    readonly patch: Function[];
    readonly remove: Function[];
    readonly update: Function[];
  };
  after?: {
    readonly all?: Function[];
    readonly find: Function[];
    readonly get: Function[];
    readonly create: Function[];
    readonly patch: Function[];
    readonly remove: Function[];
    readonly update: Function[];
  };
  readonly all?: Function[];
  readonly find: Function[];
  readonly get: Function[];
  readonly create: Function[];
  readonly patch: Function[];
  readonly remove: Function[];
  readonly update: Function[];
}
