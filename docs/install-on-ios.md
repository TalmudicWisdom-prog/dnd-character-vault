# Install on iPad or iPhone

## Recommended deployment

Use GitHub Pages as a static HTTPS installer and update source. GitHub Pages receives only the built application files. Character data, uploaded PDFs, photos, and backups remain in IndexedDB on each device and are never included in deployment.

The hosted app is publicly reachable, but it contains no vault data and has no backend. Anyone opening the URL gets a new, empty vault on their own device.

## Publish the installer

This project includes `.github/workflows/deploy-pages.yml`.

1. Create an empty GitHub repository for the app.
2. Add this project to the repository and push it to the `main` branch.
3. On GitHub, open the repository's **Settings > Pages**.
4. Under **Build and deployment**, choose **GitHub Actions** as the source.
5. Open the repository's **Actions** tab and wait for **Deploy Character Vault to GitHub Pages** to finish.
6. Open the HTTPS address shown by the completed deployment.

Pushing a later change to `main` publishes an update. Opening the installed app while online lets the service worker download that update.

## Install on iPad or iPhone

1. Open the GitHub Pages HTTPS address in Safari. Do not use an in-app browser.
2. Wait for the Character Vault screen to finish loading.
3. Tap Safari's **Share** button.
4. Tap **Add to Home Screen**. If it is hidden, tap **Edit Actions** and enable it.
5. Confirm the name and tap **Add**.
6. Launch **Character Vault** from the Home Screen once while still online.
7. Open **Storage**, tap **Refresh**, and wait until **Offline app readiness** says **Ready offline**. The first install caches the app, PDF viewer, and offline OCR files.

## Verify offline use

1. In Character Vault, create a temporary character or confirm an existing character is visible.
2. Close the Home Screen app.
3. Turn off Wi-Fi and cellular data, or enable Airplane Mode.
4. Launch Character Vault from the Home Screen.
5. Confirm the app opens and the character is still visible.
6. Turn connectivity back on.

Vault records remain local to that specific installed app. Use **Vault Tools > Backup & Restore** for manual transfers and keep a recent backup because iOS can remove website data under storage pressure.

## Updating

1. Publish an update by pushing it to `main`.
2. Open Character Vault while connected to the internet.
3. Close and reopen it after the new app files finish downloading.

An update changes app files only. It does not replace local character data.
