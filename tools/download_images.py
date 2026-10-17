"""Download perfume bottle photos and note photos so the site can host them itself.

Run it from the site folder (the one with index.html and perfumes.json):

    python3 tools/download_images.py

What it does
  - Reads perfumes.json and downloads a bottle photo for every perfume with at least
    --min-votes votes (default 250, which covers every perfume the site can recommend:
    about 14,300 photos), plus a photo for each of the ~1,600 notes.
  - Saves them as images/perfumes/<id>.webp and images/notes/<image id>.webp
    (or .jpg if Pillow isn't installed, or with --format jpg).
  - Writes images/manifest.json listing what it saved. The site reads this file and
    uses your copies first; anything missing still loads from Fragrantica.

It is safe to stop (Ctrl+C) and run again: files already downloaded are skipped.
Requests are spaced out on purpose so the image server isn't hammered.

Options
  --min-votes N    only perfumes with at least N votes (default 250)
  --no-notes       skip note photos
  --no-perfumes    skip bottle photos
  --format webp|jpg  output format (default webp; needs Pillow: pip install pillow)
  --width N        bottle photo width in pixels when converting (default 300)
  --workers N      parallel downloads (default 4)
  --delay S        pause per request, per worker, in seconds (default 0.2)
"""
import argparse
import io
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "https://fimgs.net/mdimg"
UA = "Mozilla/5.0 (compatible; ScentDNA-image-fetch/1.0)"


def parse_args():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description="Download perfume and note photos for the Scent DNA site.")
    ap.add_argument("--site", default=os.path.dirname(here) if os.path.basename(here) == "tools" else ".",
                    help="site folder containing perfumes.json (default: the folder above tools/)")
    ap.add_argument("--min-votes", type=int, default=250)
    ap.add_argument("--no-notes", action="store_true")
    ap.add_argument("--no-perfumes", action="store_true")
    ap.add_argument("--format", choices=["webp", "jpg"], default="webp")
    ap.add_argument("--width", type=int, default=300)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--delay", type=float, default=0.2)
    ap.add_argument("--base-url", default=BASE, help=argparse.SUPPRESS)  # for testing
    return ap.parse_args()


def main():
    a = parse_args()
    data_path = os.path.join(a.site, "perfumes.json")
    if not os.path.exists(data_path):
        sys.exit(f"Can't find perfumes.json in {os.path.abspath(a.site)}. Run this from the site folder, or pass --site <folder>.")

    fmt = a.format
    try:
        from PIL import Image
    except ImportError:
        Image = None
        if fmt == "webp":
            print("Pillow isn't installed, so photos are saved as the original JPGs.")
            print("For smaller WebP files, run: pip install pillow   and start this script again.\n")
            fmt = "jpg"

    d = json.load(open(data_path, encoding="utf-8"))
    jobs = []  # (kind, key, url, dest)
    img_dir = os.path.join(a.site, "images")
    if not a.no_perfumes:
        os.makedirs(os.path.join(img_dir, "perfumes"), exist_ok=True)
        for r in d["p"]:
            pid, votes = r[0], r[6]
            if votes >= a.min_votes:
                jobs.append(("p", pid, f"{a.base_url}/perfume/375x500.{pid}.jpg", os.path.join(img_dir, "perfumes", f"{pid}.{fmt}")))
    if not a.no_notes:
        os.makedirs(os.path.join(img_dir, "notes"), exist_ok=True)
        for nid in sorted({x for x in d.get("noteImg", []) if x}):
            jobs.append(("n", nid, f"{a.base_url}/sastojci/t.{nid}.jpg", os.path.join(img_dir, "notes", f"{nid}.{fmt}")))

    done = {"p": set(), "n": set()}
    todo = []
    for kind, key, url, dest in jobs:
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            done[kind].add(key)
        else:
            todo.append((kind, key, url, dest))
    print(f"{len(jobs):,} photos wanted, {len(jobs) - len(todo):,} already saved, {len(todo):,} to download.")

    lock = threading.Lock()
    missing, failed = [], []
    count = [0]

    def save(kind, data, dest):
        if fmt == "jpg" or Image is None:
            with open(dest, "wb") as f:
                f.write(data)
            return
        im = Image.open(io.BytesIO(data)).convert("RGB")
        if kind == "p" and im.width > a.width:
            im = im.resize((a.width, round(im.height * a.width / im.width)), Image.LANCZOS)
        tmp = dest + ".part"
        im.save(tmp, "WEBP", quality=82, method=5)
        os.replace(tmp, dest)

    def fetch(job):
        kind, key, url, dest = job
        for attempt in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = resp.read()
                save(kind, data, dest)
                time.sleep(a.delay)
                return kind, key, "ok"
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return kind, key, "missing"
                if e.code in (403, 429):
                    time.sleep(10 * (attempt + 1))  # the server asked us to slow down
                else:
                    time.sleep(2 * (attempt + 1))
            except Exception:
                time.sleep(2 * (attempt + 1))
        return kind, key, "failed"

    def write_manifest():
        man = {"ext": fmt, "perfumes": sorted(done["p"]), "notes": sorted(done["n"])}
        tmp = os.path.join(img_dir, "manifest.json.part")
        with open(tmp, "w") as f:
            json.dump(man, f, separators=(",", ":"))
        os.replace(tmp, os.path.join(img_dir, "manifest.json"))

    os.makedirs(img_dir, exist_ok=True)
    start = time.time()
    try:
        with ThreadPoolExecutor(max_workers=max(1, a.workers)) as ex:
            futs = [ex.submit(fetch, j) for j in todo]
            for fut in as_completed(futs):
                kind, key, status = fut.result()
                with lock:
                    count[0] += 1
                    if status == "ok":
                        done[kind].add(key)
                    elif status == "missing":
                        missing.append((kind, key))
                    else:
                        failed.append((kind, key))
                    n = count[0]
                    if n % 100 == 0 or n == len(todo):
                        rate = n / max(1e-6, time.time() - start)
                        left = (len(todo) - n) / max(rate, 1e-6)
                        print(f"  {n:,}/{len(todo):,} done, about {left / 60:.0f} min left", flush=True)
                    if n % 500 == 0:
                        write_manifest()
    except KeyboardInterrupt:
        print("\nStopped. Run the script again to continue where it left off.")
    finally:
        write_manifest()

    size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(img_dir) for f in fs)
    print(f"\nSaved {len(done['p']):,} bottle photos and {len(done['n']):,} note photos ({size / 1e6:.0f} MB) in {img_dir}")
    if missing:
        print(f"{len(missing):,} photos don't exist on the server; the site draws those instead.")
    if failed:
        print(f"{len(failed):,} downloads failed. Run the script again to retry them.")
    print("Upload the images folder together with the rest of the site.")


if __name__ == "__main__":
    main()
