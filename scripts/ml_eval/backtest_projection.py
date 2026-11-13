"""
MediSync 14-Day Outbreak Projection Backtest
Rolling-origin backtesting against Naive Baselines (Last Value, 7-Day Mean).
Evaluates MAE, RMSE, and 95% Prediction Interval Empirical Coverage across horizons 1, 3, 7, 14 days.
"""

import os
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def run_backtest():
    np.random.seed(42)
    n_series = 200
    series_len = 60
    horizons = [1, 3, 7, 14]
    
    # Simulate realistic epidemiological trends:
    # Blend of growing epidemic curves, flat baselines, and decelerating curves
    series_list = []
    for _ in range(n_series):
        # 40% trending up, 30% flat/stable, 30% noisy
        curve_type = np.random.choice(['trending', 'stable', 'noisy'])
        base = np.random.uniform(5, 20)
        t = np.arange(series_len)
        
        if curve_type == 'trending':
            slope = np.random.uniform(0.3, 1.2)
            noise = np.random.normal(0, 1.5, series_len)
            counts = np.maximum(0, np.round(base + slope * t + noise))
        elif curve_type == 'stable':
            noise = np.random.normal(0, 2.0, series_len)
            counts = np.maximum(0, np.round(base + noise))
        else:
            noise = np.random.normal(0, 3.5, series_len)
            counts = np.maximum(0, np.round(base + 0.1 * t + noise))
        
        series_list.append(counts)
    
    # Rolling origin evaluation
    # Train window: 28 days (t=0..27), Origin shifts from t=28 to t=45
    origins = list(range(28, 46))
    
    errors = {
        'OLS': {h: [] for h in horizons},
        'Naive_Last': {h: [] for h in horizons},
        'Naive_Mean7': {h: [] for h in horizons}
    }
    coverage_counts = {h: {'inside': 0, 'total': 0} for h in horizons}
    
    for s in series_list:
        for orig in origins:
            # Historical training data up to origin
            train_y = s[:orig]
            train_x = np.arange(len(train_y))
            n_train = len(train_y)
            x_mean = np.mean(train_x)
            y_mean = np.mean(train_y)
            
            # OLS fit
            num = np.sum((train_x - x_mean) * (train_y - y_mean))
            den = np.sum((train_x - x_mean) ** 2)
            slope = num / den if den > 0 else 0
            intercept = y_mean - slope * x_mean
            
            residuals = train_y - (slope * train_x + intercept)
            df = max(1, n_train - 2)
            se = np.sqrt(np.sum(residuals ** 2) / df)
            # Student's t critical value for df >= 26 is ~2.056
            t_crit = 2.056
            
            # Naive models
            naive_last = train_y[-1]
            naive_mean7 = np.mean(train_y[-7:])
            
            for h in horizons:
                target_idx = orig + h - 1
                if target_idx < len(s):
                    actual = s[target_idx]
                    
                    # OLS prediction
                    pred_ols = max(0, slope * (n_train - 1 + h) + intercept)
                    
                    # Prediction variance & interval
                    future_x = (n_train - 1) + h
                    se_pred = se * np.sqrt(1 + 1/n_train + ((future_x - x_mean) ** 2) / den)
                    margin = t_crit * se_pred
                    lower = max(0, pred_ols - margin)
                    upper = pred_ols + margin
                    
                    errors['OLS'][h].append(actual - pred_ols)
                    errors['Naive_Last'][h].append(actual - naive_last)
                    errors['Naive_Mean7'][h].append(actual - naive_mean7)
                    
                    coverage_counts[h]['total'] += 1
                    if lower <= actual <= upper:
                        coverage_counts[h]['inside'] += 1
    
    # Calculate MAE, RMSE and Coverage
    results = {}
    for h in horizons:
        results[f"{h}d"] = {
            'OLS_MAE': round(float(np.mean(np.abs(errors['OLS'][h]))), 2),
            'OLS_RMSE': round(float(np.sqrt(np.mean(np.array(errors['OLS'][h]) ** 2))), 2),
            'Naive_Last_MAE': round(float(np.mean(np.abs(errors['Naive_Last'][h]))), 2),
            'Naive_Last_RMSE': round(float(np.sqrt(np.mean(np.array(errors['Naive_Last'][h]) ** 2))), 2),
            'Naive_Mean7_MAE': round(float(np.mean(np.abs(errors['Naive_Mean7'][h]))), 2),
            'Naive_Mean7_RMSE': round(float(np.sqrt(np.mean(np.array(errors['Naive_Mean7'][h]) ** 2))), 2),
            'Coverage_95Pct': round(float((coverage_counts[h]['inside'] / coverage_counts[h]['total']) * 100), 1)
        }
    
    # Generate Figures
    fig_dir = "docs/report/figures/ml"
    os.makedirs(fig_dir, exist_ok=True)
    
    # Figure 6: MAE Comparison Across Horizons
    plt.figure(figsize=(7, 4.5), dpi=200)
    x = np.arange(len(horizons))
    width = 0.25
    
    mae_ols = [results[f"{h}d"]['OLS_MAE'] for h in horizons]
    mae_last = [results[f"{h}d"]['Naive_Last_MAE'] for h in horizons]
    mae_mean7 = [results[f"{h}d"]['Naive_Mean7_MAE'] for h in horizons]
    
    plt.bar(x - width, mae_ols, width, label='OLS Linear Trend', color='#2563eb')
    plt.bar(x, mae_mean7, width, label='Naive 7-Day Mean', color='#059669')
    plt.bar(x + width, mae_last, width, label='Naive Last Observed', color='#d97706')
    
    plt.xlabel('Forecast Horizon (Days)', fontsize=11)
    plt.ylabel('Mean Absolute Error (Cases)', fontsize=11)
    plt.title('Projection Error Comparison: OLS vs Naive Baselines', fontsize=12, fontweight='bold')
    plt.xticks(x, [f"{h}-Day" for h in horizons], fontsize=10)
    plt.legend(fontsize=9)
    plt.grid(True, linestyle=':', alpha=0.6, axis='y')
    plt.tight_layout()
    plt.savefig(os.path.join(fig_dir, 'fig6_projection_backtest_errors.png'))
    plt.close()
    
    # Figure 7: Prediction Interval Empirical Coverage
    plt.figure(figsize=(6, 4.2), dpi=200)
    covs = [results[f"{h}d"]['Coverage_95Pct'] for h in horizons]
    bars = plt.bar([f"{h}d" for h in horizons], covs, color='#6366f1', width=0.5)
    plt.axhline(95.0, color='#ef4444', linestyle='--', lw=2, label='Nominal 95% Confidence Line')
    plt.ylim([80, 100])
    plt.xlabel('Forecast Horizon', fontsize=11)
    plt.ylabel('Empirical Coverage (%)', fontsize=11)
    plt.title('95% Prediction Interval Empirical Coverage Calibration', fontsize=12, fontweight='bold')
    for b, c_val in zip(bars, covs):
        plt.text(b.get_x() + b.get_width()/2, c_val + 0.6, f"{c_val:.1f}%", ha='center', fontweight='bold', fontsize=10)
    plt.legend(fontsize=9, loc='lower right')
    plt.grid(True, linestyle=':', alpha=0.6, axis='y')
    plt.tight_layout()
    plt.savefig(os.path.join(fig_dir, 'fig7_prediction_band_coverage.png'))
    plt.close()
    
    return results

if __name__ == '__main__':
    res = run_backtest()
    print(json.dumps(res, indent=2))
