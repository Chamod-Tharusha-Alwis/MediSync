"""Integrity check for the study outputs (offline study, not in production).

Fails (exit 1) when:
- a number in docs/report/study/RESULTS.md is not present in the results files (study_results.json, evaluation_results.json,
  data/manifest.json or the study CSVs), in plain, rounded or percentage form;
- a forbidden phrase appears in any study output or study script.

Usage:  python ml-engine/evaluation/study/check_results.py
"""
import csv
import glob
import json
import os
import re
import sys

from study_common import DATA_DIR, EVALUATION_RESULTS_PATH, OUT_DIR, RESULTS_PATH, STUDY_DIR, read_json

SMALL_INTEGER_MAX = 10
PERCENT_FORMS = ('{:.0f}', '{:.1f}', '{:.2f}')
PLAIN_FORMS = ('{}', '{:.0f}', '{:.1f}', '{:.2f}', '{:.3f}', '{:.4f}')
FORBIDDEN = [re.compile(r'clinically\s+validated', re.I), re.compile(r'clinically\s+proven', re.I), re.compile(r'accurate\s+for\s+patients', re.I)]
NUMBER = re.compile(r'(?<![A-Za-z_\-\d.])\d+(?:\.\d+)?(?![\d])')


def walk(node, visit):
    if isinstance(node, dict):
        for value in node.values():
            walk(value, visit)
    elif isinstance(node, list):
        for value in node:
            walk(value, visit)
    else:
        visit(node)


def accepted_numbers():
    accepted = set()

    def visit(value):
        if isinstance(value, bool):
            return
        if isinstance(value, (int, float)):
            a = abs(float(value))
            for form in PLAIN_FORMS:
                accepted.add(form.format(a))
            for form in PERCENT_FORMS:
                accepted.add(form.format(a * 100))
        elif isinstance(value, str):
            accepted.update(NUMBER.findall(value))

    for path in (RESULTS_PATH, EVALUATION_RESULTS_PATH, os.path.join(DATA_DIR, 'manifest.json')):
        walk(read_json(path), visit)
    for path in glob.glob(os.path.join(OUT_DIR, '*.csv')):
        with open(path, encoding='utf-8') as handle:
            for row in csv.reader(handle):
                for cell in row:
                    for token in cell.split(';'):
                        try:
                            visit(float(token))
                        except ValueError:
                            visit(token)
    return accepted


def main():
    report_path = os.path.join(OUT_DIR, 'RESULTS.md')
    text = open(report_path, encoding='utf-8').read()
    body = '\n'.join(line for line in text.splitlines() if not line.startswith('#'))
    body = re.sub(r'`[^`]*`', ' ', body)
    body = re.sub(r'\]\([^)]*\)', '] ', body)
    body = re.sub(r'(^|[\s(])[-+](?=\d)', r'\1', body, flags=re.M)
    accepted = accepted_numbers()
    unmatched = sorted({token for token in NUMBER.findall(body)
                        if token not in accepted and not (token.isdigit() and int(token) <= SMALL_INTEGER_MAX)})
    problems = []
    if unmatched:
        problems.append(f'numbers in RESULTS.md not found in the results files: {unmatched}')
    files = glob.glob(os.path.join(OUT_DIR, '*')) + glob.glob(os.path.join(STUDY_DIR, '*.py'))
    for path in files:
        if path.endswith(('.png',)):
            continue
        content = open(path, encoding='utf-8', errors='replace').read()
        for phrase in FORBIDDEN:
            if phrase.search(content):
                problems.append(f'forbidden phrase {phrase.pattern!r} in {os.path.relpath(path)}')
    if problems:
        print('\n'.join(problems))
        sys.exit(1)
    print(f'check_results: {len(NUMBER.findall(body))} numbers in RESULTS.md all traced to the results files; no forbidden phrases in {len(files)} files')


if __name__ == '__main__':
    main()
