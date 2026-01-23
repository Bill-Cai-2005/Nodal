# Quick Start: Deploy to Vercel + Render

## 🚀 Fast Deployment Checklist

### Backend (Render) - 5 minutes

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Ready for Render deployment"
   git push
   ```

2. **Create Render Web Service**
   - Go to [render.com](https://render.com) → New Web Service
   - Connect GitHub repo
   - Render auto-detects `render.yaml`
   - Click "Create Web Service"

3. **Set Environment Variables in Render**
   ```
   MONGO_URI=mongodb+srv://your-connection-string
   FRONTEND_URL=https://your-project.vercel.app (set after frontend deploy)
   ADMIN_PASSCODE=your-secret (optional)
   ```

4. **Copy Backend URL**
   - Render gives you: `https://nodal-backend.onrender.com`
   - Save this for the next step!

---

### Frontend (Vercel) - 3 minutes

1. **Create Vercel Project**
   - Go to [vercel.com](https://vercel.com) → Add New Project
   - Connect GitHub repo
   - Vercel auto-detects Vite

2. **Set Environment Variable in Vercel**
   ```
   VITE_API_URL=https://nodal-backend.onrender.com
   ```
   ⚠️ Use your actual Render backend URL from step above!

3. **Deploy**
   - Click "Deploy"
   - Copy your Vercel URL: `https://your-project.vercel.app`

4. **Update Render CORS**
   - Go back to Render → Environment Variables
   - Update `FRONTEND_URL` to your Vercel URL

---

### ✅ Test

- Frontend: `https://your-project.vercel.app`
- Backend health: `https://nodal-backend.onrender.com/health`
- API: `https://nodal-backend.onrender.com/api/blogs`

---

## 🔧 Troubleshooting

**CORS Error?**
- Check `FRONTEND_URL` in Render matches your exact Vercel URL

**404 on API?**
- Check `VITE_API_URL` in Vercel matches your Render backend URL

**Backend sleeping?**
- Free tier spins down after 15 min
- Use [UptimeRobot](https://uptimerobot.com) to ping `/health` every 5 min

---

See `DEPLOYMENT.md` for detailed instructions.
