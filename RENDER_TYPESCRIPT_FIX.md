# Fix TypeScript "Cannot find type definition file for 'node'" on Render

## Problem
Render build fails with: `error TS2688: Cannot find type definition file for 'node'`

## Solution

The issue is that TypeScript can't find `@types/node` during the build. Here are the fixes:

### Option 1: Ensure package-lock.json is committed (Recommended)

1. Make sure `server/package-lock.json` is committed to git:
   ```bash
   git add server/package-lock.json
   git commit -m "Add package-lock.json for Render build"
   git push
   ```

2. The `render.yaml` uses `npm ci` which requires `package-lock.json`

### Option 2: Change build command to npm install

If `package-lock.json` is not available, update `render.yaml`:

```yaml
buildCommand: npm install && npm run build
```

### Option 3: Move @types/node to dependencies (Last Resort)

If the above doesn't work, move `@types/node` from `devDependencies` to `dependencies` in `server/package.json`:

```json
{
  "dependencies": {
    "@types/node": "^20.10.5",
    ...
  }
}
```

This ensures types are always installed, even in production builds.

## Current Configuration

- ✅ `server/tsconfig.json` - No explicit `types` array (auto-discovers)
- ✅ `server/package.json` - `@types/node` in devDependencies
- ✅ `render.yaml` - Uses `npm ci` (requires package-lock.json)

## Next Steps

1. **Commit package-lock.json** (if not already committed)
2. **Push to GitHub**
3. **Redeploy on Render**

The build should now succeed!
