"""Phase A: forecast benchmark on OpenDengue Sri Lanka weekly counts (offline study, not in production).

Follows docs/report/study/PROTOCOL.md, Phase A. Rolling-origin expanding window, no shuffling. The production
projection is the real server function called through ml-engine/evaluation/outbreak_bridge.cjs.

Usage:  python ml-engine/evaluation/study/forecast_benchmark.py
"""
import itertools
import json
import logging
import os
import subprocess
import warnings

import numpy as np

from study_common import (BLOCK_WEEKS, EVAL_DIR, OUT_DIR, SEED, STUDY_LABEL, block_bootstrap_mean_ci, rounded,
                          run_record, save_figure, update_study_results, write_csv)
from run_outbreak_backtest import build_segments, load_weeks

BRIDGE_PATH = os.path.join(EVAL_DIR, 'outbreak_bridge.cjs')
MAX_IMPUTED_WEEKS = 3
INITIAL_TRAINING_WEEKS = 156
ORIGIN_STEP = 2
HORIZONS = (1, 2, 4)
SEASON = 52
PRODUCTION_TRAINING_WEEKS = 14
SARIMA_GRID = {'p': (0, 1, 2), 'd': (0, 1), 'q': (0, 1, 2), 'seasonal': ((0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 1, 1))}
PROPHET_SETTINGS = dict(growth='linear', yearly_seasonality=True, weekly_seasonality=False, daily_seasonality=False,
                        seasonality_mode='multiplicative', changepoint_prior_scale=0.05, interval_width=0.95)
MODELS = ('naive', 'seasonalNaive', 'productionProjection', 'ets', 'sarima', 'prophet')
COMPARISONS = (('prophet', 'sarima'), ('prophet', 'productionProjection'))

warnings.filterwarnings('ignore')
logging.getLogger('cmdstanpy').setLevel(logging.ERROR)
logging.getLogger('prophet').setLevel(logging.ERROR)


# ---------------------------------------------------------------- models
def fit_sarima_order(y_log):
    """AIC order selection on the initial training window only (protocol Phase A)."""
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    best = None
    for p, d, q, (P, D, Q) in itertools.product(SARIMA_GRID['p'], SARIMA_GRID['d'], SARIMA_GRID['q'], SARIMA_GRID['seasonal']):
        try:
            result = SARIMAX(y_log, order=(p, d, q), seasonal_order=(P, D, Q, SEASON)).fit(disp=False)
            aic = float(result.aic)
        except Exception:
            continue
        if np.isfinite(aic) and (best is None or aic < best[0]):
            best = (aic, (p, d, q), (P, D, Q, SEASON))
    return best


def forecast_sarima(y_log, order, seasonal_order, steps):
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    result = SARIMAX(y_log, order=order, seasonal_order=seasonal_order).fit(disp=False)
    return np.maximum(np.expm1(np.asarray(result.forecast(steps))), 0)


def forecast_ets(y_log, steps):
    from statsmodels.tsa.exponential_smoothing.ets import ETSModel
    result = ETSModel(y_log, error='add', trend='add', damped_trend=True, seasonal='add', seasonal_periods=SEASON).fit(disp=False)
    return np.maximum(np.expm1(np.asarray(result.forecast(steps))), 0)


def forecast_prophet(dates, y, steps):
    import pandas as pd
    from prophet import Prophet
    frame = pd.DataFrame({'ds': pd.to_datetime(dates), 'y': y})
    model = Prophet(**PROPHET_SETTINGS).fit(frame)
    future = model.make_future_dataframe(steps, freq='7D', include_history=False)
    return np.maximum(model.predict(future)['yhat'].to_numpy(), 0)


