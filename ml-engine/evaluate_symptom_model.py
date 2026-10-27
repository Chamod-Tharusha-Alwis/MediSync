"""
MediSync symptom corpus RESUBSTITUTION evaluation only.
Profiles evaluated below also contributed to the fitted disease corpus.
This is in-sample performance, not an unbiased estimate of unseen-case accuracy.
Held-out/external performance, calibration and clinical validity are NOT ESTABLISHED.
Do not execute without separate dataset/evaluation approval. Historical metric reports
remain immutable; a future authorized run writes a separate exclusive-create report.
"""

import sys
import time
import json
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.metrics import classification_report, accuracy_score, f1_score, precision_score, recall_score

# 1. Load dataset
DATA_PATH = "ml-engine/data/dataset.csv"
df = pd.read_csv(DATA_PATH)
disease_col = df['Disease'].str.strip()
symptom_cols = [c for c in df.columns if c.startswith('Symptom')]

# Build unique case profiles to prevent duplicate-sample inflation
rows = []
for _, r in df.iterrows():
    disease = str(r['Disease']).strip()
    syms = [str(r[c]).strip().lower().replace('_', ' ') for c in symptom_cols if pd.notna(r[c]) and str(r[c]).strip()]
    if syms:
        syms_text = " ".join(sorted(syms))
        rows.append({'disease': disease, 'symptoms_text': syms_text, 'symptom_list': syms})

case_df = pd.DataFrame(rows)
unique_cases = case_df.drop_duplicates(subset=['disease', 'symptoms_text']).reset_index(drop=True)

print(f"Total rows in dataset.csv: {len(case_df):,}")
print(f"Unique disease-symptom profiles: {len(unique_cases):,}")
print(f"Disease classes: {unique_cases['disease'].nunique()}")

# 2. Build Disease Corpus (one document per disease combining all known symptoms)
disease_corpus = {}
for d, group in case_df.groupby('disease'):
    all_syms = set()
    for s_list in group['symptom_list']:
        all_syms.update(s_list)
    # Give disease name extra weight as in app.py
    disease_corpus[d] = f"{d} {d} " + " ".join(sorted(all_syms))

diseases = sorted(list(disease_corpus.keys()))
corpus_texts = [disease_corpus[d] for d in diseases]

vectorizer = TfidfVectorizer(ngram_range=(1, 2), stop_words='english')
tfidf_matrix = vectorizer.fit_transform(corpus_texts)

# 3. Predict on Unique Profiles
y_true = []
y_pred_top1 = []
y_pred_top3 = []
y_pred_top5 = []
latencies = []

for _, row in unique_cases.iterrows():
    true_d = row['disease']
    query = row['symptoms_text']
    
    t0 = time.perf_counter()
    vec = vectorizer.transform([query])
    sims = cosine_similarity(vec, tfidf_matrix).flatten()
    t1 = time.perf_counter()
    latencies.append((t1 - t0) * 1000.0)
    
    top_indices = sims.argsort()[::-1]
    top_diseases = [diseases[i] for i in top_indices]
    
    y_true.append(true_d)
    y_pred_top1.append(top_diseases[0])
    y_pred_top3.append(top_diseases[:3])
    y_pred_top5.append(top_diseases[:5])

# 4. Metrics Calculation
top1_acc = accuracy_score(y_true, y_pred_top1)
top3_acc = sum(true in top3 for true, top3 in zip(y_true, y_pred_top3)) / len(y_true)
top5_acc = sum(true in top5 for true, top5 in zip(y_true, y_pred_top5)) / len(y_true)

macro_f1 = f1_score(y_true, y_pred_top1, average='macro', zero_division=0)
weighted_f1 = f1_score(y_true, y_pred_top1, average='weighted', zero_division=0)
precision = precision_score(y_true, y_pred_top1, average='weighted', zero_division=0)
recall = recall_score(y_true, y_pred_top1, average='weighted', zero_division=0)
avg_latency_ms = np.mean(latencies)
p95_latency_ms = np.percentile(latencies, 95)

# 5. Unknown Symptom Rejection Test
unknown_tests = [
    "zyxwvu klmnopqr",
    "engine oil leaking rattling noise",
    "blue paint on wall",
    "completely unrelated non clinical words",
    ""
]
rejection_results = []
for u in unknown_tests:
    if not u.strip():
        rejection_results.append((u, "Empty input -> rejected (0 predictions)"))
        continue
    vec = vectorizer.transform([u])
    sims = cosine_similarity(vec, tfidf_matrix).flatten()
    max_sim = sims.max()
    rejected = max_sim < 0.08
    rejection_results.append((u, f"Max similarity: {max_sim*100:.2f}% -> Rejected: {rejected}"))

print("\n" + "=" * 65)
print("IN-SAMPLE RESUBSTITUTION SUMMARY — NOT HELD-OUT VALIDATION")
print("=" * 65)
print(f"Top-1 Accuracy : {top1_acc*100:6.2f}%")
print(f"Top-3 Accuracy : {top3_acc*100:6.2f}%")
print(f"Top-5 Accuracy : {top5_acc*100:6.2f}%")
print(f"Precision (Wgt): {precision*100:6.2f}%")
print(f"Recall (Wgt)   : {recall*100:6.2f}%")
print(f"Macro-F1       : {macro_f1*100:6.2f}%")
print(f"Weighted-F1    : {weighted_f1*100:6.2f}%")
print(f"Avg Latency    : {avg_latency_ms:6.2f} ms (p95: {p95_latency_ms:.2f} ms)")

print("\n" + "=" * 65)
print("UNKNOWN INPUT REJECTION BEHAVIOR")
print("=" * 65)
for q, res in rejection_results:
    print(f"  Input: '{q}' -> {res}")

output_report = {
    "evaluation_type": "IN-SAMPLE RESUBSTITUTION; corpus includes evaluated profiles",
    "held_out_performance": "NOT ESTABLISHED",
    "external_validation": "NOT ESTABLISHED",
    "calibration": "NOT ESTABLISHED",
    "num_classes": len(diseases),
    "unique_cases": len(unique_cases),
    "top1_accuracy": round(float(top1_acc * 100), 2),
    "top3_accuracy": round(float(top3_acc * 100), 2),
    "top5_accuracy": round(float(top5_acc * 100), 2),
    "macro_f1": round(float(macro_f1 * 100), 2),
    "weighted_f1": round(float(weighted_f1 * 100), 2),
    "precision_weighted": round(float(precision * 100), 2),
    "recall_weighted": round(float(recall * 100), 2),
    "avg_latency_ms": round(float(avg_latency_ms), 2),
    "p95_latency_ms": round(float(p95_latency_ms), 2),
    "clinical_status": "REAL-WORLD CLINICAL DIAGNOSTIC ACCURACY NOT ESTABLISHED"
}

with open("research/symptom_model_resubstitution_metrics.json", "x") as f:
    json.dump(output_report, f, indent=2)

print("\nIn-sample results saved to research/symptom_model_resubstitution_metrics.json (not held-out or clinical accuracy)")
