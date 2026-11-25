# Fork notes

This repository is a fork of [SONGOAO25/dsh-chatgpt-sub](https://github.com/SONGOAO25/dsh-chatgpt-sub) (MIT, © 2026 SONGOAO25; the original `LICENSE` is unchanged). It adds exactly one capability and the safety work that capability needs. Everything else — the Sign in with ChatGPT flow, the local Responses normalising proxy, the Codex quota keep-alive, the update UI — is upstream code.

Install **this repository**, not the package name:

```
https://github.com/kappyra/dsh-chatgpt-sub
```

The npm package `dsh-chatgpt-sub` is the upstream project. Both packages share the name, so a package-name install gets upstream's code without the changes below.

## Why a fork was needed

Upstream declared each ChatGPT model with an id and a display name only:

```yaml
models:
  - id: gpt-6.1-sol
    name: GPT-6.1-Sol
```

DSH's `llm-pi-ai` adapter does not guess reasoning capability. A model with no `reasoningEfforts` is reported as non-reasoning, so the model picker offers no effort control and `reasoning.effort` is never sent. The plugin was therefore usable only at whatever level the API defaults to.

## What this fork changes

| Area | Change |
| --- | --- |
| `src/host.js` | Declares `reasoningEfforts` per model on the `chatgpt-siwc` route, derived from the official model pages; adds a default-effort preference and the `setDefaultEffort` RPC; keeps levels edited by hand in **Settings → Models** |
| `src/client-bundle.js` | A **Reasoning effort** card on the plugin page (default level for new chats) |
| `src/locales.js` | The new strings in all 13 built-in languages |
| `src/version.js`, `src/host.js` | Fork builds keep automatic updates **off** (see below) |
| `.github/workflows` | Upstream's npm publish / release-please / auto-merge / npm-verify pipelines are removed; `ci.yml` and `codeql.yml` stay |
| `tests/` | Capability table, route mapping, override retention, and fork-safety regression tests |

### Effort levels per model

The table follows what the official model pages state (November 2026); a level that is not listed stays out, because an unsupported level is rejected with HTTP 400 instead of being clamped:

| Family | Levels offered |
| --- | --- |
| `gpt-6.1-terra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-*` | `none`, `low`, `medium`, `high`, `xhigh`, `max` |
| `gpt-6.1-sol`, `gpt-6-astra` | `low`, `medium`, `high`, `xhigh`, `max` |
| `gpt-6.2-sol`, `gpt-6.2-astra` | `low`, `medium`, `high` (the pages only state that `none` is rejected) |
| `gpt-5.5`, `gpt-5.2` | `none`, `low`, `medium`, `high`, `xhigh` |
| `gpt-5.3-codex` | `low`, `medium`, `high`, `xhigh` |
| `gpt-5`, `gpt-5-codex`, `gpt-5.1` | `minimal`, `low`, `medium`, `high` |
| `o1`–`o9` | `low`, `medium`, `high` |
| unrecognised `gpt-*` / `oN` | `low`, `medium`, `high` |
| non-reasoning (`gpt-4*`, embeddings, …) | none (`reasoningEfforts: false`) |

`off` is always present and means "send no `reasoning` field", which is how the provider's own default applies.

### Where you set it

- **Per chat** — the DSH model picker next to the model name. This is the per-request control and the one to use for a one-off deep run.
- **Default for new chats** — **Plugins → ChatGPT Subscription → Reasoning effort**.

The route default is a single value shared by every model on the route, so the card offers only the levels **all** current models accept. Choosing a level that is not applicable stores the preference but writes nothing to the route, and the card says so — writing it would make `llm-pi-ai` throw `UNSUPPORTED_REASONING_EFFORT` on the models that lack it.

The plugin rewrites the `chatgpt-siwc` route on every sync (ten minutes). Because **Settings → Models** is the official place to edit a hand-declared route, the sync reuses an existing valid `reasoningEfforts` map for a model that already has one, and only fills in models that have none. Levels you edit there are never overwritten.

## Automatic updates are off in this fork

Both packages are named `dsh-chatgpt-sub`, and the updater resolves updates through the npm registry. Left enabled, the next upstream npm release would replace this fork's `lib/` with upstream code and the effort support would silently disappear after a restart — code you installed and reviewed replaced by code you did not. Fork builds therefore require an explicit opt-in:

```bash
# only if you want the npm check back (it will overwrite this fork's files)
DSH_CHATGPT_SELF_UPDATE=on
```

Update the fork by reinstalling from this repository. The plugin page explains this in place of the usual "unavailable from a source/linked install" message.

## Verifying a build without touching a live install

`node scripts/dry-run-effort.mjs` runs the built host against a **copy** of your own bind flag in a temp directory with stubbed credentials and settings, then prints the route JSON the plugin would write — model ids and their levels only, never tokens, e-mail or the account id. Useful after changing the capability table.

## Keeping in sync with upstream

```bash
git remote add upstream https://github.com/SONGOAO25/dsh-chatgpt-sub.git
git fetch upstream
git merge upstream/main      # resolve src/host.js and src/locales.js by hand
node scripts/build.mjs && node tests/run-all.mjs
```

`src/locales.js` is rewritten wholesale by the build's locale step, so a merge conflict there is safest resolved by taking either side and re-applying the effort strings with the script that generated them.
