# Hibba — Google Cloud / Firebase Deployment Guide

This guide walks through deploying the Hibba Finance & HR OS to Google Cloud Run (backend API) and Firebase Hosting (frontend), with automatic CI/CD via Google Cloud Build triggered from GitHub.

---

## Architecture Overview

| Layer | Service | Region |
|---|---|---|
| Frontend (React SPA) | Firebase Hosting (CDN) | Global |
| Backend API (Node.js/Express) | Google Cloud Run | europe-west2 (London) |
| Database | Cloud SQL (MySQL 8) or PlanetScale | europe-west2 |
| File Storage | Google Cloud Storage | europe-west2 |
| CI/CD | Google Cloud Build | Triggered on GitHub push |
| Secrets | Google Secret Manager | europe-west2 |

---

## Prerequisites

Before starting, ensure you have:

1. A Google Cloud account with billing enabled.
2. The `gcloud` CLI installed and authenticated (`gcloud auth login`).
3. The `firebase` CLI installed (`npm install -g firebase-tools`) and authenticated (`firebase login`).
4. Docker installed locally (for testing the image before deploying).
5. The Hibba source code pushed to a GitHub repository.

---

## Step 1 — Create a Google Cloud Project

```bash
gcloud projects create hibba-finance-hr --name="Hibba Finance HR"
gcloud config set project hibba-finance-hr
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com
```

---

## Step 2 — Create Artifact Registry Repository

```bash
gcloud artifacts repositories create hibba \
  --repository-format=docker \
  --location=europe-west2 \
  --description="Hibba Docker images"
```

---

## Step 3 — Store Secrets in Secret Manager

Replace the values below with your actual credentials:

```bash
# Database connection string
echo -n "mysql://user:password@host:3306/hibba" | \
  gcloud secrets create hibba-db-url --data-file=-

# JWT signing secret (generate a random 64-char string)
echo -n "your-64-char-random-secret" | \
  gcloud secrets create hibba-jwt-secret --data-file=-

# Manus Forge API key (for Gemini/LLM access)
echo -n "your-forge-api-key" | \
  gcloud secrets create hibba-forge-api-key --data-file=-

# AWS S3 credentials (for file/backup storage)
echo -n "your-aws-access-key" | gcloud secrets create hibba-aws-key --data-file=-
echo -n "your-aws-secret" | gcloud secrets create hibba-aws-secret --data-file=-
```

---

## Step 4 — Connect GitHub to Cloud Build

1. Go to [Cloud Build Triggers](https://console.cloud.google.com/cloud-build/triggers) in the Google Cloud Console.
2. Click **Connect Repository** → select GitHub → authorise and choose your `hibba-finance-hr` repository.
3. Click **Create Trigger** → set it to trigger on push to the `main` branch → point it at `cloudbuild.yaml`.

Cloud Build will now automatically build and deploy on every push to `main`.

---

## Step 5 — Set Up Firebase Hosting

```bash
# Initialise Firebase in the project directory
firebase use --add hibba-finance-hr

# Deploy frontend only (backend is on Cloud Run)
firebase deploy --only hosting
```

The `firebase.json` file in this repo already configures:
- Static assets served from `dist/client/`
- All `/api/**` requests proxied to the `hibba-api` Cloud Run service
- All other routes rewritten to `index.html` (SPA routing)

---

## Step 6 — Set Custom Domain

In the [Firebase Console](https://console.firebase.google.com) → Hosting → Add custom domain:
- Add `hibba.io` and follow the DNS verification steps.
- Add `hibbapay.com` as a second site if needed.

---

## Step 7 — Environment Variables on Cloud Run

After the first deployment, add the secret references to the Cloud Run service:

```bash
gcloud run services update hibba-api \
  --region=europe-west2 \
  --set-secrets=\
DATABASE_URL=hibba-db-url:latest,\
JWT_SECRET=hibba-jwt-secret:latest,\
BUILT_IN_FORGE_API_KEY=hibba-forge-api-key:latest
```

---

## Local Docker Test (Optional)

To test the Docker image locally before deploying:

```bash
docker build -t hibba-api .
docker run -p 8080:8080 \
  -e DATABASE_URL="your-db-url" \
  -e JWT_SECRET="your-secret" \
  -e NODE_ENV=production \
  hibba-api
```

Then open `http://localhost:8080` to verify the app runs correctly.

---

## Voice Agent — Gemini Integration

The Hibba AI Voice Agent already uses **Gemini 2.5 Flash** as its underlying model. When deploying to Google Cloud, you can optionally switch from the Manus Forge proxy to the native Vertex AI Gemini endpoint:

1. Enable the Vertex AI API: `gcloud services enable aiplatform.googleapis.com`
2. Update `BUILT_IN_FORGE_API_URL` to point to your Vertex AI endpoint.
3. The `invokeLLM` helper in `server/_core/llm.ts` will automatically use it.

---

## Estimated Monthly Costs (Google Cloud)

| Service | Estimated Cost |
|---|---|
| Cloud Run (low traffic, min 0 instances) | £0 – £15/month |
| Firebase Hosting (CDN + 10GB bandwidth) | £0 – £5/month |
| Cloud SQL MySQL (db-f1-micro) | ~£10/month |
| Cloud Storage (backups + files, 10GB) | ~£2/month |
| Secret Manager | < £1/month |
| **Total** | **~£12 – £33/month** |

---

*Official Platform of the Abdullah Quilliam Society · Securely managed via Hibba.io*
