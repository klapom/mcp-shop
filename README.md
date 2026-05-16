# mcp-shop

Static Astro site for **Pommer Agents — MCP Knowledge Shop**.
Public: <https://shop.pommerconsulting.de>.

Renders product landing pages from `mcp-platform/products.yaml` (sales-flow),
links into the gateway at <https://mcp.pommerconsulting.de> (Stripe-checkout
+ OAuth/DCR trial-start).

## Local dev

```bash
npm ci
npm run dev        # → http://localhost:4321
npm run build      # → dist/
npm run preview    # serve dist/ locally
npx playwright test --project=chromium    # E2E
```

## Runtime architecture

```
GitHub main ─push─► self-hosted runner (dgx-mcp-shop)
                        │
                        │ npm ci + build (cached node_modules)
                        │ rsync dist/ → ~/projects/mcp-shop/dist/
                        │ systemctl --user restart mcp-shop
                        ▼
                  python3 -m http.server 34400 (systemd user-unit)
                        │
                        ▼
                  CF Tunnel ── shop.pommerconsulting.de
```

**Why python http.server**, not nginx / astro preview / serve?
Static output (one `index.html` per route) — no SPA fallback needed, no
build-on-start, no Node-runtime to keep running. 9 MB RAM, reboot-resilient.

## Deploy

Push to `main` → `.github/workflows/deploy.yml` runs on the self-hosted
DGX runner, builds, rsyncs, restarts. ~30s end-to-end. CI gate (smoke +
Playwright in `.github/workflows/ci.yml`) runs on `ubuntu-latest` in
parallel — must be green before the deploy is allowed to merge in a real
PR flow.

### Manual deploy / DGX recovery

```bash
cd ~/projects/mcp-shop
git pull
npm ci
npm run build
systemctl --user restart mcp-shop
```

### systemd units (in `systemd/`)

- `systemd/mcp-shop.service` — serves `dist/` on 127.0.0.1:34400.
  Installed at `~/.config/systemd/user/mcp-shop.service`. Reboot-resilient
  via `loginctl enable-linger admin`.

### Self-hosted runner

- Name: `dgx-mcp-shop`, labels: `self-hosted, linux, dgx, arm64`.
- Lives under `~/actions-runner-mcp-shop/` on DGX.
- Managed by `~/.config/systemd/user/gh-runner-mcp-shop.service`.
- Re-register if token expires:
  ```bash
  cd ~/actions-runner-mcp-shop
  ./config.sh remove --token "$(gh api -X POST repos/klapom/mcp-shop/actions/runners/remove-token --jq .token)"
  ./config.sh --url https://github.com/klapom/mcp-shop \
    --token "$(gh api -X POST repos/klapom/mcp-shop/actions/runners/registration-token --jq .token)" \
    --name dgx-mcp-shop --labels self-hosted,linux,dgx,arm64 \
    --work _work --unattended --replace
  ```

## Content sourcing

Product cards on `/products/` and individual product pages are generated
from `mcp-platform/products.yaml`. Marketing copy (`tagline`,
`description_long`, `use_cases`, `pricing_note`) lives there — when a
field is empty, pages render with a "Inhalt in Vorbereitung" placeholder.