def production_projection(series, origins):
    task = {'series': [{'date': w['date'].isoformat(), 'count': w['count']} for w in series], 'detectorWeeks': [],
            'projection': {'origins': origins, 'trainingWeeks': PRODUCTION_TRAINING_WEEKS, 'forecastWeeks': max(HORIZONS)}}
    done = subprocess.run(['node', BRIDGE_PATH], input=json.dumps(task), capture_output=True, text=True, check=True)
    return {row['index']: [f['predicted'] for f in row['forecast']] for row in json.loads(done.stdout)['projection']}


# ---------------------------------------------------------------- statistics
def diebold_mariano(differential, horizon):
    """DM statistic on a loss differential with Newey-West variance (lag h-1). Returns (statistic, two-sided p)."""
    from scipy.stats import norm
    d = np.asarray(differential, dtype=float)
    n = d.size
    mean = d.mean()
    centred = d - mean
    variance = centred @ centred / n
    for lag in range(1, horizon):
        weight = 1 - lag / horizon
        variance += 2 * weight * (centred[lag:] @ centred[:-lag]) / n
    if variance <= 0:
        return None, None
    statistic = mean / np.sqrt(variance / n)
    return rounded(statistic), rounded(2 * (1 - norm.cdf(abs(statistic))))


# ---------------------------------------------------------------- main
def main():
    manifest, weeks, _ = load_weeks()
    segment = build_segments(weeks, MAX_IMPUTED_WEEKS)[0]
    dates = [w['date'] for w in segment]
    counts = np.array([w['count'] for w in segment], dtype=float)
    imputed = np.array([w['imputed'] for w in segment])
    n = len(segment)
    first_origin = INITIAL_TRAINING_WEEKS - 1
    origins = list(range(first_origin, n - max(HORIZONS), ORIGIN_STEP))
    y_log = np.log1p(counts)

    scale_window = counts[SEASON:first_origin + 1]
    mase_scale = float(np.mean(np.abs(scale_window - counts[:first_origin + 1 - SEASON])))

    aic, order, seasonal_order = fit_sarima_order(y_log[:INITIAL_TRAINING_WEEKS])
    print(f'SARIMA order by AIC on the first {INITIAL_TRAINING_WEEKS} weeks: {order} x {seasonal_order}, AIC {aic:.2f}', flush=True)
    production = production_projection(segment, origins)

    predictions = []
    for origin in origins:
        train_log, train_raw = y_log[:origin + 1], counts[:origin + 1]
        forecasts = {
            'naive': [counts[origin]] * max(HORIZONS),
            'seasonalNaive': [counts[origin + h - SEASON] for h in range(1, max(HORIZONS) + 1)],
            'productionProjection': production[origin],
            'ets': forecast_ets(train_log, max(HORIZONS)),
            'sarima': forecast_sarima(train_log, order, seasonal_order, max(HORIZONS)),
            'prophet': forecast_prophet(dates[:origin + 1], train_raw, max(HORIZONS)),
        }
        for h in HORIZONS:
            target = origin + h
            if imputed[target]:
                continue
            for model in MODELS:
                predictions.append({'origin': dates[origin].isoformat(), 'target': dates[target].isoformat(), 'horizon': h,
                                    'model': model, 'actual': int(counts[target]), 'forecast': rounded(forecasts[model][h - 1])})
        print(f'origin {dates[origin]} done', flush=True)

    rng = np.random.default_rng(SEED)
    metrics_rows, by_horizon = [], {}
    for h in HORIZONS:
        by_horizon[f'h{h}'] = {}
        errors = {m: np.array([abs(p['forecast'] - p['actual']) for p in predictions if p['horizon'] == h and p['model'] == m]) for m in MODELS}
        for m in MODELS:
            e = errors[m]
            row = {'horizon': h, 'model': m, 'origins': int(e.size), 'mae': rounded(e.mean()), 'rmse': rounded(np.sqrt((e ** 2).mean())),
                   'mase': rounded(e.mean() / mase_scale), 'maeCi95': block_bootstrap_mean_ci(e, rng)}
            metrics_rows.append(row)
            by_horizon[f'h{h}'][m] = row
        for a, b in COMPARISONS:
            diff = errors[a] - errors[b]
            statistic, p_value = diebold_mariano(diff, h)
            by_horizon[f'h{h}'][f'{a}_vs_{b}'] = {'meanAbsErrorDifference': rounded(diff.mean()), 'blockBootstrapCi95': block_bootstrap_mean_ci(diff, rng),
                                                 'dieboldMarianoStatistic': statistic, 'dieboldMarianoP': p_value, 'origins': int(diff.size),
                                                 'negativeMeansFirstModelBetter': True}

    columns = ['origin', 'target', 'horizon', 'model', 'actual', 'forecast']
    write_csv('forecast_predictions.csv', predictions, columns)
    write_csv('forecast_metrics.csv', metrics_rows, ['horizon', 'model', 'origins', 'mae', 'rmse', 'mase', 'maeCi95'])
    draw(predictions, dates)
    update_study_results('phaseA', {
        'label': STUDY_LABEL, 'run': run_record(),
        'dataset': {'name': manifest['name'], 'sha256': manifest['sha256'], 'licence': manifest['licence']['licence']},
        'segment': {'firstWeek': dates[0].isoformat(), 'lastWeek': dates[-1].isoformat(), 'weeks': n, 'imputedWeeks': int(imputed.sum())},
        'split': {'initialTrainingWeeks': INITIAL_TRAINING_WEEKS, 'originStep': ORIGIN_STEP, 'origins': len(origins),
                  'firstOrigin': dates[first_origin].isoformat(), 'lastOrigin': dates[origins[-1]].isoformat(), 'horizons': list(HORIZONS)},
        'maseScale': rounded(mase_scale),
        'sarima': {'order': list(order), 'seasonalOrder': list(seasonal_order), 'aic': rounded(aic), 'gridFits': len(list(itertools.product(*SARIMA_GRID.values())))},
        'prophetSettings': PROPHET_SETTINGS, 'blockWeeks': BLOCK_WEEKS,
        'byHorizon': by_horizon,
        'comparisonLimits': ('Multi-step forecasts from overlapping windows are serially dependent; about 130 origins; absolute errors are '
                             'heavy-tailed; a single national series. The Diebold-Mariano test assumes a stationary loss differential, which '
                             'the 2017 epidemic breaks. Treat both the test and the block-bootstrap interval as rough.'),
    })
    for h in HORIZONS:
        print(f'h{h}: ' + ', '.join(f"{m} MAE {by_horizon[f'h{h}'][m]['mae']:.1f}" for m in MODELS))


