"""Draw the evaluation figures from evaluation_results.json.

The figures contain no numbers of their own: every value is read from the results file
written by run_symptom_benchmark.py and run_interaction_benchmark.py.

Usage:  python ml-engine/evaluation/make_figures.py
"""
import os

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

from eval_common import EVAL_DIR, RESULTS_PATH, read_json

PAGE_WIDTH_IN = 8.2   # fits inside A4 portrait
DPI = 200
SMALL, TINY = 7, 6
NOTE = 'Engineering benchmark, not clinical validation'
PNG_METADATA = {'Software': None}


def save(fig, name):
    fig.tight_layout()
    fig.savefig(os.path.join(EVAL_DIR, name), dpi=DPI, metadata=PNG_METADATA)
    plt.close(fig)


def annotate_cells(ax, matrix, fontsize):
    peak = matrix.max()
    for r in range(matrix.shape[0]):
        for c in range(matrix.shape[1]):
            if matrix[r, c]:
                ax.text(c, r, int(matrix[r, c]), ha='center', va='center', fontsize=fontsize,
                        color='white' if matrix[r, c] > peak / 2 else 'black')


def symptom_confusion(symptoms):
    block = symptoms['confusionMatrixTop1']
    rows, columns, matrix = block['rowsAreReferenceDiagnoses'], block['columnsArePredictions'], np.array(block['counts'])
    fig, ax = plt.subplots(figsize=(PAGE_WIDTH_IN, PAGE_WIDTH_IN * 0.93))
    image = ax.imshow(matrix, cmap='Blues')
    ax.set_xticks(range(len(columns)), columns, rotation=90, fontsize=SMALL)
    ax.set_yticks(range(len(rows)), rows, fontsize=SMALL)
    annotate_cells(ax, matrix, TINY)
    ax.set_xlabel('Engine top-1 prediction (mapped to dataset diagnosis)')
    ax.set_ylabel('Dataset diagnosis (reference label)')
    ax.set_title(f'Symptom engine: top-1 confusion matrix (n = {int(matrix.sum())} test rows)\n{NOTE}', fontsize=9)
    fig.colorbar(image, ax=ax, fraction=0.04, label='Test rows')
    save(fig, 'confusion_matrix_symptoms.png')


def accuracy_vs_baselines(symptoms):
    systems = [('MediSync engine', symptoms['allRows'])] + [(entry['label'], entry) for entry in symptoms['baselines'].values()]
    ks = sorted(int(key[3:]) for key in symptoms['allRows'] if key.startswith('top'))
    fig, ax = plt.subplots(figsize=(PAGE_WIDTH_IN, PAGE_WIDTH_IN * 0.52))
    width = 0.8 / len(systems)
    for s, (label, entry) in enumerate(systems):
        values = [entry[f'top{k}']['accuracy'] * 100 for k in ks]
        lows = [(entry[f'top{k}']['accuracy'] - entry[f'top{k}']['ci95'][0]) * 100 for k in ks]
        highs = [(entry[f'top{k}']['ci95'][1] - entry[f'top{k}']['accuracy']) * 100 for k in ks]
        positions = [i + (s - (len(systems) - 1) / 2) * width for i in range(len(ks))]
        bars = ax.bar(positions, values, width, yerr=[lows, highs], capsize=2, label=label)
        for bar, value, high in zip(bars, values, highs):
            ax.text(bar.get_x() + bar.get_width() / 2, value + high + 1, f'{value:.1f}', ha='center', va='bottom', fontsize=TINY)
    ax.set_xticks(range(len(ks)), [f'Top-{k}' for k in ks])
    ax.set_ylabel('Accuracy on test rows (%)')
    ax.set_ylim(0, 100)
    ax.set_title(f'Symptom engine vs baselines (n = {symptoms["allRows"]["top1"]["n"]} rows; error bars are 95% bootstrap intervals)\n{NOTE}', fontsize=9)
    ax.legend(fontsize=SMALL, ncol=2, loc='upper left')
    save(fig, 'symptom_accuracy_vs_baselines.png')


def per_class_f1(symptoms):
    report = symptoms['allRows']['perDiagnosis']
    ordered = sorted(report, key=lambda label: (report[label]['f1'], label))
    values = [report[label]['f1'] for label in ordered]
    fig, ax = plt.subplots(figsize=(PAGE_WIDTH_IN, PAGE_WIDTH_IN * 0.78))
    ax.barh(range(len(ordered)), values)
    ax.set_yticks(range(len(ordered)), [f"{label} (n={report[label]['support']})" for label in ordered], fontsize=SMALL)
    for i, value in enumerate(values):
        ax.text(value + 0.01, i, f'{value:.2f}', va='center', fontsize=SMALL)
    ax.set_xlim(0, 1.08)
    ax.set_xlabel('F1 score of the top-1 prediction')
    ax.set_ylabel('Dataset diagnosis (test rows)')
    ax.set_title(f'Symptom engine: per-diagnosis F1 (macro F1 = {symptoms["allRows"]["macroF1"]:.3f})\n{NOTE}', fontsize=9)
    save(fig, 'per_class_f1.png')


def interaction_confusion(interactions):
    block = interactions['confusionMatrix']
    matrix = np.array(block['counts'])
    fig, ax = plt.subplots(figsize=(PAGE_WIDTH_IN * 0.8, PAGE_WIDTH_IN * 0.42))
    ax.imshow(matrix, cmap='Blues')
    ax.set_xticks(range(len(block['columns'])), [c.replace('checker: ', '') for c in block['columns']])
    ax.set_yticks(range(len(block['rows'])), [r.replace('reference: ', '') for r in block['rows']])
    peak = matrix.max()
    for r in range(matrix.shape[0]):
        for c in range(matrix.shape[1]):
            ax.text(c, r, int(matrix[r, c]), ha='center', va='center', fontsize=12,
                    color='white' if matrix[r, c] > peak / 2 else 'black')
    ax.set_xlabel('Checker result')
    ax.set_ylabel('Reference (FDA label)')
    metrics = interactions['metrics']
    ax.set_title(f'Interaction checker: {int(matrix.sum())} reference pairs '
                 f"(sensitivity {metrics['sensitivity']['value'] * 100:.1f}%, specificity {metrics['specificity']['value'] * 100:.1f}%)\n{NOTE}", fontsize=9)
    save(fig, 'interaction_confusion.png')


def main():
    results = read_json(RESULTS_PATH)
    symptom_confusion(results['symptomBenchmark'])
    accuracy_vs_baselines(results['symptomBenchmark'])
    per_class_f1(results['symptomBenchmark'])
    interaction_confusion(results['interactionBenchmark'])
    print('4 figures written to', EVAL_DIR)


if __name__ == '__main__':
    main()
