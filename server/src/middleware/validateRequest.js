const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    const errorMessages = error.details.map(detail => detail.message);
    return res.status(400).json({ error: 'Validation failed', details: errorMessages });
  }
  next();
};

const nicPattern = /^([0-9]{9}[vVxX]|[0-9]{12})$/;

module.exports = {
  validate,
  nicPattern
};
