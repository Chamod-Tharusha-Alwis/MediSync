"""
MediSync Outbreak Detection Engine — Rigorous Simulation Evaluation Benchmark
Fixed seed, 1,200 simulated daily time series (60 days each), known ground truth.
Evaluates 2-gate EARS C2 detector with bootstrap 95% CIs, ROC curves, ablation, and figures.
"""

import os
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def run_evaluation():
    np.random.seed(42)
    n_series = 1200
    n_days = 60
    
    # 1. Simulate Series
    # 600 outbreak-injected series, 600 outbreak-free series
    y_true_outbreak = np.zeros(n_series, dtype=bool)
    series_data = []
    injection_metadata = []
    
    for i in range(n_series):
        # Baseline mean: varied Poisson rate across districts/diseases (1 to 15 cases/day)
        base_lambda = np.random.uniform(1.5, 12.0)
        # 7-day weekly seasonality factor
        day_of_week_factors = np.array([1.15, 1.10, 1.05, 1.00, 0.95, 0.85, 0.90])
        seasonality = np.tile(day_of_week_factors, int(np.ceil(n_days / 7)))[:n_days]
        daily_lambdas = base_lambda * seasonality
        
        counts = np.random.poisson(daily_lambdas).astype(float)
        
        is_positive = (i < n_series // 2)
        meta = {'injected': False, 'start': -1, 'duration': 0, 'magnitude': 0}
        
        if is_positive:
            y_true_outbreak[i] = True
            # Inject outbreak at day t0 between 25 and 48
            t0 = np.random.randint(25, 48)
            duration = np.random.randint(2, 8) # 2 to 7 days
            magnitude = np.random.uniform(2.5, 6.0) # 2.5x to 6x spike
            
            for d in range(duration):
                idx = t0 + d
                if idx < n_days:
                    spike_cases = np.random.poisson(daily_lambdas[idx] * magnitude)
                    counts[idx] = max(counts[idx], spike_cases)
            
            meta = {
                'injected': True,
                'start': t0,
                'duration': duration,
                'magnitude': magnitude
            }
        
        series_data.append(counts)
        injection_metadata.append(meta)
    
    # 2. Run Detector with 4 ablation configurations:
    # Config 1: Raw EARS C2 (z >= 2.0, baseline 7d, no floor, no persistence)
    # Config 2: Case Floor Only (z >= 2.0, count >= 5, no persistence)
    # Config 3: Persistence Only (z >= 2.0, 2 consecutive days, no floor)
    # Config 4: Full MediSync Detector (z >= 2.0, count >= 5, 2 consecutive days)
    
    def detect(series_counts, z_threshold=2.0, use_floor=True, use_persistence=True):
        n = len(series_counts)
        z_scores = np.zeros(n)
        for t in range(7, n):
            baseline = series_counts[t-7:t]
            mean_b = np.mean(baseline)
            std_b = np.std(baseline, ddof=1) if len(baseline) > 1 else 0
            if std_b < 0.5:
                std_b = 0.5 # Minimum variance floor
            z_scores[t] = (series_counts[t] - mean_b) / std_b
        
        triggered = False
        first_trigger_day = -1
        
        for t in range(7, n):
            c_today = series_counts[t]
            z_today = z_scores[t]
            
            cond_today = (z_today >= z_threshold)
            if use_floor:
                cond_today = cond_today and (c_today >= 5)
            
            if not use_persistence:
                if cond_today:
                    triggered = True
                    first_trigger_day = t
                    break
            else:
                c_prev = series_counts[t-1]
                z_prev = z_scores[t-1]
                cond_prev = (z_prev >= z_threshold)
                if use_floor:
                    cond_prev = cond_prev and (c_prev >= 5)
                
                if cond_today and cond_prev:
                    triggered = True
                    first_trigger_day = t
                    break
        
        return triggered, first_trigger_day, z_scores
    
    # Evaluate 4 configurations
    configs = {
        'Raw EARS C2': {'use_floor': False, 'use_persistence': False},
        'Floor Only (N >= 5)': {'use_floor': True, 'use_persistence': False},
        'Persistence Only (2-Day)': {'use_floor': False, 'use_persistence': True},
        'Dual-Gate (Floor + Persistence)': {'use_floor': True, 'use_persistence': True}
    }
    
    ablation_results = {}
    delays = []
    
    for name, cfg in configs.items():
        y_pred = np.zeros(n_series, dtype=bool)
        for i in range(n_series):
            trig, first_day, _ = detect(series_data[i], z_threshold=2.0, **cfg)
            y_pred[i] = trig
            if name == 'Dual-Gate (Floor + Persistence)' and trig and y_true_outbreak[i]:
                delay = first_day - injection_metadata[i]['start']
                delays.append(max(0, delay))
        
        tp = int(np.sum((y_pred == True) & (y_true_outbreak == True)))
        fp = int(np.sum((y_pred == True) & (y_true_outbreak == False)))
        tn = int(np.sum((y_pred == False) & (y_true_outbreak == False)))
        fn = int(np.sum((y_pred == False) & (y_true_outbreak == True)))
        
        sens = tp / (tp + fn) if (tp + fn) > 0 else 0
        spec = tn / (tn + fp) if (tn + fp) > 0 else 0
        prec = tp / (tp + fp) if (tp + fp) > 0 else 0
        f1 = 2 * (prec * sens) / (prec + sens) if (prec + sens) > 0 else 0
        
        # False alarms per year (scaled to 365 days, series length 60 days)
        fa_per_year = (fp / (n_series / 2)) * (365.0 / n_days)
        
        ablation_results[name] = {
            'tp': tp, 'fp': fp, 'tn': tn, 'fn': fn,
            'sensitivity': round(float(sens), 4),
            'specificity': round(float(spec), 4),
            'precision': round(float(prec), 4),
            'f1': round(float(f1), 4),
            'false_alarms_per_year': round(float(fa_per_year), 2)
        }
    
    # 3. Bootstrap 95% Confidence Intervals for Primary Detector (Dual-Gate)
    n_boot = 1000
    boot_sens, boot_spec, boot_prec = [], [], []
    primary_pred = np.zeros(n_series, dtype=bool)
    for i in range(n_series):
        trig, _, _ = detect(series_data[i], z_threshold=2.0, use_floor=True, use_persistence=True)
        primary_pred[i] = trig
    
    for _ in range(n_boot):
        sample_indices = np.random.choice(n_series, size=n_series, replace=True)
        y_t_samp = y_true_outbreak[sample_indices]
        y_p_samp = primary_pred[sample_indices]
        
        tp_b = np.sum((y_p_samp == True) & (y_t_samp == True))
        fp_b = np.sum((y_p_samp == True) & (y_t_samp == False))
        tn_b = np.sum((y_p_samp == False) & (y_t_samp == False))
        fn_b = np.sum((y_p_samp == False) & (y_t_samp == True))
        
        s = tp_b / (tp_b + fn_b) if (tp_b + fn_b) > 0 else 0
        sp = tn_b / (tn_b + fp_b) if (tn_b + fp_b) > 0 else 0
        p = tp_b / (tp_b + fp_b) if (tp_b + fp_b) > 0 else 0
        
        boot_sens.append(s)
        boot_spec.append(sp)
        boot_prec.append(p)
    
    ci_sens = [round(float(np.percentile(boot_sens, 2.5)), 4), round(float(np.percentile(boot_sens, 97.5)), 4)]
    ci_spec = [round(float(np.percentile(boot_spec, 2.5)), 4), round(float(np.percentile(boot_spec, 97.5)), 4)]
    ci_prec = [round(float(np.percentile(boot_prec, 2.5)), 4), round(float(np.percentile(boot_prec, 97.5)), 4)]
    
    delays_arr = np.array(delays)
    median_delay = float(np.median(delays_arr))
    iqr_delay = [float(np.percentile(delays_arr, 25)), float(np.percentile(delays_arr, 75))]
    
    # 4. ROC Curve over z-thresholds [1.0, 4.0]
    z_thresholds = np.linspace(1.0, 4.0, 31)
    tpr_list, fpr_list, prec_list = [], [], []
    for z in z_thresholds:
        preds = [detect(s, z_threshold=z, use_floor=True, use_persistence=True)[0] for s in series_data]
        preds = np.array(preds)
        tp = np.sum((preds == True) & (y_true_outbreak == True))
        fp = np.sum((preds == True) & (y_true_outbreak == False))
        tn = np.sum((preds == False) & (y_true_outbreak == False))
        fn = np.sum((preds == False) & (y_true_outbreak == True))
        tpr_list.append(tp / (tp + fn))
        fpr_list.append(fp / (fp + tn))
        prec_list.append(tp / (tp + fp) if (tp + fp) > 0 else 1.0)
    
    # Calculate AUC via trapezoidal rule
    sorted_indices = np.argsort(fpr_list)
    x_sorted = np.array(fpr_list)[sorted_indices]
    y_sorted = np.array(tpr_list)[sorted_indices]
    if hasattr(np, 'trapezoid'):
        roc_auc = float(np.trapezoid(y_sorted, x_sorted))
    else:
        from scipy.integrate import trapezoid
        roc_auc = float(trapezoid(y_sorted, x_sorted))
    
    # 5. Sensitivity Heatmap (Duration vs Magnitude)
    mag_bins = [(2.5, 3.5), (3.5, 4.5), (4.5, 6.0)]
    dur_bins = [(2, 3), (4, 5), (6, 7)]
    heatmap_matrix = np.zeros((len(dur_bins), len(mag_bins)))
    
    for r_idx, (d_min, d_max) in enumerate(dur_bins):
        for c_idx, (m_min, m_max) in enumerate(mag_bins):
            matches = [
                i for i in range(n_series // 2)
                if (d_min <= injection_metadata[i]['duration'] <= d_max) and
                   (m_min <= injection_metadata[i]['magnitude'] <= m_max)
            ]
            if len(matches) > 0:
                detected_count = sum(primary_pred[i] for i in matches)
                heatmap_matrix[r_idx, c_idx] = detected_count / len(matches)
            else:
                heatmap_matrix[r_idx, c_idx] = 1.0
    
    # 6. Generate Figures at 200 DPI
    fig_dir = "docs/report/figures/ml"
    os.makedirs(fig_dir, exist_ok=True)
    
    # Figure 1: Confusion Matrix
    plt.figure(figsize=(6, 5), dpi=200)
    cm = np.array([
        [ablation_results['Dual-Gate (Floor + Persistence)']['tn'], ablation_results['Dual-Gate (Floor + Persistence)']['fp']],
        [ablation_results['Dual-Gate (Floor + Persistence)']['fn'], ablation_results['Dual-Gate (Floor + Persistence)']['tp']]
    ])
    plt.imshow(cm, interpolation='nearest', cmap=plt.cm.Blues)
    plt.title('MediSync Outbreak Detector — Confusion Matrix (N=1,200)', fontsize=12, fontweight='bold')
    plt.colorbar(fraction=0.046, pad=0.04)
    tick_marks = np.arange(2)
    plt.xticks(tick_marks, ['No Outbreak', 'Outbreak'], fontsize=10)
    plt.yticks(tick_marks, ['No Outbreak', 'Outbreak'], fontsize=10)
    for i in range(2):
        for j in range(2):
            plt.text(j, i, f"{cm[i, j]:,}", horizontalalignment='center',
                     color='white' if cm[i, j] > cm.max() / 2 else 'black', fontsize=12, fontweight='bold')
    plt.ylabel('True Class', fontsize=11)
    plt.xlabel('Predicted Class', fontsize=11)
    plt.tight_layout()
    plt.savefig(os.path.join(fig_dir, 'fig1_confusion_matrix.png'))
    plt.close()
    
    # Figure 2: ROC Curve
    plt.figure(figsize=(6, 5), dpi=200)
    plt.plot(fpr_list, tpr_list, color='#2563eb', lw=2.5, label=f'Dual-Gate EARS C2 (AUC = {roc_auc:.3f})')
    plt.plot([0, 1], [0, 1], color='#94a3b8', lw=1.5, linestyle='--', label='Random Chance (AUC = 0.500)')
    # Highlight operating point z=2.0
    idx_2 = np.argmin(np.abs(z_thresholds - 2.0))
    plt.scatter([fpr_list[idx_2]], [tpr_list[idx_2]], color='#ef4444', s=80, zorder=5, label=f'Operating Point z=2.0 (Sens={tpr_list[idx_2]:.1%}, Spec={1-fpr_list[idx_2]:.1%})')
    plt.xlim([-0.02, 1.0])
    plt.ylim([0.0, 1.05])
    plt.xlabel('False Positive Rate (1 - Specificity)', fontsize=11)
    plt.ylabel('True Positive Rate (Sensitivity)', fontsize=11)
    plt.title('Outbreak Detection ROC Curve across z-Thresholds', fontsize=12, fontweight='bold')
    plt.legend(loc="lower right", fontsize=9)
    plt.grid(True, linestyle=':', alpha=0.6)
    plt.tight_layout()
    plt.savefig(os.path.join(fig_dir, 'fig2_roc_curve.png'))
    plt.close()
    
    # Figure 3: Detection Delay Histogram
    plt.figure(figsize=(6, 4.5), dpi=200)
    plt.hist(delays_arr, bins=np.arange(0, 8) - 0.5, rwidth=0.8, color='#0284c7', edgecolor='#0369a1')
    plt.axvline(median_delay, color='#ef4444', linestyle='--', lw=2, label=f'Median Delay = {median_delay:.1f} days')
    plt.xlabel('Detection Delay from Injected Onset (Days)', fontsize=11)
    plt.ylabel('Outbreak Count', fontsize=11)
    plt.title('Epidemiological Detection Latency Distribution', fontsize=12, fontweight='bold')
    plt.xticks(range(7))
    plt.legend(fontsize=10)
    plt.grid(True, linestyle=':', alpha=0.6)
    plt.tight_layout()
    plt.savefig(os.path.join(fig_dir, 'fig3_detection_delay_hist.png'))
    plt.close()
    
    # Figure 4: Sensitivity Heatmap (Magnitude vs Duration)
    plt.figure(figsize=(6, 5), dpi=200)
    plt.imshow(heatmap_matrix, cmap='YlGnBu', vmin=0.8, vmax=1.0)
    plt.colorbar(fraction=0.046, pad=0.04, label='Sensitivity (TPR)')
    plt.title('Detection Sensitivity by Outbreak Scale & Duration', fontsize=12, fontweight='bold')
    plt.xticks(range(len(mag_bins)), [f"{m[0]}-{m[1]}x" for m in mag_bins], fontsize=10)
    plt.yticks(range(len(dur_bins)), [f"{d[0]}-{d[1]} days" for d in dur_bins], fontsize=10)
    for r in range(len(dur_bins)):
        for c in range(len(mag_bins)):
            plt.text(c, r, f"{heatmap_matrix[r, c]:.1%}", ha='center', va='center',
                     color='white' if heatmap_matrix[r, c] > 0.95 else 'black', fontweight='bold', fontsize=11)
    plt.xlabel('Outbreak Surge Magnitude (Baseline Multiplier)', fontsize=11)
    plt.ylabel('Outbreak Duration Window', fontsize=11)
    plt.tight_layout()
    plt.savefig(os.path.join(fig_dir, 'fig4_sensitivity_heatmap.png'))
    plt.close()
    
    # Figure 5: Gate Ablation Comparison
    plt.figure(figsize=(7, 4.5), dpi=200)
    cfg_names = list(ablation_results.keys())
    prec_vals = [ablation_results[k]['precision'] * 100 for k in cfg_names]
    fa_vals = [ablation_results[k]['false_alarms_per_year'] for k in cfg_names]
    
    x_pos = np.arange(len(cfg_names))
    width = 0.38
    
    fig, ax1 = plt.subplots(figsize=(7.5, 4.5), dpi=200)
    rects1 = ax1.bar(x_pos - width/2, prec_vals, width, label='Precision (%)', color='#2563eb')
    ax1.set_ylabel('Precision (%)', color='#2563eb', fontsize=11)
    ax1.set_ylim(0, 110)
    ax1.tick_params(axis='y', labelcolor='#2563eb')
    ax1.set_xticks(x_pos)
    ax1.set_xticklabels(['Raw EARS', 'Floor Only', 'Persistence Only', 'Dual-Gate (MediSync)'], fontsize=9, fontweight='bold')
    
    ax2 = ax1.twinx()
    rects2 = ax2.bar(x_pos + width/2, fa_vals, width, label='False Alarms/Year', color='#ef4444')
    ax2.set_ylabel('False Alarms / Simulated Year', color='#ef4444', fontsize=11)
    ax2.tick_params(axis='y', labelcolor='#ef4444')
    ax2.set_ylim(0, max(fa_vals) * 1.25)
    
    plt.title('Ablation Study: Contribution of Floor & Persistence Gates', fontsize=12, fontweight='bold')
    fig.tight_layout()
    plt.savefig(os.path.join(fig_dir, 'fig5_gate_ablation.png'))
    plt.close()
    
    output = {
        'simulation': {
            'n_series': n_series,
            'n_days': n_days,
            'random_seed': 42,
            'positive_count': n_series // 2,
            'negative_count': n_series // 2
        },
        'primary_detector': {
            'name': 'Dual-Gate (Floor + Persistence)',
            'metrics': ablation_results['Dual-Gate (Floor + Persistence)'],
            'bootstrap_95ci': {
                'sensitivity': ci_sens,
                'specificity': ci_spec,
                'precision': ci_prec
            },
            'detection_delay': {
                'median_days': median_delay,
                'iqr_days': iqr_delay
            },
            'roc_auc': round(roc_auc, 4)
        },
        'ablation': ablation_results
    }
    
    return output

if __name__ == '__main__':
    res = run_evaluation()
    print(json.dumps(res, indent=2))
