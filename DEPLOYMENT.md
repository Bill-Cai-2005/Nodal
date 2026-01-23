# Deployment Guide: Vercel (Frontend) + Render (Backend)

This guide walks you through deploying your Nodal Research project with the frontend on Vercel and backend on Render.

## Architecture Overview

- **Frontend**: React + Vite → Deployed on Vercel
- **Backend**: Express + MongoDB → Deployed on Render
- **Database**: MongoDB Atlas (cloud-hosted)

---

## Part 1: Deploy Backend to Render

### Step 1: Prepare Your Backend

Your backend is already configured in the `server/` directory. The `render.yaml` file is set up for Render deployment.

### Step 2: Push to GitHub

Make sure your code is pushed to a GitHub repository:

```bash
git add .
git commit -m "Configure for Render deployment"
git push origin main
```

### Step 3: Create Render Web Service

1. Go to [render.com](https://render.com) and sign up/login
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Render will auto-detect the `render.yaml` file
5. Configure the service:
   - **Name**: `nodal-backend` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `cd server && npm install && npm run build`
   - **Start Command**: `cd server && npm start`
   - **Plan**: Free (or paid if you need better performance)

### Step 4: Set Environment Variables in Render

In Render Dashboard → Your Service → Environment:

Add these variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `MONGO_URI` | `mongodb+srv://...` | Your MongoDB Atlas connection string |
| `FRONTEND_URL` | `https://your-project.vercel.app` | Your Vercel frontend URL (set after deploying frontend) |
| `ADMIN_PASSCODE` | (optional) | Passcode for blog management |
| `NODE_ENV` | `production` | Already set in render.yaml |
| `PORT` | `10000` | Already set in render.yaml |

⚠️ **Important**: 
- Do NOT prefix these with `VITE_` (that's only for frontend env vars)
- Set `FRONTEND_URL` after you deploy the frontend (or use a placeholder and update later)

### Step 5: Deploy Backend

Click **"Create Web Service"**. Render will:
1. Install dependencies
2. Build your TypeScript code
3. Start your Express server
4. Give you a URL like: `https://nodal-backend.onrender.com`

### Step 6: Test Backend

Visit your Render backend URL:
- Health check: `https://your-backend.onrender.com/health`
- API endpoint: `https://your-backend.onrender.com/api/blogs`

---

## Part 2: Deploy Frontend to Vercel

### Step 1: Connect to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up/login
2. Click **"Add New Project"**
3. Import your GitHub repository
4. Vercel will auto-detect Vite

### Step 2: Configure Build Settings

Vercel should auto-detect:
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Step 3: Set Environment Variables in Vercel

In Vercel Dashboard → Your Project → Settings → Environment Variables:

Add this variable:

| Variable | Value | Description |
|----------|-------|-------------|
| `VITE_API_URL` | `https://your-backend.onrender.com` | Your Render backend URL (no trailing slash) |

⚠️ **Important**: 
- Must prefix with `VITE_` for Vite to expose it to the frontend
- Use your actual Render backend URL (from Step 5 above)
- Set for **Production**, **Preview**, and **Development** environments

### Step 4: Update Render CORS

Go back to Render Dashboard → Your Backend Service → Environment Variables:

Update `FRONTEND_URL` to your actual Vercel URL:
- `https://your-project.vercel.app` (or your custom domain)

### Step 5: Deploy Frontend

Click **"Deploy"**. Vercel will:
1. Install dependencies
2. Build your React app
3. Deploy to CDN
4. Give you a URL like: `https://your-project.vercel.app`

---

## Part 3: Verify Everything Works

### Test Checklist

1. ✅ **Frontend loads**: Visit your Vercel URL
2. ✅ **Backend health**: `https://your-backend.onrender.com/health`
3. ✅ **Blogs load**: Check if blogs appear on your site
4. ✅ **CORS works**: No CORS errors in browser console
5. ✅ **Image uploads**: Test blog image uploads (if implemented)

### Common Issues

#### CORS Errors
- **Symptom**: Browser console shows CORS errors
- **Fix**: Ensure `FRONTEND_URL` in Render matches your exact Vercel URL (including `https://`)

#### 404 on API Routes
- **Symptom**: Frontend can't reach backend
- **Fix**: Check `VITE_API_URL` in Vercel matches your Render backend URL exactly

#### Backend Sleeps (Free Tier)
- **Symptom**: First request after inactivity is slow (15+ seconds)
- **Fix**: This is normal for Render free tier. Consider:
  - Upgrading to paid plan
  - Setting up a health check ping service (UptimeRobot, etc.)
  - Using Render's "Always On" feature (if available)

---

## Part 4: Keep Backend Awake (Optional)

Render's free tier spins down after 15 minutes of inactivity. To keep it awake:

### Option 1: External Health Check Service

Use a free service like [UptimeRobot](https://uptimerobot.com):
1. Create account
2. Add monitor: `https://your-backend.onrender.com/health`
3. Set interval: 5 minutes
4. This will ping your backend and keep it awake

### Option 2: Render Cron Job (Paid Feature)

If you upgrade Render, you can set up a cron job to ping your own health endpoint.

---

## Environment Variables Summary

### Render (Backend)
```
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname
FRONTEND_URL=https://your-project.vercel.app
ADMIN_PASSCODE=your-secret-passcode (optional)
NODE_ENV=production
PORT=10000
```

### Vercel (Frontend)
```
VITE_API_URL=https://your-backend.onrender.com
```

---

## File Structure

```
nodal/
├── server/              # Backend (deployed to Render)
│   ├── src/
│   │   ├── index.ts     # Express server entry point
│   │   └── routes/      # API routes
│   └── package.json
├── src/                 # Frontend (deployed to Vercel)
│   ├── components/
│   ├── pages/
│   └── utils/
│       └── api.ts       # API URL configuration
├── render.yaml          # Render deployment config
└── package.json         # Frontend dependencies
```

---

## Next Steps

- ✅ Both services deployed
- ✅ Environment variables configured
- ✅ CORS properly set up
- 🎉 Your blog is live!

For production improvements:
- Set up a custom domain
- Configure SSL certificates (automatic on both platforms)
- Set up monitoring and error tracking
- Consider upgrading Render plan for better performance
