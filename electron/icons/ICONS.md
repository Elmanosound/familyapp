# Icônes FamilyApp

Placez ici les fichiers d'icônes avant de lancer `npm run electron:build:linux`.

| Fichier       | Taille   | Usage                              |
|---------------|----------|------------------------------------|
| `icon.png`    | 512×512  | Icône principale (app launcher, fenêtre Electron) |
| `tray.png`    | 22×22    | Icône de la barre système (system tray) |
| `icon.icns`   | —        | macOS uniquement (non requis pour NAS) |
| `icon.ico`    | —        | Windows uniquement (non requis pour NAS) |

## Génération rapide avec ImageMagick

Si vous avez ImageMagick (`sudo apt install imagemagick`), vous pouvez convertir
un SVG source en PNG :

```bash
# Depuis la racine du projet :
convert -background none -resize 512x512 electron/icons/icon.svg electron/icons/icon.png
convert -background none -resize 22x22   electron/icons/icon.svg electron/icons/tray.png
```

Le script `scripts/install-nas.sh` tente cette conversion automatiquement si
`icon.svg` est présent et qu'ImageMagick est installé.
