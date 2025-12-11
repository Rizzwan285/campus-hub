# Deployment Guide

This project is a React Single Page Application (SPA) built with Vite. It can be easily deployed to platforms like Vercel or Netlify.

## Deploying to Vercel

1.  **Create a Vercel Account**: Go to [vercel.com](https://vercel.com) and sign up/login.
2.  **Import Project**:
    *   Click "Add New..." -> "Project".
    *   Import your Git repository (GitHub/GitLab/Bitbucket).
3.  **Configure Project**:
    *   Framework Preset: `Vite` (should be detected automatically).
    *   Root Directory: `./` (leave default).
    *   Build Command: `npm run build` (default).
    *   Output Directory: `dist` (default).
4.  **Deploy**: Click "Deploy".
5.  **Custom Domain**:
    *   Once deployed, go to Settings -> Domains to add your custom domain (e.g., `campus-hub.iitpkd.ac.in` or similar).

## Deploying to Netlify

1.  **Create a Netlify Account**: Go to [netlify.com](https://netlify.com).
2.  **New Site**: Click "Add new site" -> "Import an existing project".
3.  **Connect Git Provider**: Choose GitHub (or your provider).
4.  **Build Settings**:
    *   Base directory: (empty)
    *   Build command: `npm run build`
    *   Publish directory: `dist`
5.  **Deploy**: Click "Deploy site".
6.  **Redirects**: Netlify usually handles SPAs well, but if you face 404s on refresh, create a `_redirects` file in the `public` folder with:
    ```
    /* /index.html 200
    ```

## Custom URL

Using Vercel or Netlify allows you to:
1.  Get a free subdomain (e.g., `iitpkd-hub.vercel.app`).
2.  Connect any custom domain you own for free.
