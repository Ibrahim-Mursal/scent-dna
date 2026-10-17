"""Export the Decant perfumes.db into the compact perfumes.json the Scent DNA site loads.

Usage: python3 -I export_data.py <perfumes.db> <out_dir> [min_votes]
"""
import json
import sqlite3
import sys
from collections import defaultdict

db_path, out_dir = sys.argv[1], sys.argv[2]
min_votes = int(sys.argv[3]) if len(sys.argv) > 3 else 30

c = sqlite3.connect(db_path)
q = lambda s, *a: c.execute(s, a).fetchall()

rows = q(
    """select id,name,brand_id,year,gender,rating_avg,vote_count,
              winter,spring,summer,autumn,day,night,longevity_avg,sillage_avg,clone_of_id,clone_score
       from perfumes where vote_count>=? and name is not null order by vote_count desc""",
    min_votes,
)
keep = {r[0] for r in rows}

# accords per perfume (keep strength >= 15, max 10)
acc = defaultdict(list)
for pid, aid, s in q("select perfume_id,accord_id,strength from perfume_accords order by perfume_id,strength desc"):
    if pid in keep and s >= 15 and len(acc[pid]) < 20:
        acc[pid] += [aid, s]

# notes per perfume
notes = defaultdict(list)
for pid, nid, tier, w in q("select perfume_id,note_id,tier,weight from perfume_notes order by perfume_id,tier,ord"):
    if pid in keep and len(notes[pid]) < 60:
        notes[pid] += [nid, tier, w]

used_brands = sorted({r[2] for r in rows if r[2] is not None})
brand_names = dict(q("select id,name from brands"))
bidx = {b: i for i, b in enumerate(used_brands)}

accord_rows = q("select id,name from accords order by id")
aidx = {a: i for i, (a, _) in enumerate(accord_rows)}

used_notes = sorted({notes[pid][i] for pid in notes for i in range(0, len(notes[pid]), 3)})
note_rows = {r[0]: (r[1], r[2], r[3]) for r in q("select id,name,perfume_count,image_id from notes")}
nidx = {n: i for i, n in enumerate(used_notes)}

G = {"female": 0, "male": 1, "unisex": 2}
out = []
for (pid, name, bid, year, gender, rating, votes, wi, sp, su, au, dy, ni, lon, sil, clone_of, clone_score) in rows:
    seas = [x or 0 for x in (wi, sp, su, au, dy, ni)]
    m = max(seas) or 1
    seas = [round(100 * x / m) for x in seas]
    a = acc.get(pid, [])
    a = [aidx[a[i]] if i % 2 == 0 else a[i] for i in range(len(a))]
    n = notes.get(pid, [])
    n = [nidx[n[i]] if i % 3 == 0 else n[i] for i in range(len(n))]
    out.append([
        pid, name, bidx.get(bid, -1), year or 0, G.get(gender, 2),
        round((rating or 0) * 100), votes, seas, a, n,
        round((lon or 0) * 10), round((sil or 0) * 10),
        clone_of if clone_of in keep else 0,
        round((clone_score or 0) * 100),
    ])

data = {
    "v": 1,
    "fields": ["id", "name", "brand", "year", "gender", "rating100", "votes", "seasons[wi,sp,su,au,day,night]",
               "accords[idx,strength..]", "notes[idx,tier,weight..]", "longevity10", "sillage10", "clone_of", "clone_score100"],
    "brands": [brand_names[b] for b in used_brands],
    "accords": [n for _, n in accord_rows],
    "notes": [note_rows[n][0] for n in used_notes],
    "noteCount": [note_rows[n][1] for n in used_notes],
    "noteImg": [note_rows[n][2] or 0 for n in used_notes],
    "p": out,
}
raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
with open(f"{out_dir}/perfumes.json", "wb") as f:
    f.write(raw)
print("perfumes", len(out), "brands", len(used_brands), "notes", len(used_notes), "raw MB", round(len(raw) / 1e6, 2))
