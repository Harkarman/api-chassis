// A Joi-like payload schema: requires a `business` claim and renames it.
export default {
  async validateAsync(payload) {
    if (typeof payload.business !== 'string') {
      throw new Error('"business" is required');
    }
    const {business, ...rest} = payload;
    return {...rest, businessId: business};
  },
};
