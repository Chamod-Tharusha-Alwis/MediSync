"""Draw the evaluation figures from evaluation_results.json.

The figures contain no numbers of their own: every value is read from the results file written by
the run_*.py scripts. Figures are sized to fit A4 portrait.

Usage:  python ml-engine/evaluation/make_figures.py
"""
import datetime as dt
import os

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

from eval_common import EVAL_DIR, RESULTS_PATH, read_json

PAGE_WIDTH_IN = 8.2
DPI = 200
SMALL, TINY = 7, 6
NOTE = 'Engineering benchmark on public data, not clinical validation'
PNG_METADATA = {'Software': None}
PERCENT = 100
LABEL_OFFSET = 0.01


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
    ax.set_title(f'Symptom engine on gretelai test split: top-1 confusion matrix (n = {int(matrix.sum())})\n{NOTE}', fontsize=9)
    fig.colorbar(image, ax=ax, fraction=0.04, label='Test rows')
    save(fig, 'confusion_matrix_symptoms.png')


def accuracy_vs_baselines(block, title, filename):
    systems = [('MediSync engine', block['allRows'])] + [(entry['label'], entry) for entry in block['baselines'].values()]
    ks = sorted(int(key[3:]) for key in block['allRows'] if key.startswith('top'))
    fig, ax = plt.subplots(figsize=(PAGE_WIDTH_IN, PAGE_WIDTH_IN * 0.52))
    width = 0.8 / len(systems)
    top = 0
    for s, (label, entry) in enumerate(systems):
        values = [entry[f'top{k}']['accuracy'] * PERCENT for k in ks]
        lows = [(entry[f'top{k}']['accuracy'] - entry[f'top{k}']['ci95'][0]) * PERCENT for k in ks]
        highs = [(entry[f'top{k}']['ci95'][1] - entry[f'top{k}']['accuracy']) * PERCENT for k in ks]
        positions = [i + (s - (len(systems) - 1) / 2) * width for i in range(len(ks))]
        bars = ax.bar(positions, values, width, yerr=[lows, highs], capsize=2, label=label)
        for bar, value, high in zip(bars, values, highs):
            ax.text(bar.get_x() + bar.get_width() / 2, value + high + 1, f'{value:.1f}', ha='center', va='bottom', fontsize=TINY)
            top = max(top, value + high)
    ax.set_xticks(range(len(ks)), [f'Top-{k}' for k in ks])
    ax.set_ylabel('Accuracy on all evaluated rows (%)')
    ax.set_ylim(0, min(PERCENT, top * 1.25 + 5))
    ax.set_title(f'{title} (n = {block["allRows"]["top1"]["n"]} rows; error bars are 95% bootstrap intervals)\n{NOTE}', fontsize=9)
    ax.legend(fontsize=SMALL, ncol=2, loc='upper left')
    save(fig, filename)


def per_class_f1(symptoms):
    report = symptoms['allRows']['perDiagnosis']
    ordered = sorted(report, key=lambda label: (report[label]['f1'], label))
    values = [report[label]['f1'] for label in ordered]
    fig, ax = plt.subplots(figsize=(PAGE_WIDTH_IN, PAGE_WIDTH_IN * 0.78))
    ax.barh(range(len(ordered)), values)
    ax.set_yticks(range(len(ordered)), [f"{label} (n={report[label]['support']})" for label in ordered], fontsize=SMALL)
    for i, value in enumerate(values):
        ax.text(value + LABEL_OFFSET, i, f'{value:.2f}', va='center', fontsize=SMALL)
    ax.set_xlim(0, 1.08)
    ax.set_xlabel('F1 score of the top-1 prediction')
    ax.set_ylabel('Dataset diagnosis (test rows)')
    ax.set_title(f'Symptom engine on gretelai test split: per-diagnosis F1 (macro F1 = {symptoms["allRows"]["macroF1"]:.3f})\n{NOTE}', fontsize=9)
    save(fig, 'per_class_f1.png')


def score_figure(calibration, results):
    fig, axes = plt.subplots(2, 2, figsize=(PAGE_WIDTH_IN, PAGE_WIDTH_IN * 0.75))
    for col, (section, name) in enumerate((('symptomBenchmark', 'gretelai test split'), ('ddxplusBenchmark', 'DDXPlus test sample'))):
        rows = [r for r in results[section]['rows'] if r['top5']]
        correct = [r['top5'][0]['confidence'] for r in rows if r['hitTop1']]
        wrong = [r['top5'][0]['confidence'] for r in rows if not r['hitTop1']]
        ax = axes[0, col]
        ax.boxplot([correct, wrong], tick_labels=[f'correct (n={len(correct)})', f'wrong (n={len(wrong)})'], orientation='horizontal')
        ax.set_xlabel('Top-1 score (not a probability)')
        ax.set_title(f'{name}: score when right vs wrong', fontsize=8)
        bands = calibration['testSets'][section]['accuracyByScoreBand']
        ax = axes[1, col]
        labels = [b['band'] for b in bands]
        values = [(b['accuracy'] or 0) * PERCENT for b in bands]
        errors = [[(b['accuracy'] - b['ci95'][0]) * PERCENT if b['ci95'] else 0 for b in bands],
                  [(b['ci95'][1] - b['accuracy']) * PERCENT if b['ci95'] else 0 for b in bands]]
        ax.bar(range(len(bands)), values, yerr=errors, capsize=2)
        for i, b in enumerate(bands):
            ax.text(i, 1, f"n={b['rows']}", ha='center', va='bottom', fontsize=TINY)
        ax.set_xticks(range(len(bands)), labels, fontsize=SMALL)
        ax.set_xlabel('Top-1 score band')
        ax.set_ylabel('Top-1 accuracy (%)')
        ax.set_ylim(0, PERCENT)
        ax.set_title(f'{name}: accuracy by band', fontsize=8)
    fig.suptitle(f'Similarity scores are not probabilities\n{NOTE}', fontsize=9)
    save(fig, 'score_by_correctness.png')


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
            ax.text(c, r, int(matrix[r, c]), ha='center', va='center', fontsize=12, color='white' if matrix[r, c] > peak / 2 else 'black')
    ax.set_xlabel('Checker result')
    ax.set_ylabel('Reference (FDA label)')
    metrics = interactions['metrics']
    ax.set_title(f'Interaction checker: {int(matrix.sum())} reference pairs '
                 f"(sensitivity {metrics['sensitivity']['value'] * PERCENT:.1f}%, specificity {metrics['specificity']['value'] * PERCENT:.1f}%)\n{NOTE}", fontsize=8)
    save(fig, 'interaction_confusion.png')


