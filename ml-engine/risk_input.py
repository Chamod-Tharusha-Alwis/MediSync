"""Pure validation for the existing four optional patient-risk fields; no clinical scoring changes."""
import math

class RiskInputError(ValueError):
    pass

def validate_patient_risk_input(data):
    fields = {'age', 'chronicConditions', 'consultationCount30days', 'activePrescriptionsCount'}
    if not isinstance(data, dict) or not data or set(data) - fields:
        raise RiskInputError('Invalid risk request')
    age = data.get('age', 30)
    conditions = data.get('chronicConditions', [])
    consultations = data.get('consultationCount30days', 0)
    prescriptions = data.get('activePrescriptionsCount', 0)
    for value in (age, consultations, prescriptions):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0 or (isinstance(value, float) and not math.isfinite(value)):
            raise RiskInputError('Invalid risk request')
    if not isinstance(conditions, list) or any(not isinstance(item, str) or not item.strip() for item in conditions):
        raise RiskInputError('Invalid risk request')
    # Retain accepted numeric values, case, optional defaults and duplicate entries as-is.
    # No unreviewed age ceiling, condition vocabulary or scoring normalization is introduced.
    return age, conditions, consultations, prescriptions
