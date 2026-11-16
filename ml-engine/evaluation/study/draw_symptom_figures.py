"""Phase C figures from study_results.json (offline study, not in production). Needs matplotlib.

Usage:  python ml-engine/evaluation/study/draw_symptom_figures.py
"""
from study_common import RESULTS_PATH, STUDY_LABEL, read_json, save_figure


def draw_eda(test_counts, evidences_per_patient, classes):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(8.2, 4.2), gridspec_kw={'width_ratios': [3, 2]})
    names = sorted(test_counts, key=lambda c: -test_counts[c])
    axes[0].bar(range(len(names)), [test_counts[c] for c in names])
    axes[0].set_xticks(range(len(names)), names, rotation=90, fontsize=5)
    axes[0].set_ylabel('Rows in the test sample')
    axes[0].set_title('Class balance (test sample, capped per class)', fontsize=8)
    axes[1].hist(evidences_per_patient, bins=30)
    axes[1].set_xlabel('Evidences per patient')
    axes[1].set_ylabel('Patients')
    axes[1].set_title('Evidences per patient (test sample)', fontsize=8)
    fig.suptitle(f'DDXPlus exploratory view ({STUDY_LABEL}; synthetic, rule-generated data)', fontsize=9)
    save_figure(fig, 'ddxplus_eda.png')


def draw_comparison(results):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    models = list(results)
    fig, ax = plt.subplots(figsize=(8.2, 4.2))
    width = 0.8 / 4
    for i, (key, label) in enumerate((('top1', 'Top-1'), ('top3', 'Top-3'), ('top5', 'Top-5'), ('macroF1', 'Macro F1'))):
        values = [results[m][key]['accuracy'] if key != 'macroF1' else results[m][key]['value'] for m in models]
        lows = [v - results[m][key]['ci95'][0] for v, m in zip(values, models)]
        highs = [results[m][key]['ci95'][1] - v for v, m in zip(values, models)]
        ax.bar([x + (i - 1.5) * width for x in range(len(models))], values, width, yerr=[lows, highs], capsize=2, label=label)
    ax.set_xticks(range(len(models)), models, rotation=20, fontsize=7)
    ax.set_ylim(0, 1.05)
    ax.set_ylabel('Score on the DDXPlus test sample')
    ax.legend(fontsize=7, ncol=4)
    ax.set_title(f'Production engine vs shadow models on DDXPlus ({STUDY_LABEL}; synthetic data, 95% bootstrap intervals)', fontsize=8)
    save_figure(fig, 'symptom_model_comparison.png')


def draw_calibration(results):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(6, 5))
    ax.plot([0, 1], [0, 1], '--', color='gray', linewidth=0.8, label='Perfect calibration')
    for model, block in results.items():
        cal = block.get('calibration')
        if cal:
            ax.plot([c['meanConfidence'] for c in cal['reliability']], [c['accuracy'] for c in cal['reliability']], marker='o', markersize=3,
                    label=f"{model} (Brier {cal['brierMulticlass']:.3f}, ECE {cal['ece']:.3f})")
    ax.set_xlabel('Mean top-1 probability in bin')
    ax.set_ylabel('Observed top-1 accuracy in bin')
    ax.legend(fontsize=7)
    ax.set_title(f'Reliability curves on the DDXPlus test sample ({STUDY_LABEL})', fontsize=8)
    save_figure(fig, 'symptom_calibration.png')


def draw_importance(importance, best_model):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    top = importance['top'][::-1]
    fig, ax = plt.subplots(figsize=(8.2, 5))
    ax.barh(range(len(top)), [t['importanceMean'] for t in top], xerr=[t['importanceSd'] for t in top], capsize=2)
    ax.set_yticks(range(len(top)), [t['text'][:70] for t in top], fontsize=6)
    ax.set_xlabel('Drop in macro F1 when the feature is permuted (validation subsample)')
    ax.set_title(f'Permutation importance, {best_model} ({STUDY_LABEL}; top {len(top)} features)', fontsize=8)
    save_figure(fig, 'symptom_feature_importance.png')



def main():
    c = read_json(RESULTS_PATH)['phaseC']
    draw_eda(c['eda']['testClassCounts'], c['eda']['testEvidencesPerPatient'], None)
    draw_comparison(c['models'])
    draw_calibration(c['models'])
    draw_importance(c['permutationImportance'], c['bestModelByTestMacroF1'])
    print('phase C figures written')


if __name__ == '__main__':
    main()
