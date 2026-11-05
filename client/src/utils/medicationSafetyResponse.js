// Validate the existing ingredientResolver DTO; never infer clinical safety
// from an absent/malformed reply or recompute the server's clinical rules.
export function medicationSafetyResponse(payload) {
  const fail = () => {throw new Error('MEDICATION_SAFETY_RESPONSE_INVALID');};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      typeof payload.hasInteraction !== 'boolean' || typeof payload.verificationIncomplete !== 'boolean' ||
      !Array.isArray(payload.warnings) || !Array.isArray(payload.unresolvedIngredients) ||
      !payload.unresolvedIngredients.every(value => typeof value === 'string' && value.trim())) fail();
  const warnings = payload.warnings.map(warning => {
    const message = warning && typeof warning === 'object' && !Array.isArray(warning) && (warning.message || warning.description);
    if (typeof message !== 'string' || !message.trim()) fail();
    return message;
  });
  if (payload.hasInteraction !== (warnings.length > 0) ||
      (!payload.verificationIncomplete && payload.unresolvedIngredients.length > 0) ||
      (payload.statusMessage !== undefined && typeof payload.statusMessage !== 'string')) fail();
  return {hasInteraction:payload.hasInteraction, warnings, verificationIncomplete:payload.verificationIncomplete,
    unresolvedIngredients:[...payload.unresolvedIngredients], statusMessage:payload.statusMessage || ''};
}
