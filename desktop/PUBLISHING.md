# Publishing Parlour

## Local Build (signed + notarized DMG)

### 1. Install your signing certificate

Open Xcode → Settings → Accounts → select your team → Manage Certificates → create/download a **Developer ID Application** certificate. It gets added to your Keychain automatically.

### 2. Generate an app-specific password

Go to https://appleid.apple.com → Sign-In and Security → App-Specific Passwords → generate one.

### 3. Find your Team ID

Go to https://developer.apple.com/account → Membership Details → Team ID.

### 4. Set env vars and build

```bash
export APPLE_ID="your@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"

bun run dist
```

Output: `dist/parlour-1.0.0.dmg` (signed + notarized)

## GitHub Actions Release

Add these secrets in repo Settings → Secrets and variables → Actions:

| Secret | How to get it |
|--------|---------------|
| `CERTIFICATE_BASE64` | Export .p12 from Keychain Access, then `base64 -i cert.p12 \| pbcopy` |
| `CERTIFICATE_PASSWORD` | Password you set when exporting the .p12 |
| `APPLE_ID` | Your Apple Developer email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from step 2 above |
| `APPLE_TEAM_ID` | Team ID from step 3 above |

Then tag and push to trigger a release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This builds a signed+notarized DMG and attaches it to a GitHub Release.
