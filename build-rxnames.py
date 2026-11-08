"""Build the offline name index. Usage: python build-rxnames.py RxTerms.zip RxNorm_prescribe.zip
Use matching NLM monthly releases and the accompanying rxterms.js product catalog.
"""
import csv
import io
import json
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

root = Path(__file__).resolve().parent
products = [json.loads(line.rstrip(',')) for line in (root/'rxterms.js').read_text().splitlines() if line.startswith('["')]
by_display = {row[0]: n for n, row in enumerate(products)}
by_cui = defaultdict(set)
product_cuis = defaultdict(set)
route_proofs = defaultdict(list)
spellings = defaultdict(set)
ingredient_names = defaultdict(set)
fda_brands = defaultdict(set)
fda_labels = []
aliases = defaultdict(set)
terms = zipfile.ZipFile(sys.argv[1])
norm = zipfile.ZipFile(sys.argv[2])

def source_rows(prefix):
    filename = next(s for s in terms.namelist() if re.fullmatch(prefix + r'\d{6}\.txt', s))
    return csv.DictReader(io.TextIOWrapper(terms.open(filename), encoding='utf-8-sig'), delimiter='|')

def add_name(name, indexes):
    if name and name != 'NA':
        spellings[name.strip().lower()].update(indexes)

for row in source_rows('RxTermsIngredients'):
    ingredient_names[row['ING_RXCUI']].add(row['INGREDIENT'].lower())

for row in source_rows('RxTerms'):
    if row['IS_RETIRED'] or row['SUPPRESS_FOR'] or row['DISPLAY_NAME'] not in by_display:
        continue
    idx = by_display[row['DISPLAY_NAME']]
    product_cuis[idx].add(row['RXCUI'])
    route_proofs[row['RXCUI']].append(row['PSN']+' '+row['FULL_NAME'])
    for field in ['RXCUI', 'SXDG_RXCUI']:
        if row[field]:
            by_cui[row[field]].add(idx)
    for field in ['FULL_NAME', 'FULL_GENERIC_NAME', 'PSN', 'SXDG_NAME', 'BRAND_NAME']:
        add_name(row[field], [idx])
    # A PSN strength can follow a specific brand variant such as Wellbutrin XL.
    psn = row['PSN']
    prefix = re.split(r'\s+\d+(?:\.\d+)?\s*(?:MG|MCG|G|%)\b', psn, maxsplit=1, flags=re.I)[0]
    if (row['BRAND_NAME'] and prefix != psn and prefix.upper().startswith(row['BRAND_NAME'])
            and re.fullmatch(r"[\w '–-]+",prefix)):
        add_name(prefix,[idx])

def rrf(filename):
    entry = next(s for s in norm.namelist() if s.endswith('/'+filename) or s == filename)
    return csv.reader(io.TextIOWrapper(norm.open(entry),encoding='utf-8'),delimiter='|',quoting=csv.QUOTE_NONE)

# RxNorm's precise_ingredient_of / has_form relationships are not a generic license
# to drop a salt. Use only explicit RxNorm ingredient-to-precise-ingredient form links.
canonical = {}
atoms = defaultdict(set)
for row in rrf('RXNCONSO.RRF'):
    cui, lang, sab, tty, name, suppressed = row[0],row[1],row[11],row[12],row[14],row[16]
    if sab=='MTHSPL' and tty=='DP' and lang=='ENG' and suppressed=='N':
        bracket=re.search(r'\[([^\[\]]{2,160})\]$',name)
        if bracket:
            fda_brands[bracket[1].strip().lower()].add(cui)
        if cui in by_cui:
            fda_labels.append((name,cui))
    if sab=='MTHSPL' and tty=='SU' and lang=='ENG' and suppressed in {'','N'}:
        atoms[cui].add(name)
    if lang != 'ENG' or sab != 'RXNORM' or suppressed != 'N':
        continue
    if cui in route_proofs and tty in {'SCD','SBD','SY','PSN'}:
        route_proofs[cui].append(name)
    if tty in {'IN','PIN'}:
        canonical[cui] = (tty,name.lower())
    if tty in {'IN','PIN','SY','TMSY','PSN','SCD','SBD','SCDG','SBDG','BPCK','GPCK','BN'}:
        atoms[cui].add(name)
        if cui in by_cui:
            add_name(name,by_cui[cui])

