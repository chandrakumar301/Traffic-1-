# Traffic Whip

This repository contains a frontend (Vite + React + TypeScript) and a backend (Node.js + Express + WebSocket) for a traffic simulation and chat system.

Quick start

1. Backend

```powershell
cd backend
npm install
npm run dev   # runs with nodemon, default port 3001
```

2. Frontend

```powershell
# from repo root
npm install
npm run dev   # Vite runs on port 8080 (see vite.config.ts)
```

Notes
- Backend default port: 3001. It listens on process.env.PORT if set.
- Frontend dev server is configured on port 8080. In development you can either use the built-in fallback in the assistant UI or configure the Vite proxy to forward `/api` to the backend (recommended).

Vite proxy example (vite.config.ts):

```ts
server: {
  host: '::',
  port: 8080,
  proxy: {
    '/api': 'http://localhost:3001'
  }
}
```

Deploy
- Frontend: Vercel, Netlify, or any static host that supports Vite builds.
- Backend: Render, Railway, Fly, or similar. Make sure to set the PORT env var and allow WebSocket traffic.

Vercel deployment (frontend)

1. This repository builds the frontend with Vite and outputs static files into the `dist/` folder. A `vercel.json` is included to instruct Vercel to run `npm run build` and serve the `dist` folder as a static site.

2. Important: The backend (WebSocket + Express) requires a continuously running Node process and persistent WebSocket support. Vercel's Serverless Functions do not support persistent WebSocket connections. So you should deploy the backend to a separate host (Render, Fly, Railway, or a VPS) and configure the frontend to point to that backend (via environment variables or full URL).

Quick steps to deploy frontend on Vercel:

1. Push your repository to GitHub (or GitLab/Bitbucket). Example:

```powershell
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

2. In the Vercel dashboard, create a new project and import the Git repository.

3. During project setup, ensure the following settings (the UI shows these values):
- Framework Preset: Other
- Build Command: npm run build
- Output Directory: dist

4. (Optional) Add environment variables in Vercel for the frontend if you need to point API calls to your backend, e.g. `VITE_API_URL=https://your-backend.example.com`.

5. After deployment, Vercel will serve the static site at `https://<your-project>.vercel.app`.

Backend deployment recommendations

- Deploy the backend (the `backend/` folder) to a provider that supports persistent Node servers and WebSockets. Good options: Render (web service), Fly, Railway, DigitalOcean App Platform, or a VPS.
- Configure the backend to read the PORT environment variable. The backend already listens on process.env.PORT if set.
- After backend deployment, update the frontend environment variable `VITE_API_URL` or hardcode the backend base URL in the frontend where appropriate (not recommended for production).

If you want, I can also:
- Create a tiny GitHub Actions workflow that runs `npm run build` and checks the build locally.
- Add a simple environment variable usage in the frontend to point to the backend.


Repository
- To push this project to GitHub, see the instructions below.

Contact
- If you want help adding CI, creating the GitHub repo from the CLI, or deploying, tell me and I can create the necessary files.
# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/95dd2eca-852d-4904-a622-c1d85a199544

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/95dd2eca-852d-4904-a622-c1d85a199544) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/95dd2eca-852d-4904-a622-c1d85a199544) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
