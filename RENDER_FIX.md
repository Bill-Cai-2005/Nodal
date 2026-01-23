# Fix Render Build Error

## Problem
Render is trying to build from the root directory instead of the `server/` directory, causing TypeScript errors.

## Solution

### Option 1: Use render.yaml (Recommended)
The `render.yaml` file has been updated with `rootDir: server`. If Render auto-detects it, this should work.

### Option 2: Manual Configuration in Render Dashboard

If Render doesn't auto-detect `render.yaml` or you're still getting errors:

1. **Go to your Render service** → **Settings**
2. **Find "Root Directory"** section
3. **Set Root Directory to**: `server`
4. **Update Build Command to**: `npm install && npm run build`
5. **Update Start Command to**: `npm start`
6. **Save changes** and redeploy

### Option 3: Delete and Recreate Service

If the above doesn't work:

1. **Delete the current service** in Render
2. **Create a new Web Service**
3. **Connect your GitHub repo**
4. **Manually configure**:
   - Root Directory: `server`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Environment: `Node`

## Why This Happens

Render defaults to building from the repository root. Since your backend is in the `server/` subdirectory, you need to tell Render where to find it.

## Verify It's Working

After fixing, the build should:
1. ✅ Install dependencies from `server/package.json`
2. ✅ Run `npm run build` (which runs `tsc` to compile TypeScript)
3. ✅ Start with `npm start` (which runs `node dist/index.js`)