def draw(predictions, dates):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import datetime as dt
    fig, axes = plt.subplots(2, 1, figsize=(8.2, 7), sharex=True)
    for ax, h in zip(axes, (1, 4)):
        rows = [p for p in predictions if p['horizon'] == h]
        targets = sorted({p['target'] for p in rows})
        actual = {p['target']: p['actual'] for p in rows}
        ax.plot([dt.date.fromisoformat(t) for t in targets], [actual[t] for t in targets], color='black', linewidth=1.2, label='Actual')
        for model, style in (('prophet', '-'), ('sarima', '--'), ('productionProjection', ':'), ('seasonalNaive', '-.')):
            series = {p['target']: p['forecast'] for p in rows if p['model'] == model}
            ax.plot([dt.date.fromisoformat(t) for t in targets], [series[t] for t in targets], style, linewidth=0.9, label=model)
        ax.set_ylabel('Dengue cases per week')
        ax.set_title(f'{h}-week-ahead forecasts vs actual (OpenDengue, Sri Lanka)', fontsize=9)
        ax.legend(fontsize=7, ncol=5)
    axes[-1].set_xlabel('Target week')
    fig.suptitle(f'Forecast benchmark: {STUDY_LABEL}; tests the algorithms on public counts, not clinical validation', fontsize=9)
    save_figure(fig, 'forecast_vs_actual.png')


if __name__ == '__main__':
    main()