def outbreak_detector(backtest):
    weeks = backtest['detector']['weeks']
    dates = [dt.date.fromisoformat(w['week']) for w in weeks]
    counts = [w['count'] for w in weeks]
    fig, ax = plt.subplots(figsize=(PAGE_WIDTH_IN, PAGE_WIDTH_IN * 0.45))
    ax.plot(dates, counts, linewidth=0.8, label='Weekly dengue cases (OpenDengue, Sri Lanka)')
    flagged = [(d, c) for d, c, w in zip(dates, counts, weeks) if w['flag']]
    ax.scatter([d for d, _ in flagged], [c for _, c in flagged], s=8, color='tab:red', label='Detector flag', zorder=3)
    for i, period in enumerate(p for p in backtest['detector']['referencePeriods'] if p['evaluable']):
        ax.axvspan(dt.date.fromisoformat(period['start']), dt.date.fromisoformat(period['end']), color='tab:orange', alpha=0.2,
                   label='Reference outbreak period' if i == 0 else None)
    ax.set_xlabel('Week')
    ax.set_ylabel('Cases per week')
    ax.legend(fontsize=SMALL, loc='upper left')
    ax.set_title(f'Outbreak detector back-test on public national counts ({len(weeks)} evaluated weeks)\n'
                 'Tests the algorithm, not MediSync data; not clinical validation', fontsize=9)
    save(fig, 'outbreak_detector_backtest.png')


def projection_errors(backtest):
    by_h = backtest['projection']['byHorizon']
    horizons = sorted(by_h, key=lambda h: int(h[1:]))
    methods = [('projection', 'MediSync projection'), ('lastValue', 'Last value'), ('seasonalNaive', 'Seasonal naive')]
    fig, axes = plt.subplots(1, 2, figsize=(PAGE_WIDTH_IN, PAGE_WIDTH_IN * 0.42))
    width = 0.8 / len(methods)
    for m, (key, label) in enumerate(methods):
        values = [by_h[h]['mae'][key]['value'] for h in horizons]
        errors = [[by_h[h]['mae'][key]['value'] - by_h[h]['mae'][key]['ci95'][0] for h in horizons],
                  [by_h[h]['mae'][key]['ci95'][1] - by_h[h]['mae'][key]['value'] for h in horizons]]
        axes[0].bar([i + (m - 1) * width for i in range(len(horizons))], values, width, yerr=errors, capsize=2, label=label)
    axes[0].set_xticks(range(len(horizons)), [f'{h[1:]} wk' for h in horizons])
    axes[0].set_xlabel('Forecast horizon')
    axes[0].set_ylabel('Mean absolute error (cases per week)')
    axes[0].legend(fontsize=SMALL)
    axes[0].set_title('Error by horizon (95% block bootstrap)', fontsize=8)
    coverage = [by_h[h]['intervalCoverage']['value'] * PERCENT for h in horizons]
    nominal = by_h[horizons[0]]['intervalCoverage']['nominalPercent']
    axes[1].bar(range(len(horizons)), coverage)
    axes[1].axhline(nominal, color='black', linestyle='--', linewidth=0.8, label=f'Nominal {nominal}%')
    axes[1].set_xticks(range(len(horizons)), [f'{h[1:]} wk' for h in horizons])
    axes[1].set_ylim(0, PERCENT)
    axes[1].set_xlabel('Forecast horizon')
    axes[1].set_ylabel('Targets inside the interval (%)')
    axes[1].legend(fontsize=SMALL)
    axes[1].set_title('Projection interval coverage', fontsize=8)
    fig.suptitle('Projection back-test on OpenDengue Sri Lanka weekly counts\nTests the algorithm, not MediSync data; not clinical validation', fontsize=9)
    save(fig, 'projection_backtest.png')


def main():
    results = read_json(RESULTS_PATH)
    symptom_confusion(results['symptomBenchmark'])
    accuracy_vs_baselines(results['symptomBenchmark'], 'Symptom engine vs baselines, gretelai test split', 'symptom_accuracy_vs_baselines.png')
    accuracy_vs_baselines(results['ddxplusBenchmark'], 'Symptom engine vs baselines, DDXPlus test sample', 'ddxplus_accuracy_vs_baselines.png')
    per_class_f1(results['symptomBenchmark'])
    score_figure(results['calibration'], results)
    interaction_confusion(results['interactionBenchmark'])
    outbreak_detector(results['outbreakBacktest'])
    projection_errors(results['outbreakBacktest'])
    print('figures written to', EVAL_DIR)


if __name__ == '__main__':
    main()
