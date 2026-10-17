# Running Scent DNA with accounts on your own server

The website works in two ways:

- **Without a server** (GitHub Pages, today): everything is saved in each visitor's browser. No accounts.
- **On your own server** (for example Contabo): visitors can create an account, and their Scent DNA is saved to your database and opens on any device. The site notices the server automatically; there's nothing to switch on in the code.

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

Also recommended: **Settings → Application → Rate limiting**, turn it on. It slows down anyone trying to guess passwords.

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

## What's stored for each account

The built-in `users` collection holds email, password (hashed), name, photo (`avatar`), plus these Scent DNA fields: `birthday`, `favorites` (perfume IDs), `accords` and `notes` (names), `profile_made` (date). Each person can only read and change their own record. Deleting an account from the site removes the record and the photo.

Photo files are served from addresses with a random part in the name, so they can't be guessed, but anyone who has a photo's exact address can open it.

## Files in this folder

| File | What it is |
|---|---|
| `setup.sh` | One-time server setup |
| `update.sh` | Pulls the latest site from GitHub and restarts |
| `pb_migrations/` | Adds the Scent DNA fields and privacy rules to the database. Runs automatically. |
