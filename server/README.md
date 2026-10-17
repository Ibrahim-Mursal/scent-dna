# Running Scent DNA with accounts on your own server

The website works in two ways:

- **Without a server** (GitHub Pages, today): everything is saved in each visitor's browser. No accounts.
- **On your own server** (for example Contabo): visitors can create an account, and their Scent DNA is saved to your database and opens on any device. The Community page turns on too: members rate perfumes with stars, write reviews, reply, mark reviews as helpful and report bad ones. The site notices the server automatically; there's nothing to switch on in the code.

The server runs **PocketBase**, a single program that provides the accounts, the database and profile photo storage, plus an admin dashboard. It also serves the website itself and gets a free HTTPS certificate for your domain.

## What you need

- A VPS with **Ubuntu 22.04 or 24.04**. The smallest Contabo Cloud VPS is plenty.
- A domain or subdomain for the site, for example `scentdna.owlava.com`.
- About 15 minutes.

## Step 1: point your domain at the server

At your domain provider, add a DNS record:

| Type | Name | Value |
|---|---|---|
| A | `scentdna` (or `@` for the whole domain) | your server's IP address from Contabo |

Wait until it works: `ping scentdna.owlava.com` should show the server's IP. This can take a few minutes up to an hour.

## Step 2: run the setup script

Connect to the server (Contabo emails you the IP and root password):

```
ssh root@YOUR_SERVER_IP
```

Then run:

```
curl -fsSL https://raw.githubusercontent.com/Ibrahim-Mursal/scent-dna/main/server/setup.sh -o setup.sh
sudo bash setup.sh scentdna.owlava.com
```

It asks for an admin email and password at the end. That's your login for the dashboard, not a site account.

When it finishes, open:

- **Site:** `https://scentdna.owlava.com`
- **Dashboard:** `https://scentdna.owlava.com/_/`

## Step 3: set up email sending (needed for password resets)

Without this, "Forgot your password?" can't send anything. Sign-up and sign-in work without it.

1. Make a free account at an email service such as **Resend** or **Brevo**, and add your domain there (they show you the DNS records to add).
2. Copy their **SMTP** host, port, username and password.
3. In the dashboard: **Settings → Mail settings**. Turn on "Use SMTP mail server", paste the details, set the sender to something like `Scent DNA <hello@owlava.com>`, then use **Send test email**.

## Step 4 (optional): "Continue with Google"

1. In **Google Cloud Console → APIs & Services → Credentials**, create an **OAuth client ID** of type "Web application".
2. Add this as an authorized redirect URI: `https://scentdna.owlava.com/api/oauth2-redirect`
3. In the dashboard: **Collections → users → ⚙ Options → OAuth2**. Enable it, add **Google**, and paste the client ID and secret.

The "Continue with Google" button appears on the sign-in page automatically once it's enabled.

## Step 5: turn on backups

In the dashboard: **Settings → Backups**. Turn on automatic backups (for example daily at 03:00) and keep at least 7. For extra safety, also take a Contabo snapshot now and then from their control panel.

Rate limiting is already turned on by the setup (it slows down password guessing and spam). You can adjust it in **Settings → Application → Rate limiting**.

## Looking after the community

You're the moderator. Everything is in the dashboard (`https://scentdna.owlava.com/_/`):

- **Reports:** open the **reports** collection to see what people reported and why. Each report links to the review or reply.
- **Automatic hiding:** when 3 different people report the same review or reply, it's hidden from everyone except its author. To bring it back, open it in **reviews** (or **review_replies**) and untick **hidden**. To remove it for good, delete it.
- **Removing a review or a member:** open **reviews** or **users**, select the record and delete it. Deleting a member also deletes their reviews, replies and likes.
- Members can't like their own reviews, can review each perfume once (they can edit it), and can't see which reviews other people liked.

## Updating the site later

When the site changes on GitHub, run this on the server:

```
sudo /opt/scentdna/update.sh
```

## Moving the bottle photos

The photos are already in the GitHub repository, so the setup script copies them to the server automatically.

## Useful commands

| What | Command |
|---|---|
| Is it running? | `systemctl status scentdna` |
| Restart | `sudo systemctl restart scentdna` |
| Live log | `journalctl -u scentdna -f` |
| Reset an admin password | `sudo -u scentdna /opt/scentdna/pocketbase superuser upsert EMAIL NEWPASSWORD --dir /opt/scentdna/pb_data` |

## What's stored

| Collection | What it holds | Who can see it |
|---|---|---|
| `users` | Email, password (hashed), name, photo (`avatar`), `scent_type`, `birthday`, `favorites` (perfume IDs), `accords` and `notes` (names), `wishlist` and `owned` (perfume IDs), `profile_made` (date) | Name, photo and scent type are public (shown with reviews). Everything else only the member. |
| `reviews` | Member, perfume ID, stars (1 to 5), text, like and reply counts, `hidden` | Everyone, unless hidden |
| `review_replies` | Member, review, text, `hidden` | Everyone, unless hidden |
| `review_likes` | Member, review | Only the member who liked |
| `reports` | Member, review or reply, reason | Only you |
| `perfume_stats` | Average stars, review count and star spread per perfume, worked out automatically from `reviews` | Everyone |
| `community_stats` | Total members, reviews and perfumes rated, for the Community page | Everyone |
| `top_reviewers` | Review and "helpful" counts per member, for the Community page | Everyone |

Deleting an account from the site removes the member, their photo, reviews, replies, likes and reports.

Photo files are served from addresses with a random part in the name, so they can't be guessed, but anyone who has a photo's exact address can open it.

## Files in this folder

| File | What it is |
|---|---|
| `setup.sh` | One-time server setup |
| `update.sh` | Pulls the latest site from GitHub and restarts |
| `pb_migrations/` | Creates the Scent DNA fields, the community collections and their privacy rules. Runs automatically. |
| `pb_hooks/` | Server rules the database can't express on its own: hiding private profile fields from other people, like and reply counts, and hiding posts after 3 reports. |
