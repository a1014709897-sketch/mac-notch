# Product website / GitHub Pages

Production: https://a1014709897-sketch.github.io/mac-notch/

`site/` is a buildless Chinese product site. All visual assets, scripts and styles are local. There are no analytics, external fonts, sign-ins or runtime API calls. The notch and quota UI is an explicitly labeled simulation; it does not read client state or launch installed apps from the browser.

Content and layout decisions are recorded in [网站设计复盘](DESIGN_REVIEW.md). Product illustration and animation styles live in `site/demo.css`; the shared page grid, typography, controls and responsive layout live in `site/styles.css`.

## Preview and deploy

```sh
npm run site:build
python3 -m http.server 4173 --bind 127.0.0.1 --directory .site-dist
```

Open http://127.0.0.1:4173. Rebuild and reload after changing files. The build validates asset and anchor references and JavaScript/Bash syntax, then copies only `site/` into `.site-dist/`. Published script and stylesheet URLs include a content hash so a new page cannot accidentally load old cached controls or styles.

`.github/workflows/pages.yml` validates the website and installer on pull requests. A push to `main` affecting website files also deploys the static artifact using GitHub Pages. The repository Pages source must be **GitHub Actions**. Website publishing does not update the existing app Release or its installers.

## Agent installation

```sh
curl -fsSL https://a1014709897-sketch.github.io/mac-notch/install.sh | bash
```

The script is readable at the same URL and in `site/install.sh`. It downloads the **fixed v0.2.1 prerelease** Apple Silicon or Intel ZIP from GitHub Releases, selected by hardware architecture (including Apple Silicon shells under Rosetta), and compares it against the architecture-specific SHA-256 recorded in source. It verifies the bundle ID, version, and ad-hoc signature integrity before copying into `~/Applications`. It does not request root, overwrite an existing app, launch it, delete settings, modify proxy settings, or change Gatekeeper/quarantine attributes. Ad-hoc integrity validation is not Apple Developer ID notarization.

For a download and validation run without installation:

```sh
curl -fsSL https://a1014709897-sketch.github.io/mac-notch/install.sh | bash -s -- --verify-only
```

On release updates, update version/hash in the script, the website's platform/version text, and installer fixture values together. Check the published GitHub asset digest, test on macOS, and deploy. The installation script intentionally does not select an unverified "latest" binary dynamically. Manual download links point explicitly to `releases/tag/v0.2.1`; GitHub latest does not select prereleases.

## Custom domain

The owner's domain is `jiejie.chat`, with DNS hosted by DNSPod. A dedicated `notch.jiejie.chat` subdomain is recommended; it does not consume the root domain. No custom hostname is activated until the owner chooses the hostname and DNS is configured.

1. Verify ownership of `jiejie.chat` in GitHub account Settings → Pages using the exact TXT token supplied by GitHub. Do not invent a verification value.
2. Add `notch.jiejie.chat` to this repository's Settings → Pages → Custom domain.
3. In DNSPod, add **CNAME**, host **notch**, target **a1014709897-sketch.github.io**. Do **not** include `https://` or `/mac-notch/` in the CNAME value. Leave unrelated records unchanged.
4. Wait for GitHub's DNS check and certificate provisioning, then enforce HTTPS. Propagation/certificates may take up to 24 hours.
5. Update canonical URL, Open Graph URL/image, installation URL and `scripts/site.js` command validation to the chosen HTTPS origin. Relative asset links already work at the root or project path.

This site is deployed by Actions, so a repository `CNAME` file is not used by GitHub Pages. GitHub's Pages setting controls the custom hostname.

GitHub's custom-domain documentation: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site

ICP filing and domain registration are separate. For non-mainland hosting, an unfiled domain can resolve and be used; mainland hosting has ICP requirements. This is not a blanket exemption from all other obligations. Aliyun's current guidance distinguishes ICP filing and public-security filing: https://help.aliyun.com/zh/icp-filing/not-for-the-record-dns-can-access-to-different-areas

## Manual website checks

- Desktop and mobile: no horizontal overflow, navigation and typography readable, download/script links work under `/mac-notch/`.
- Cycle idle/running/waiting/ended, switch tool, verify notch width unchanged and three dots on both tools.
- Idle always shows both companions. A single active tool has a full-bar click target.
- Double click, or Q while a notch button is focused, opens the simulated quota panel; Escape, close and outside click dismiss it. Verify focus returns to the trigger after Escape.
- Clipboard button copies the exact published command; permission failure selects the command and explains manual copy.
- FAQ opens with keyboard, and system reduced motion is respected.
- Public installer downloads and verifies the real published ZIP with `--verify-only`.
