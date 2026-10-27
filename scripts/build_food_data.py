#!/usr/bin/env python3
"""Build the app's offline food data files in food-data/.

  off    Read the Open Food Facts CSV export (uncompressed) on stdin and keep
         the most-scanned UK products that have nutrition data.
  cofid  Download the UK government's Composition of Foods Integrated Dataset
         (McCance and Widdowson's) and convert it.

Values are per 100 g: kcal, protein, carbs, sugars, fat, saturates, fibre, salt.
"""
import json
import os
import re
import sys
import tempfile
import urllib.request
from datetime import date

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'food-data')
MAX_PRODUCTS = 30000
UA = 'OverloadTracker-food-data/1.0 (personal app; https://github.com/tobybrown02-stack/gym-tracker)'
COFID_PAGE = 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid'


def num(value):
    """Non-negative float rounded to 1 dp, or None for blanks and junk."""
    try:
        x = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    if x != x or x < 0:
        return None
    return round(x, 1)


def write(name, payload):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
    print(f'wrote {path}: {payload["count"]} foods, {os.path.getsize(path) / 1e6:.1f} MB')


def build_off():
    """Stream the tab-separated OFF export from stdin, keeping UK products."""
    stdin = sys.stdin.buffer
    header = stdin.readline().decode('utf-8').rstrip('\n').split('\t')
    col = {h: i for i, h in enumerate(header)}
    get = lambda r, k: r[col[k]] if k in col and col[k] < len(r) else ''

    best = {}
    for raw in stdin:
        if b'united-kingdom' not in raw:  # cheap pre-filter before splitting
            continue
        r = raw.decode('utf-8', 'replace').rstrip('\n').split('\t')
        if 'en:united-kingdom' not in get(r, 'countries_tags'):
            continue
        code = get(r, 'code').strip()
        name = re.sub(r'\s+', ' ', get(r, 'product_name')).strip()
        kcal = num(get(r, 'energy-kcal_100g'))
        if kcal is None and num(get(r, 'energy_100g')) is not None:
            kcal = round(num(get(r, 'energy_100g')) / 4.184, 1)
        if not code.isdigit() or not name or kcal is None or kcal > 900:
            continue
        n = [num(get(r, k)) or 0 for k in ('proteins_100g', 'carbohydrates_100g', 'sugars_100g', 'fat_100g',
                                           'saturated-fat_100g', 'fiber_100g', 'salt_100g')]
        if n[0] + n[1] + n[3] > 105:  # impossible macros: bad data
            continue
        brand = get(r, 'brands').split(',')[0].strip()
        serving = num(get(r, 'serving_quantity')) or 0
        scans = num(get(r, 'unique_scans_n')) or 0
        row = [code, name[:80], brand[:40], kcal, *n, serving if 0 < serving < 2000 else 0]
        if code not in best or scans > best[code][0]:
            best[code] = (scans, row)

    rows = [row for _, row in sorted(best.values(), key=lambda x: -x[0])[:MAX_PRODUCTS]]
    if len(rows) < 1000:
        sys.exit(f'only {len(rows)} UK products found; refusing to overwrite the data file')
    write('uk-products.json', {
        'updated': date.today().isoformat(), 'count': len(rows),
        'fields': ['code', 'name', 'brand', 'kcal', 'protein', 'carbs', 'sugar', 'fat', 'satfat', 'fibre', 'salt', 'servingG'],
        'rows': rows,
    })


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=120) as resp:
        return resp.read()


def cofid_value(v):
    """CoFID uses 'Tr' for trace amounts and 'N' for not measured."""
    if isinstance(v, str) and v.strip().lower() in ('tr', 'trace'):
        return 0.0
    return num(v)


