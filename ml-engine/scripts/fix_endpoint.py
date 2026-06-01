"""
Replacement script for predict-district-demand endpoint body.
Run: python ml-engine/fix_endpoint.py
"""
import os

path = os.path.join(os.path.dirname(__file__), '..', 'app.py')

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

START_MARKER = "def predict_district_demand():"
END_MARKER = "\nif __name__ == '__main__':"

start_idx = content.find(START_MARKER)
end_idx = content.find(END_MARKER, start_idx)

if start_idx == -1:
    print("ERROR: Could not find the function start marker.")
    exit(1)

new_body = '''def predict_district_demand():
    try:
        data = request.json or {}
        district = data.get('district', 'Unknown')
        drug_trends = data.get('drugTrends', {})

        if not drug_trends:
            return jsonify({
                'district': district,
                'alerts': [],
                'message': 'No dispensing data found for this district.'
            })

        alerts = []
        for drug_name, daily_counts in drug_trends.items():
            if len(daily_counts) < 2:
                continue
            counts = [d['count'] for d in daily_counts]
            n = len(counts)
            mid = n // 2
            baseline_avg = sum(counts[:mid]) / max(1, mid)
            recent_avg = sum(counts[mid:]) / max(1, n - mid)
            pct_change = ((recent_avg - baseline_avg) / max(1, baseline_avg)) * 100
            slope = (counts[-1] - counts[0]) / max(1, n - 1)

            if pct_change >= 50 or (slope > 0 and recent_avg >= baseline_avg * 1.5):
                status = "Critical"
                message = f"Dispensing surged by {round(pct_change)}% in {district}. Restock immediately."
            elif pct_change >= 30 or (slope > 0 and recent_avg >= baseline_avg * 1.3):
                status = "Warning"
                message = f"Dispensing up {round(pct_change)}% in {district}. Consider restocking soon."
            else:
                continue

            alerts.append({
                "drugName": drug_name,
                "trend": f"+{round(pct_change)}%" if pct_change >= 0 else f"{round(pct_change)}%",
                "recentDailyAvg": round(recent_avg, 1),
                "baselineDailyAvg": round(baseline_avg, 1),
                "status": status,
                "message": message
            })

        alerts.sort(key=lambda x: 0 if x['status'] == 'Critical' else 1)
        return jsonify({
            'district': district,
            'alerts': alerts,
            'drugsAnalyzed': len(drug_trends),
            'generatedAt': __import__('datetime').datetime.now().isoformat()
        })

    except Exception as e:
        print(f'predict-district-demand error: {e}')
        return jsonify({'error': str(e)}), 500'''

new_content = content[:start_idx] + new_body + "\n\n" + content[end_idx + 1:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("SUCCESS: predict_district_demand body replaced.")
print(f"File now has {len(new_content.splitlines())} lines.")