for row in rrf('RXNREL.RRF'):
    if row[10]!='RXNORM' or row[14] not in {'','N'} or row[7] not in {'form_of','has_form'}:
        continue
    a,b=row[0],row[4]
    if a not in canonical or b not in canonical:continue
    if canonical[a][0]=='PIN':a,b=b,a
    if canonical[a][0]=='IN' and canonical[b][0]=='PIN':
        # Keep a directly indexed ingredient (e.g. a specific salt) as its own identity.
        if b not in ingredient_names:
            aliases[canonical[b][1]].add(canonical[a][1])

for cui,(kind,preferred) in canonical.items():
    target=ingredient_names.get(cui) or aliases.get(preferred) or {preferred}
    for label in atoms[cui]:
        if len(label)<=120 and not any(c in label for c in '[]'):
            aliases[label.lower()].update(target)

# FDA label brands must match their complete name and have known linked product CUIs.
# Do not assume that a matching brand stem, or one mapped variant, covers an entire line.
for brand,cuis in fda_brands.items():
    if all(c in by_cui for c in cuis):
        add_name(brand,set().union(*(by_cui[c] for c in cuis)))
for label,cui in fda_labels:
    add_name(label,by_cui[cui])

# Keep former branded names only when their original generic RxCUI maps to a
# current formulation. This supports existing records without guessing composition.
historical=defaultdict(set)
for row in source_rows('RxTermsArchive'):
    if row['BRAND_NAME'] and row['GENERIC_RXCUI']:
        historical[row['BRAND_NAME'].lower()].add(row['GENERIC_RXCUI'])
for brand,cuis in historical.items():
    if brand not in spellings and all(c in by_cui for c in cuis):
        add_name(brand,set().union(*(by_cui[c] for c in cuis)))

# Exact spellings may point to more than one product: retain every candidate.
groups=defaultdict(list)
for spelling,targets in spellings.items():
    groups[tuple(sorted(targets))].append(spelling)
systemic_pattern=re.compile(r'\b(intravenous|intramuscular|subcutaneous)\b',re.I)
local_pattern=re.compile(r'\b(ophthalmic|intraocular|intravitreal|intracameral|intraarticular|intra.articular|intralesional|epidural|intrathecal|ocular|periodontal)\b',re.I)
systemic={c for c,descriptions in route_proofs.items()
          if systemic_pattern.search(' '.join(descriptions)) and not local_pattern.search(' '.join(descriptions))}
systemic_products=sorted(i for i,cuis in product_cuis.items() if cuis<=systemic)
dd_line=next(line for line in (root/'ddinter-data.js').read_text().splitlines() if line.startswith('export const ddNames='))
dd_names={n.lower() for n in json.loads(dd_line.split('=',1)[1].rstrip(';'))}
equivalents={}
for cui,(kind,preferred) in canonical.items():
    if kind=='IN' and preferred not in dd_names:
        found={n.lower() for n in atoms[cui] if n.lower() in dd_names}
        if len(found)==1:equivalents[preferred]=found.pop()
with (root/'rxname-data.js').open('w') as out:
    out.write('// NLM RxTerms and RxNorm Current Prescribable Content, November 2026. Derived name index; no interaction ratings.\n')
    out.write('export const labelGroups=[\n')
    for key,values in sorted(groups.items()):
        out.write(json.dumps([key,sorted(values)],ensure_ascii=False,separators=(',',':'))+',\n')
    out.write('];\nexport const ingredientNames='+json.dumps({key:sorted(v) for key,v in sorted(aliases.items()) if v!={key}},ensure_ascii=False,separators=(',',':'))+';\n')
    out.write('export const systemicProducts='+json.dumps(systemic_products,separators=(',',':'))+';\n')
    out.write('export const sourceEquivalents='+json.dumps(equivalents,separators=(',',':'))+';\n')
print(f'{len(spellings):,} distinct product-label spellings; {len(groups):,} candidate groups')
