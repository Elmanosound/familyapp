# Déploiement sur Google Cloud Platform

Deux chemins sont documentés ici, du plus simple au plus "cloud-native".

| Chemin | Coût après les 90 jours / 300 $ | Identique au NAS ? | Complexité |
|--------|---------------------------------|--------------------|------------|
| **A. Compute Engine `e2-micro`** | **0 €** (free tier perpétuel) | ✅ Oui | ⭐ |
| **B. Cloud Run + Cloud SQL** | ~10-15 €/mois | ❌ Non | ⭐⭐⭐ |

> **Recommandation pour ce projet** : **Chemin A**. Il consomme zéro crédit, reste gratuit après les 90 jours, et la même `docker-compose.yml` se redéploiera à l'identique sur ton NAS Ubuntu plus tard.

---

## Chemin A — Compute Engine `e2-micro` (recommandé)

### Pré-requis
- Compte GCP avec facturation activée
- [`gcloud` CLI](https://cloud.google.com/sdk/docs/install) installé localement
- Repo poussé sur GitHub (déjà fait)

### 1. Préparer le projet GCP

```bash
# Authentification
gcloud auth login

# Choisir le projet (remplace par ton ID de projet)
gcloud config set project YOUR_PROJECT_ID

# Activer les API nécessaires
gcloud services enable compute.googleapis.com

# La zone DOIT être us-west1, us-central1 ou us-east1 pour bénéficier
# du free tier perpétuel sur e2-micro.
gcloud config set compute/zone us-central1-a
```

### 2. Créer la VM `e2-micro`

```bash
gcloud compute instances create familyapp \
  --machine-type=e2-micro \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-standard \
  --tags=http-server,https-server \
  --metadata=startup-script='#!/bin/bash
set -e
apt-get update
apt-get install -y ca-certificates curl gnupg git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker
'
```

> Le `startup-script` installe Docker automatiquement au premier boot.
> Compte ~2 minutes après la création avant que Docker soit prêt.

### 3. Ouvrir les ports HTTP/HTTPS

```bash
gcloud compute firewall-rules create allow-http \
  --allow=tcp:80,tcp:443,tcp:8080 \
  --target-tags=http-server,https-server
```

### 4. Se connecter à la VM

```bash
gcloud compute ssh familyapp
```

### 5. Cloner le repo et déployer

```bash
# Sur la VM
git clone https://github.com/Elmanosound/familyapp.git
cd familyapp

# Créer le fichier .env
cp .env.docker.example .env
nano .env
# → renseigne POSTGRES_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET
# → mets CLIENT_URL=http://EXTERNAL_IP:8080 (récupère l'IP ci-dessous)

# Récupérer l'IP externe (depuis ton poste local)
gcloud compute instances describe familyapp --format='get(networkInterfaces[0].accessConfigs[0].natIP)'

# Démarrer la stack
sudo docker compose up -d --build

# Vérifier les logs
sudo docker compose logs -f app
```

### 6. Tester

Ouvre `http://EXTERNAL_IP:8080` dans ton navigateur. L'app devrait répondre.

### 7. (Optionnel) Activer HTTPS avec un nom de domaine

Si tu as un nom de domaine que tu peux faire pointer vers l'IP de la VM :

```bash
# Sur la VM, dans le repo
nano .env
# Décommente DOMAIN=family.example.com (ton domaine)

nano docker-compose.yml
# Décommente le service `caddy` et ses volumes (lignes commentées)
# Commente la ligne `ports: 8080:8080` du service app pour que seul Caddy soit exposé

sudo docker compose up -d --build
```

Caddy obtient automatiquement un certificat Let's Encrypt.

### 8. Mises à jour

```bash
cd ~/familyapp
git pull
sudo docker compose up -d --build
```

### 9. Surveillance des coûts

L'instance `e2-micro` dans `us-central1` est dans le **free tier perpétuel**
(744h/mois = 1 instance permanente). Le trafic sortant est gratuit jusqu'à 1 GB/mois.

> ⚠️ **Hors free tier**, vérifie ta région : `e2-micro` dans `europe-west1` n'est PAS gratuite.

```bash
# Suivre la consommation
gcloud billing accounts list
gcloud beta billing budgets list --billing-account=YOUR_BILLING_ACCOUNT_ID
```

---

## Chemin B — Cloud Run + Cloud SQL (cloud-native)

### Avantages
- Scale to zero (0 € quand personne ne se connecte)
- HTTPS automatique sur `*.run.app`
- Pas de VM à maintenir

### Inconvénients
- Cloud SQL `db-f1-micro` ≈ **7-10 €/mois** (pas dans le free tier perpétuel)
- Les uploads `server/uploads/` ne survivent pas → migrer vers Cloud Storage
- WebSocket Socket.IO nécessite des sticky sessions (configurable)

### 1. Activer les API

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com
```

### 2. Créer la base Cloud SQL

```bash
# Instance la plus petite (~7 €/mois)
gcloud sql instances create familyapp-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=europe-west1 \
  --root-password='STRONG_PASSWORD_HERE'

# Créer la base de données
gcloud sql databases create familyapp --instance=familyapp-db

# Créer un user dédié (recommandé)
gcloud sql users create familyapp-user --instance=familyapp-db --password='ANOTHER_STRONG_PASSWORD'
```

### 3. Créer un bucket Cloud Storage pour les uploads

```bash
gcloud storage buckets create gs://familyapp-uploads-$(gcloud config get-value project) \
  --location=europe-west1 \
  --uniform-bucket-level-access

# Rendre les objets publics en lecture (les URLs seront en clair)
gcloud storage buckets add-iam-policy-binding gs://familyapp-uploads-$(gcloud config get-value project) \
  --member=allUsers \
  --role=roles/storage.objectViewer
```

> ⚠️ **À implémenter dans le code** : le `MediaController` actuel sauvegarde
> sur le disque local (`server/uploads/`). Pour Cloud Run il faut basculer
> sur `@google-cloud/storage`. Voir [TODO: adaptateur GCS] dans
> `server/src/middleware/upload.ts`.

### 4. Build et push de l'image

```bash
# Créer un repo Artifact Registry
gcloud artifacts repositories create familyapp \
  --repository-format=docker \
  --location=europe-west1

# Build et push via Cloud Build (gratuit jusqu'à 120 min/jour)
gcloud builds submit --tag europe-west1-docker.pkg.dev/$(gcloud config get-value project)/familyapp/app:latest
```

### 5. Déployer sur Cloud Run

```bash
INSTANCE_CONNECTION=$(gcloud sql instances describe familyapp-db --format='value(connectionName)')

gcloud run deploy familyapp \
  --image=europe-west1-docker.pkg.dev/$(gcloud config get-value project)/familyapp/app:latest \
  --region=europe-west1 \
  --platform=managed \
  --allow-unauthenticated \
  --add-cloudsql-instances=$INSTANCE_CONNECTION \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --session-affinity \
  --set-env-vars="NODE_ENV=production,JWT_EXPIRES_IN=15m,JWT_REFRESH_EXPIRES_IN=7d" \
  --set-secrets="JWT_SECRET=jwt-secret:latest,JWT_REFRESH_SECRET=jwt-refresh-secret:latest,DATABASE_URL=database-url:latest"
```

### 6. Stocker les secrets dans Secret Manager

```bash
echo -n "your-strong-jwt-secret" | gcloud secrets create jwt-secret --data-file=-
echo -n "your-strong-jwt-refresh-secret" | gcloud secrets create jwt-refresh-secret --data-file=-

# DATABASE_URL utilise le socket Unix Cloud SQL
echo -n "postgresql://familyapp-user:ANOTHER_STRONG_PASSWORD@localhost/familyapp?host=/cloudsql/$INSTANCE_CONNECTION" \
  | gcloud secrets create database-url --data-file=-

# Donner les droits d'accès au compte de service Cloud Run
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')
for SECRET in jwt-secret jwt-refresh-secret database-url; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member=serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
    --role=roles/secretmanager.secretAccessor
done
```

### 7. Récupérer l'URL publique

```bash
gcloud run services describe familyapp --region=europe-west1 --format='value(status.url)'
```

---

## Comparaison rapide

|                          | e2-micro (Chemin A) | Cloud Run (Chemin B) |
|--------------------------|---------------------|----------------------|
| Coût mensuel hors free   | **0 €**             | ~10-15 €             |
| Mise en place            | 5 commandes         | ~15 commandes        |
| Persistance uploads      | volume Docker       | bucket Cloud Storage (à coder) |
| HTTPS                    | Caddy (manuel)      | Auto sur `*.run.app` |
| Scale à zéro             | Non (toujours up)   | Oui                  |
| Mêmes commandes que NAS  | ✅ identique         | ❌ différent          |
| RAM disponible           | 1 GB                | jusqu'à 32 GB        |
| Limites WebSocket        | Aucune              | 60 min max par connexion |

---

## Nettoyer pour ne pas dépasser le crédit

```bash
# Supprimer une VM
gcloud compute instances delete familyapp

# Supprimer une instance Cloud SQL (⚠️ supprime les données)
gcloud sql instances delete familyapp-db

# Supprimer un service Cloud Run
gcloud run services delete familyapp --region=europe-west1
```
