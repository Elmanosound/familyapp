# FamilyApp

Application web familiale tout-en-un inspiree de FamilyWall. Organisez la vie de votre famille en un seul endroit : calendrier partage, listes de courses, messagerie en temps reel, partage de photos, localisation, budget et planification de repas.

## Fonctionnalites

- **Calendrier partage** — Evenements familiaux avec recurrence, rappels et assignation aux membres
- **Listes de courses et taches** — Listes collaboratives en temps reel (courses, taches, personnalisees)
- **Messagerie instantanee** — Chat familial temps reel avec indicateur de frappe et accuses de lecture
- **Galerie photo/video** — Albums, likes, commentaires et stockage cloud (Cloudinary)
- **Localisation en temps reel** — Carte familiale avec geofences et alertes d'entree/sortie
- **Gestion du budget** — Suivi des depenses par categorie, objectifs d'epargne et analyse des tendances
- **Planification des repas** — Recettes, menu de la semaine et generation automatique de liste de courses
- **Multi-groupes** — Creez des groupes famille, amis, voisins ou personnalises
- **Authentification securisee** — JWT avec refresh token, hashage bcrypt

## Stack technique

| Couche | Technologies |
|--------|-------------|
| **Frontend** | React 19, TypeScript, Vite 6, TailwindCSS 3, Zustand, React Router 7, Recharts, Leaflet, Socket.IO Client |
| **Backend** | Node.js, Express 4, TypeScript, Prisma 6, Socket.IO, Zod, Helmet, JWT |
| **Base de donnees** | SQLite (par defaut) ou PostgreSQL |
| **Stockage fichiers** | Cloudinary (optionnel) |
| **Email** | Nodemailer / SMTP (optionnel) |

## Architecture

```
familyapp/
├── client/             # Application React (Vite)
│   ├── src/
│   │   ├── components/ # Composants UI reutilisables (layout, ui)
│   │   ├── config/     # Configuration API et Socket.IO
│   │   ├── pages/      # Pages de l'application (12 pages)
│   │   ├── router/     # Routes et protection d'acces
│   │   ├── stores/     # State management Zustand (auth, family, ui)
│   │   └── styles/     # Styles globaux TailwindCSS
│   ├── tailwind.config.ts
│   └── vite.config.ts
├── server/             # API REST + WebSocket
│   ├── prisma/
│   │   └── schema.prisma  # Schema de la base de donnees
│   ├── src/
│   │   ├── controllers/   # Logique metier (auth, family, calendar, list, message, media, location, budget, meal)
│   │   ├── middleware/     # Auth, erreurs, upload, verification famille
│   │   ├── routes/        # Endpoints REST
│   │   ├── socket/        # Evenements temps reel Socket.IO
│   │   ├── config/        # Configuration DB et variables d'environnement
│   │   └── utils/         # JWT, gestion d'erreurs
│   └── tsconfig.json
├── shared/             # Types TypeScript partages
│   └── src/types/      # User, Family, Calendar, List, Message, Media, Location, Budget, Meal, SocketEvents
└── package.json        # Monorepo workspaces
```

## Pre-requis

