# Radar Gencat Pro — 2026 (nova UI)

Aquesta carpeta conté la versió *ready-to-deploy* amb:

- UI minimalista (inspiració hero + cercador + fitxes)
- PWA (manifest + service worker)
- `scripts/sync.mjs` per generar `data/snapshot.json`
- Workflow GitHub Actions horari (Node 24)
- Configuració `vercel.json`

## Com fer-la servir

1) **Crea un repo nou** a GitHub (privat o públic) buid.
2) **Descomprimeix** aquest ZIP i **puja tot el contingut** (arrel = `index.html`, carpetes `.github/`, `scripts/`, `data/`, `icons/`).
3) A **Actions → Run workflow**, llança `Hourly sync snapshot` una vegada (crearà `data/snapshot.json`).
4) A **Vercel**: *Add New → Project → Import Git Repository* i selecciona el repo nou. Configura:
   - Framework: **Other**
   - Build/Output: **buit** (és web estàtica)
   - Deploy
5) L’URL pública quedarà activa i es redeployarà sola amb cada *commit* del workflow.

## Desenvolupament local
Obre `index.html` amb un servidor estàtic. La UI llegeix `data/snapshot.json`.
