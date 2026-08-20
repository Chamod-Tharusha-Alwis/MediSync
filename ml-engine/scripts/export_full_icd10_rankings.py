import os
import sqlite3
import csv
import sys

def export_full_rankings():
    sys.stdout.reconfigure(encoding='utf-8')
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # If base_dir is ml-engine, then project root is one level up
    project_root = os.path.dirname(base_dir) if os.path.basename(base_dir) == 'ml-engine' else base_dir
    if not os.path.exists(os.path.join(project_root, 'docs')):
        # Fallback if path structure differs
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    
    db_path = os.path.join(project_root, 'ml-engine', 'medisync.db')
    output_csv_path = os.path.join(project_root, 'docs', 'disease_rankings_full.csv')

    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    # Fetch all rows from icd10_diseases
    c.execute("SELECT disease_name, icd_code, base_danger_level, communicable, avg_severity FROM icd10_diseases;")
    rows = c.fetchall()
    conn.close()

    total_rows = len(rows)

    # Process and sort rows
    # Tier mapping: High -> 1, Medium -> 2, Low -> 3, Unknown/Other -> 4
    tier_map = {'High': 1, 'Medium': 2, 'Low': 3}
    
    processed_data = []
    tier_counts = {'High': 0, 'Medium': 0, 'Low': 0}
    
    for row in rows:
        name, icd_code, danger, comm, severity = row
        danger_tier = tier_map.get(danger, 4)
        if danger in tier_counts:
            tier_counts[danger] += 1
        else:
            tier_counts[danger] = 1
            
        sev_val = float(severity) if severity is not None and severity != '' else 0.0
        
        processed_data.append({
            'disease_name': str(name),
            'icd_code': str(icd_code),
            'base_danger_level': str(danger),
            'communicable': str(comm if comm else 'no'),
            'avg_severity': sev_val,
            '_tier': danger_tier
        })

    # Sort: primarily by _tier (1=High, 2=Medium, 3=Low)
    # secondarily by avg_severity descending (-avg_severity)
    # tertiarily alphabetically by disease_name (case-insensitive)
    processed_data.sort(key=lambda x: (x['_tier'], -x['avg_severity'], x['disease_name'].lower()))

    # Write CSV
    headers = ['disease_name', 'icd_code', 'base_danger_level', 'communicable', 'avg_severity']
    os.makedirs(os.path.dirname(output_csv_path), exist_ok=True)
    
    with open(output_csv_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=headers)
        writer.writeheader()
        for item in processed_data:
            writer.writerow({k: item[k] for k in headers})

    print("=======================================================================")
    print("STEP 2: FULL ICD-10 DISEASE RANKINGS EXPORT RESULTS")
    print("=======================================================================")
    print(f"Total Rows Exported: {total_rows:,} rows")
    print(f"Export Path: {output_csv_path}")
    print("\n--- PER-TIER COUNTS ---")
    for t in ['High', 'Low', 'Medium']:
        print(f"  * {t:<6s}: {tier_counts.get(t, 0):,d}")
    print("-----------------------------------------------------------------------")

    # Extract first 15 rows of High tier
    high_rows = [r for r in processed_data if r['base_danger_level'] == 'High'][:15]
    print("\n--- FIRST 15 ROWS OF THE HIGH TIER ---")
    for i, r in enumerate(high_rows, 1):
        print(f"  {i:2d}. {r['disease_name']:<55s} | ICD: {r['icd_code']:<8s} | Tier: {r['base_danger_level']:<6s} | Comm: {r['communicable']:<3s} | Sev: {r['avg_severity']:.2f}")

    # Extract first 15 rows of Low tier
    low_rows = [r for r in processed_data if r['base_danger_level'] == 'Low'][:15]
    print("\n--- FIRST 15 ROWS OF THE LOW TIER ---")
    for i, r in enumerate(low_rows, 1):
        print(f"  {i:2d}. {r['disease_name']:<55s} | ICD: {r['icd_code']:<8s} | Tier: {r['base_danger_level']:<6s} | Comm: {r['communicable']:<3s} | Sev: {r['avg_severity']:.2f}")

    print("=======================================================================")

if __name__ == '__main__':
    export_full_rankings()
