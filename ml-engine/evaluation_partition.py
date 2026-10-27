"""Synthetic split admission only. No real data access, training, randomness or independence claim."""
def check_synthetic_partition(records, train_ids, heldout_ids):
    if not isinstance(records, list) or not train_ids or not heldout_ids:
        raise ValueError('Explicit nonempty synthetic partitions required')
    by_id = {}
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get('case_id'), str) or not record['case_id'] or record['case_id'] in by_id:
            raise ValueError('Unique synthetic case identity required')
        if not isinstance(record.get('group_id'), str) or not record['group_id']:
            raise ValueError('Grouping provenance required')
        symptoms = record.get('symptoms')
        if not isinstance(symptoms, list) or not symptoms or any(not isinstance(s, str) or not s.strip() for s in symptoms):
            raise ValueError('Explicit synthetic profile required')
        by_id[record['case_id']] = record
    train, heldout = set(train_ids), set(heldout_ids)
    if train & heldout or not (train | heldout) <= set(by_id):
        raise ValueError('Case overlap or unknown case')
    def groups(ids):
        return {by_id[key]['group_id'] for key in ids}
    def profiles(ids):
        return {tuple(sorted({s.strip().lower().replace('_', ' ') for s in by_id[key]['symptoms']})) for key in ids}
    if groups(train) & groups(heldout) or profiles(train) & profiles(heldout):
        raise ValueError('Related groups or equivalent profiles cross partitions')
    return {'syntheticOnly': True, 'independentValidationEstablished': False, 'caseOverlap': False, 'knownGroupOverlap': False, 'exactProfileOverlap': False}