def build_cofid():
    import openpyxl

    page = fetch(COFID_PAGE).decode('utf-8', 'replace')
    links = re.findall(r'https://assets\.publishing\.service\.gov\.uk/[^"\'\s<>]+?\.xlsx', page)
    links = [l for l in dict.fromkeys(links) if re.search(r'integrated|cofid|composition', l, re.I)] or links
    if not links:
        sys.exit('no CoFID spreadsheet link found on the gov.uk page')
    print(f'downloading {links[0]}')
    with tempfile.NamedTemporaryFile(suffix='.xlsx') as tmp:
        tmp.write(fetch(links[0]))
        tmp.flush()
        wb = openpyxl.load_workbook(tmp.name, read_only=True, data_only=True)

        # Header text (lower case) -> our field. Checked in order; first match wins per sheet.
        matchers = [
            ('kcal', lambda h: h.startswith('energy') and 'kcal' in h),
            ('protein', lambda h: h.startswith('protein')),
            ('fat', lambda h: h == 'fat (g)' or h == 'fat'),
            ('carbs', lambda h: h.startswith('carbohydrate')),
            ('sugar', lambda h: h.startswith('total sugars')),
            ('aoac', lambda h: h.startswith('aoac fibre')),
            ('nsp', lambda h: h.startswith('nsp')),
            ('satfat', lambda h: h.startswith('satd fa') and re.search(r'/\s*100\s*g\s*(fd|food)', h)),
            ('sodium', lambda h: h.startswith('sodium') or re.match(r'^na\b', h)),
        ]
        foods = {}
        for ws in wb.worksheets:
            rows = ws.iter_rows(values_only=True)
            header, seen = None, []
            norm = lambda c: re.sub(r'\s+', ' ', str(c or '')).strip().lower()
            for _ in range(15):
                row = next(rows, None)
                if row is None:
                    break
                seen.append([norm(c) for c in row[:4]])
                if any(norm(c) in ('food code', 'foodcode', 'code') for c in row):
                    header = [norm(c) for c in row]
                    break
            if not header:
                print(f'sheet {ws.title!r}: skipped, no "Food Code" header in first rows: {seen[:3]}')
                continue
            ci = {'code': next(i for i, h in enumerate(header) if h in ('food code', 'foodcode', 'code'))}
            if 'food name' in header:
                ci['name'] = header.index('food name')
            for field, match in matchers:
                for i, h in enumerate(header):
                    if field not in ci and match(h):
                        ci[field] = i
            print(f'sheet {ws.title!r}: matched {sorted(ci)}; headers: {header[:12]}')
            for row in rows:
                code = row[ci['code']] if ci['code'] < len(row) else None
                if not code or not re.match(r'^\d', str(code)):
                    continue
                food = foods.setdefault(str(code).strip(), {})
                for field, i in ci.items():
                    if field == 'code' or i >= len(row):
                        continue
                    food[field] = str(row[i]).strip() if field == 'name' else cofid_value(row[i])

    out = []
    for code, f in foods.items():
        if not f.get('name') or f.get('kcal') is None:
            continue
        fibre = f.get('aoac') if f.get('aoac') is not None else f.get('nsp')
        salt = round(f['sodium'] * 2.5 / 1000, 2) if f.get('sodium') is not None else 0
        out.append([code, f['name'][:100], f['kcal'], f.get('protein') or 0, f.get('carbs') or 0, f.get('sugar') or 0,
                    f.get('fat') or 0, f.get('satfat') or 0, fibre or 0, salt])
    if len(out) < 1000:
        sys.exit(f'only {len(out)} CoFID foods parsed; refusing to overwrite the data file')
    out.sort(key=lambda r: r[1])
    write('uk-cofid.json', {
        'updated': date.today().isoformat(), 'count': len(out), 'source': links[0],
        'fields': ['code', 'name', 'kcal', 'protein', 'carbs', 'sugar', 'fat', 'satfat', 'fibre', 'salt'],
        'rows': out,
    })


if __name__ == '__main__':
    {'off': build_off, 'cofid': build_cofid}[sys.argv[1]]()
