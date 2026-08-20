import os
import json
import sqlite3
import csv

def generate_disease_rankings():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    symptom_map_path = os.path.join(base_dir, 'ml-engine', 'data', 'symptom_map.json')
    db_path = os.path.join(base_dir, 'ml-engine', 'medisync.db')
    output_csv_path = os.path.join(base_dir, 'docs', 'disease_rankings.csv')

    # 1. Load symptom_map.json (all 41 diseases)
    with open(symptom_map_path, 'r', encoding='utf-8') as f:
        symptom_map = json.load(f)

    # 2. Query outbreak_tracking table for total cases per disease
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("SELECT disease, SUM(count) FROM outbreak_tracking GROUP BY disease")
    outbreak_cases = dict(c.fetchall())
    conn.close()

    # 3. Build data list with communicable classification and case sums
    diseases_data = []
    for item in symptom_map:
        name = item.get('disease', 'Unknown')
        icd_code = item.get('icd_code', 'N/A')
        avg_severity = float(item.get('avg_severity', 0.0))
        symptom_count = int(item.get('symptom_count', 0))
        description = item.get('description', '').replace('\n', ' ').strip()
        
        # Check if disease has real recorded outbreak data in outbreak_tracking
        if name in outbreak_cases and outbreak_cases[name] > 0:
            communicable = 'yes'
            total_case_count = int(outbreak_cases[name])
        else:
            communicable = 'no'
            total_case_count = 'N/A'

        diseases_data.append({
            'disease_name': name,
            'icd_code': icd_code,
            'avg_severity': avg_severity,
            'total_case_count': total_case_count,
            'communicable': communicable,
            'symptom_count': symptom_count,
            'description': description
        })

    # 4. Calculate rank_by_severity (1 = highest avg_severity, descending)
    # Sort by avg_severity DESC, then alphabetically by disease_name for tie-breaking
    diseases_data.sort(key=lambda x: (-x['avg_severity'], x['disease_name']))
    for idx, row in enumerate(diseases_data, start=1):
        row['rank_by_severity'] = idx

    # 5. Calculate rank_by_case_volume (only meaningful for communicable diseases with real data)
    communicable_rows = [r for r in diseases_data if r['communicable'] == 'yes']
    communicable_rows.sort(key=lambda x: (-x['total_case_count'], x['disease_name']))
    
    vol_rank_map = {}
    for idx, row in enumerate(communicable_rows, start=1):
        vol_rank_map[row['disease_name']] = idx

    for row in diseases_data:
        if row['communicable'] == 'yes':
            row['rank_by_case_volume'] = vol_rank_map[row['disease_name']]
        else:
            row['rank_by_case_volume'] = 'N/A'

    # 6. Re-sort by rank_by_severity for final clean presentation
    diseases_data.sort(key=lambda x: x['rank_by_severity'])

    # 7. Write to CSV
    headers = [
        'rank_by_severity', 'rank_by_case_volume', 'disease_name', 'icd_code',
        'avg_severity', 'total_case_count', 'communicable', 'symptom_count', 'description'
    ]

    os.makedirs(os.path.dirname(output_csv_path), exist_ok=True)
    with open(output_csv_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=headers)
        writer.writeheader()
        for row in diseases_data:
            writer.writerow(row)

    print(f"Successfully exported {len(diseases_data)} diseases to: {output_csv_path}")
    print(f"Communicable diseases with outbreak data: {len(communicable_rows)}")
    print(f"Non-communicable diseases (N/A volume): {len(diseases_data) - len(communicable_rows)}")
    
    print("\n--- FIRST 10 ROWS OF GENERATED CSV ---")
    with open(output_csv_path, 'r', encoding='utf-8') as f:
        for _ in range(11):  # header + 10 rows
            print(f.readline().strip())

if __name__ == '__main__':
    generate_disease_rankings()
