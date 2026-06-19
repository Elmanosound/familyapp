# FamilyApp — Application Android (Capacitor)

L'app Android réutilise le client web React. Capacitor l'emballe dans une
WebView native. Une seule base de code → web + desktop (Electron) + Android.

---

## 1. Prérequis (à installer une fois)

- **Node.js** (déjà présent pour le projet)
- **JDK 21** (Temurin/OpenJDK) — requis par Gradle
- **Android Studio** (inclut le Android SDK + l'émulateur)
  - Au premier lancement, installer un *SDK Platform* récent (API 34+) et les
    *Android SDK Build-Tools*.
- Variable d'environnement `JAVA_HOME` pointant vers le JDK.

> Sur cette machine, Java n'était pas installé : ces étapes sont nécessaires
> avant de pouvoir produire un APK.

---

## 2. Configurer l'URL du serveur (indispensable)

Dans une WebView, l'origine est `https://localhost` : les appels relatifs
`/api/v1` ne fonctionnent plus. Il faut une **URL absolue** que le téléphone
peut joindre.

Copier `client/.env.example` vers `client/.env.production` et renseigner :

```dotenv
# Test sur réseau local (serveur sur le PC/NAS) :
VITE_API_URL=http://192.168.1.20:5000/api/v1
# Production (serveur déployé) :
# VITE_API_URL=https://family.example.com/api/v1

# Optionnel — déduit automatiquement de VITE_API_URL si vide :
VITE_SOCKET_URL=
```

> ⚠️ Tant que le serveur n'a pas d'URL accessible (LAN ou Internet), l'app se
> lance mais ne peut pas se connecter ni charger de données.

---

## 3. Construire et ouvrir le projet Android

Depuis `client/` :

```bash
# Build du web + copie des assets dans le projet Android
npm run cap:sync

# Ouvre le projet dans Android Studio (Run ▶ pour lancer sur émulateur/appareil)
npm run cap:open
```

Générer un APK/AAB depuis Android Studio :
`Build > Build Bundle(s) / APK(s) > Build APK(s)`
(ou un AAB signé via `Build > Generate Signed Bundle / APK` pour le Play Store).

En ligne de commande (depuis `client/android/`) :

```bash
./gradlew assembleDebug      # APK de debug → app/build/outputs/apk/debug/
./gradlew bundleRelease      # AAB signé pour le Play Store (config de signature requise)
```

---

## 4. Test rapide sur un appareil physique (réseau local)

1. PC et téléphone sur le **même Wi-Fi**.
2. `VITE_API_URL` = `http://<IP-locale-du-PC>:5000/api/v1`.
3. **Autoriser le HTTP en clair** (sinon Android bloque les requêtes non-HTTPS) :
   dans `client/android/app/src/main/AndroidManifest.xml`, sur la balise
   `<application>`, ajouter `android:usesCleartextTraffic="true"`.
   > À ne PAS laisser pour une version de production : utiliser HTTPS.
4. Lancer le serveur (`npm run dev:server` à la racine), puis
   `npm run cap:sync && npm run cap:open` et exécuter sur l'appareil.

Live-reload (optionnel) : pointer l'app sur le serveur Vite plutôt que sur les
assets bundlés —
`CAP_SERVER_URL=http://<IP-locale>:5173 npm run cap:sync` (voir
`client/capacitor.config.ts`).

---

## 5. Ce qui a été adapté côté code

- **Auth.** Le refresh-token est dans un cookie HttpOnly (cross-site, donc non
  envoyé par la WebView). Le client natif s'identifie via l'en-tête
  `x-client-type: mobile` ; le serveur renvoie alors aussi le refresh-token dans
  le corps de la réponse et l'accepte dans le corps au refresh. Le web reste en
  cookie-only (inchangé).
- **CORS.** Le serveur (REST + Socket.io) autorise les origines Capacitor
  (`https://localhost`, `capacitor://localhost`).
- **URLs.** `VITE_API_URL` / `VITE_SOCKET_URL` permettent une URL absolue ;
  l'origine socket est déduite de l'API sur natif.

---

## 6. Déploiement du serveur (bloquant pour l'usage réel)

L'app mobile a besoin d'un backend joignable :

- **Réseau local / NAS** : OK à la maison sur le même Wi-Fi (HTTP en clair).
- **Internet (recommandé)** : déployer le serveur derrière HTTPS (Caddy est déjà
  configuré). Pointer `VITE_API_URL` sur le domaine public, rebuild, re-`cap:sync`.
