// Joi-like schemas: create requires a name and converts price to a number.
export default class WidgetValidator {
  create = () => ({
    validateAsync: async value => {
      if (!value.name) throw new Error('"name" is required');
      return {...value, price: Number(value.price ?? 0), validated: true};
    },
  });
}
