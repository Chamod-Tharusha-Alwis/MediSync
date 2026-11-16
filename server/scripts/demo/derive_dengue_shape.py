"""Derive the 52-week dengue seasonal shape used by the synthetic demonstration seed.

Synthetic demonstration data, shaped from public weekly counts. Reads the OpenDengue V1.3.1 national
extract recorded in ml-engine/evaluation/data/manifest.json (Sri Lanka, weekly, Admin0) through the
existing loader, and writes server/scripts/demo/dengue_weekly_shape.json. Each year with at least 50
reported weeks is divided by its own weekly mean; the shape for ISO week w is the mean of those
ratios over the years, rescaled so the 52 values average 1.0. ISO week 53 is folded into week 52.

Usage:  ml-engine/.venv/Scripts/python.exe server/scripts/demo/derive_dengue_shape.py
"""
import collections
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'ml-engine', 'evaluation'))
from run_outbreak_backtest import load_weeks  # noqa: E402

MIN_WEEKS_PER_YEAR = 50


def main():
    entry, weeks, rows = load_weeks()
    by_year = collections.defaultdict(dict)
    for date, count in weeks.items():
        week = min(date.isocalendar()[1], 52)
        by_year[date.isocalendar()[0]][week] = count
    years = sorted(y for y, w in by_year.items() if len(w) >= MIN_WEEKS_PER_YEAR)
    ratios = collections.defaultdict(list)
    for year in years:
        mean = sum(by_year[year].values()) / len(by_year[year])
        for week, count in by_year[year].items():
            ratios[week].append(count / mean)
    shape = [sum(ratios[w]) / len(ratios[w]) for w in range(1, 53)]
    scale = sum(shape) / len(shape)
    shape = [round(v / scale, 4) for v in shape]
    out = {
        'label': 'synthetic demonstration data, shaped from public weekly counts',
        'source': {'dataset': 'opendengue_national', 'url': entry['url'], 'sha256': entry['sha256'],
                   'licence': entry['licence']['licence'], 'downloadDate': entry['downloadDate'],
                   'country': 'Sri Lanka', 'resolution': 'national weekly (Admin0)', 'rowsRead': rows},
        'yearsUsed': years,
        'method': 'per-year weekly count / that year mean, averaged per ISO week (53 folded into 52), rescaled to mean 1.0',
        'isoWeekShape': shape,
    }
    path = os.path.join(HERE, 'dengue_weekly_shape.json')
    with open(path, 'w', encoding='utf-8', newline='\n') as handle:
        json.dump(out, handle, indent=2)
        handle.write('\n')
    print(f'years used: {years}')
    print(f'min {min(shape)} (week {shape.index(min(shape)) + 1}), max {max(shape)} (week {shape.index(max(shape)) + 1})')
    print(f'weeks 38-46 mean {sum(shape[37:46]) / 9:.3f}; weeks 45-47 {shape[44:47]}')
    print(f'wrote {os.path.relpath(path, ROOT)}')


if __name__ == '__main__':
    main()
