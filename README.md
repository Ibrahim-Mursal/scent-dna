# Scent DNA

A static website: people pick the perfumes they love, choose accords and notes, and get their Scent DNA (scent type, accord mix, favorite bottles) plus a ranked list of perfumes to try next. Everything runs in the browser. There is no server code, database or build step.

## What's in this folder

| File | What it is |
|---|---|
| `index.html` | The whole app (layout, styles and code) |
| `perfumes.json` | The catalog: 48,531 perfumes with accords, notes, note image IDs and ratings (9.3 MB) |
| `fonts/` | Cormorant and Albert Sans, self-hosted (SIL Open Font License) |
| `favicon.svg` | Browser tab icon |
| `og-image.png` | Preview image shown when the link is shared on WhatsApp, Instagram, X and others |
| `.htaccess` | Compression and caching for Apache / cPanel hosting |
| `_headers` | Caching for Netlify |
| `robots.txt` | Lets search engines index the site |
| `images/` | Your own copies of the bottle and note photos, once you run `tools/download_images.py` (not included yet) |
| `tools/download_images.py` | Downloads the bottle and note photos into `images/` |
| `tools/export_data.py` | Rebuilds `perfumes.json` from a newer Decant `perfumes.db` |

Upload everything except `README.md` and `tools/`, including the `images` folder if you made it. Keep the folder structure as it is.

## Step 1: download the photos (recommended)

Run this once on your computer, inside the unzipped `scent-dna` folder. You need Python 3.

```
pip install pillow
python3 tools/download_images.py
```

It downloads a bottle photo for every perfume with at least 250 votes (about 14,300, all the perfumes the site can recommend) and a photo for each of the ~1,600 notes, and saves them as small WebP files in `images/`. Expect roughly 150 to 200 MB and about an hour; it pauses between requests on purpose so Fragrantica's server isn't overloaded. You can stop it with Ctrl+C and run it again later; it continues where it stopped.

Options: `--min-votes 1000` downloads fewer photos (about 4,300), `--min-votes 30` downloads all 48,531, and `--format jpg` keeps the original JPGs if you don't install Pillow.

With your own copies, photos keep working even if Fragrantica blocks outside sites, and they also appear in the images people save. Perfumes without a downloaded photo still load theirs from Fragrantica, and if that fails the site draws a bottle.

## Step 2: upload

**Netlify:** go to app.netlify.com/drop and drag this folder onto the page. With the photos the upload is larger, so connecting a Git repository may be more reliable than drag and drop.

**Vercel:** run `npx vercel` inside this folder, or import it as a project with no framework and no build command.

**GitHub Pages:** push the files to a repository, then turn on Pages under Settings → Pages with the root folder as the source.

**cPanel / FTP:** upload the files into `public_html` (or a subfolder). Turn on "Show hidden files" so `.htaccess` goes up too; it compresses the 9.3 MB catalog to about 3.8 MB for visitors.

The page must be opened through a web address. Opening `index.html` straight from your disk won't load the catalog, because browsers block that.

## After uploading

1. Open `index.html` and change the `og:image` line to your full address, for example `https://scentdna.owlava.com/og-image.png`. Social apps need the full address to show the preview image.
2. Open the site on your phone and go through it once.

## Things to know

- **Photos** come from your `images/` folder first, then from Fragrantica's image server, and if both fail the site draws a bottle (or a letter for notes). The photos belong to Fragrantica and the brands. That's fine for a showcase, but for a commercial site, ask them or use your own photos.
- **Saved images** (the "Save as image" button) include photos only from your own `images/` folder. Fragrantica's server doesn't allow its photos to be copied into a generated image, so without your copies the saved image uses drawn bottles.
- **Data** comes from the Decant dataset (Fragrantica community data). Check the dataset's license on Kaggle before commercial use.
- **Privacy:** answers and photos are saved only in the visitor's own browser. Nothing is sent anywhere.

## Replacing photos with your own

After running the download script, replace any file in `images/perfumes/` or `images/notes/` with your own photo, keeping the same file name and format. Bottle files are named by perfume ID (the number at the end of its Fragrantica address) and note files by the note's image ID, for example `images/notes/55.webp` is Saffron. Square note images around 200×200 pixels and bottle images about 300×400 pixels on a white background work best.

## User accounts

On GitHub Pages or any plain host, the site saves each visitor's answers in their browser only. To give visitors real accounts (sign up, sign in, profile on every device), run the site on your own server with PocketBase. The full guide and a one-command setup script are in `server/README.md`.

## Updating the catalog

Download a newer `perfumes.db.gz` from the Decant showcase, unzip it, then run:

```
python3 tools/export_data.py perfumes.db . 30
```

The last number is the minimum vote count for a perfume to be included.