- **Node.js** >= 18 (LTS recommande)
- **npm** >= 9
- **Base de donnees** : aucune installation requise par defaut (SQLite embarque).
  PostgreSQL 14+ est supporte en option (voir [Basculer vers PostgreSQL](#basculer-vers-postgresql)).

## Installation rapide

```bash
# 1. Cloner le projet
git clone <url-du-repo>
cd familyapp

# 2. Installer les dependances (monorepo npm workspaces)
npm install

# 3. Configurer les variables d'environnement
cp .env.example server/.env
# Editez server/.env (section Configuration ci-dessous)

# 4. Initialiser la base de donnees (SQLite par defaut)
npm run --workspace=server db:generate
npm run --workspace=server db:push

# 5. Lancer l'application (client + serveur en parallele)
npm run dev
```

L'application sera disponible sur :
- **Client** : http://localhost:5173
- **API REST** : http://localhost:5000/api/v1
- **Health check** : http://localhost:5000/health
- **Prisma Studio** (explorateur de DB) : `npm run --workspace=server db:studio`

> **Note** : avec la configuration par defaut (SQLite), un fichier `server/prisma/dev.db`
> est cree automatiquement. Aucun service externe n'est necessaire pour demarrer.

## Configuration

Le fichier `server/.env` pilote **l'ensemble** du backend. Voici la liste
exhaustive des variables, leur role et leur valeur par defaut.

### Serveur

| Variable | Description | Defaut |
|----------|-------------|--------|
| `PORT` | Port d'ecoute de l'API Express. Doit correspondre au proxy du client Vite. | `5000` |
| `NODE_ENV` | Environnement d'execution. En `development`, Prisma logue les warnings et les erreurs. | `development` |
| `CLIENT_URL` | URL absolue du client. Utilisee pour la politique CORS et les liens inclus dans les emails (reset password, invitations). | `http://localhost:5173` |

### Base de donnees

| Variable | Description | Defaut |
|----------|-------------|--------|
| `DATABASE_URL` | Chaine de connexion Prisma. Format SQLite : `file:./dev.db`. Format PostgreSQL : `postgresql://user:password@host:port/db`. | `file:./dev.db` |

- **SQLite (par defaut)** — le chemin est relatif a `server/prisma/`. Aucune
  installation requise, parfait pour demarrer et pour les demos locales.
- **PostgreSQL** — voir la section [Basculer vers PostgreSQL](#basculer-vers-postgresql)
  pour activer le provider et configurer pgAdmin.

### Authentification JWT

| Variable | Description | Defaut |
|----------|-------------|--------|
| `JWT_SECRET` | Cle secrete utilisee pour signer les **access tokens**. **A remplacer imperativement en production.** | `dev-jwt-secret` |
| `JWT_REFRESH_SECRET` | Cle secrete distincte pour signer les **refresh tokens**. Doit etre differente de `JWT_SECRET`. | `dev-refresh-secret` |
| `JWT_EXPIRES_IN` | Duree de vie du token d'acces. Format : `15m`, `1h`, `2d`... | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Duree de vie du refresh token. | `7d` |

> Pour generer des secrets robustes :
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
> ```

### Cloudinary (upload photos / videos — optionnel)

Ces variables ne sont requises que pour le module **Photos**. Sans elles, le
reste de l'application fonctionne normalement ; seul l'upload de media echouera.

| Variable | Description | Defaut |
|----------|-------------|--------|
| `CLOUDINARY_CLOUD_NAME` | Nom du cloud, visible sur le dashboard Cloudinary. | *(vide)* |
| `CLOUDINARY_API_KEY` | Cle API publique. | *(vide)* |
| `CLOUDINARY_API_SECRET` | Secret API (ne jamais committer). | *(vide)* |

Creez un compte gratuit sur [cloudinary.com](https://cloudinary.com) puis
copiez les trois cles depuis **Dashboard → Product Environment Credentials**.

### Email SMTP (reset password / invitations — optionnel)

Ces variables ne sont requises que pour l'envoi d'emails (reinitialisation
de mot de passe, invitations a rejoindre un groupe). Sans elles, les requetes
aboutissent mais aucun email n'est envoye.

| Variable | Description | Defaut |
|----------|-------------|--------|
| `SMTP_HOST` | Serveur SMTP sortant. | `smtp.gmail.com` |
| `SMTP_PORT` | Port SMTP (587 pour STARTTLS, 465 pour SSL). | `587` |
| `SMTP_USER` | Adresse email expedit**rice**. | *(vide)* |
| `SMTP_PASS` | Mot de passe SMTP. Pour Gmail, generez un **mot de passe d'application** via [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (la double authentification doit etre activee). | *(vide)* |

### Client (Vite — optionnel)

Le client utilise par defaut le proxy Vite (`/api` → `http://localhost:5000`).
Vous ne devez surcharger ces variables que si vous deployez le client
separement du serveur. Creez alors un fichier `client/.env.local` :

| Variable | Description | Defaut |
|----------|-------------|--------|
| `VITE_API_URL` | URL absolue de l'API REST. | `http://localhost:5000/api/v1` |
| `VITE_SOCKET_URL` | URL absolue du serveur Socket.IO. | `http://localhost:5000` |

### Exemple complet minimal (`server/.env`)

```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# Pour PostgreSQL (defaut du schema actuel)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/familyapp

JWT_SECRET=change-this-to-a-long-random-string
JWT_REFRESH_SECRET=change-this-to-another-long-random-string
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

> **Mode SQLite (sans installation Postgres)** : changez le `provider` dans
> `server/prisma/schema.prisma` en `"sqlite"` puis utilisez
> `DATABASE_URL=file:./dev.db`. Pratique pour un demarrage instantane.

Cette configuration minimale suffit pour lancer **auth, familles, calendrier,
listes, messagerie, localisation, budget et repas**. Ajoutez Cloudinary et
SMTP uniquement si vous utilisez les modules concernes.

## Deploiement

### Avec Docker Compose (recommande pour prod / NAS / VM)

La stack inclut un `Dockerfile` multi-stage et un `docker-compose.yml` qui
demarre **Postgres + l'app** en une commande. Identique en local, sur ton NAS,
ou sur une VM Cloud.

```bash
cp .env.docker.example .env
# Editer .env (POSTGRES_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET)
docker compose up -d --build
```

L'app est ensuite accessible sur http://localhost:8080.

### Sur Google Cloud

Voir le guide complet : [`docs/deploy-gcp.md`](docs/deploy-gcp.md).

Deux strategies sont documentees :

- **Compute Engine `e2-micro`** (recommande) — VM dans le **free tier perpetuel**
  GCP, deploie via `docker compose up`. Cout : **0 €** apres les 90 jours.
  Identique a un futur deploiement NAS.
- **Cloud Run + Cloud SQL** — serverless, scale a zero, HTTPS auto. Necessite
  une migration des uploads vers Cloud Storage.

## Basculer vers PostgreSQL

SQLite est activee par defaut pour simplifier le demarrage. Pour utiliser
PostgreSQL (recommande en production) :

1. **Installer PostgreSQL** — telechargez [PostgreSQL 14+](https://www.postgresql.org/download/).
   L'installateur Windows inclut **pgAdmin 4** (client graphique).
2. **Creer la base** — ouvrez pgAdmin, connectez-vous au serveur local
   (par defaut `localhost:5432`, utilisateur `postgres`), faites un clic
   droit sur *Databases* → *Create → Database*, nom : `familyapp`.
   Alternative en ligne de commande :
   ```bash
   psql -U postgres -c "CREATE DATABASE familyapp;"
   ```
3. **Modifier le schema Prisma** — dans `server/prisma/schema.prisma`,
   remplacez :
   ```prisma
   datasource db {
     provider = "sqlite"
     url      = env("DATABASE_URL")
   }
   ```
   par :
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
4. **Mettre a jour `server/.env`** :
   ```env
   DATABASE_URL=postgresql://postgres:VOTRE_MOT_DE_PASSE@localhost:5432/familyapp
   ```
   Remplacez `VOTRE_MOT_DE_PASSE` par celui defini lors de l'installation.
5. **Regenerer le client et pousser le schema** :
   ```bash
   npm run --workspace=server db:generate
   npm run --workspace=server db:push
   ```
6. **Redemarrer** `npm run dev`. Vous pouvez inspecter les donnees avec
   pgAdmin ou avec Prisma Studio (`npm run --workspace=server db:studio`).

### Ou trouver les informations de connexion dans pgAdmin ?

- **Host** : visible dans *Servers → PostgreSQL → Properties → Connection*.
  Par defaut `localhost`.
- **Port** : meme onglet, par defaut `5432`.
- **Username** : par defaut `postgres`, visible dans la meme fenetre.
- **Password** : celui que vous avez saisi lors de l'installation de
  PostgreSQL. Si vous l'avez oublie, vous pouvez le reinitialiser en editant
  `pg_hba.conf` puis en utilisant `ALTER USER postgres WITH PASSWORD 'nouveau';`.
- **Database** : apparait sous *Databases* dans l'arborescence ; utilisez le
  nom exact (`familyapp`).

## Scripts disponibles

```bash
# Developpement
npm run dev              # Lance serveur + client en parallele
npm run dev:server       # Lance le serveur uniquement
npm run dev:client       # Lance le client uniquement

# Base de donnees
npm run --workspace=server db:generate  # Generer le client Prisma
npm run --workspace=server db:push      # Appliquer le schema a la DB
npm run --workspace=server db:migrate   # Lancer les migrations
npm run --workspace=server db:studio    # Ouvrir Prisma Studio

# Build
npm run build            # Build complet (shared → server → client)
```

## API REST

Toutes les routes sont prefixees par `/api/v1`.

| Methode | Route | Description |
|---------|-------|-------------|
| POST | `/auth/register` | Inscription |
| POST | `/auth/login` | Connexion |
| GET | `/auth/me` | Profil utilisateur |
| PATCH | `/auth/profile` | Modifier le profil |
| POST | `/families` | Creer un groupe |
| GET | `/families` | Lister mes groupes |
| POST | `/families/:id/invite` | Inviter un membre |
| GET | `/families/:id/calendar/events` | Evenements du calendrier |
| POST | `/families/:id/calendar/events` | Creer un evenement |
| GET | `/families/:id/lists` | Listes du groupe |
| POST | `/families/:id/lists` | Creer une liste |
| GET | `/families/:id/messages` | Historique de messages |
| GET | `/families/:id/media` | Galerie media |
| GET | `/families/:id/location` | Localisations |
| GET | `/families/:id/budget/expenses` | Depenses |
| GET | `/families/:id/meals/plans` | Plans de repas |

## Evenements temps reel (Socket.IO)

### Client → Serveur

| Evenement | Description |
|-----------|-------------|
| `chat:send` | Envoyer un message |
| `chat:typing` | Indicateur de frappe |
| `chat:read` | Accuse de lecture |
| `location:update` | Mettre a jour sa position |
| `list:item:toggle` | Cocher/decocher un element |
| `list:item:add` | Ajouter un element a une liste |

### Serveur → Client

| Evenement | Description |
|-----------|-------------|
| `chat:message` | Nouveau message recu |
| `chat:typing` | Quelqu'un ecrit... |
| `chat:read` | Accuses de lecture |
| `location:updated` | Position mise a jour |
| `location:geofence` | Alerte geofence (entree/sortie) |
| `list:updated` | Liste modifiee |
| `calendar:updated` | Evenement calendrier modifie |
| `family:notification` | Notification familiale |

## Modeles de donnees

Les principaux modeles Prisma :

- **User** — Comptes utilisateurs avec preferences de notification
- **Family** — Groupes (famille, amis, voisins) avec parametres
- **FamilyMember** — Relation membre-famille avec role (admin/member/child) et couleur
- **CalendarEvent** — Evenements avec recurrence et rappels
- **List / ListItem** — Listes collaboratives avec assignation
- **Message** — Messages avec accuses de lecture et reponses
- **Media / Album** — Photos et videos avec likes et commentaires
- **Location / Geofence** — Positions GPS et zones geographiques
- **Expense / BudgetGoal** — Depenses et objectifs financiers
- **Recipe / MealPlan / MealSlot** — Recettes et planification des repas

## Licence

MIT
