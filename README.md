# Nodal Blog System

A full-stack blog management system with MongoDB backend and React frontend.

## Architecture

- **Frontend**: Vite + React + TypeScript
- **Backend**: Express.js + MongoDB (Mongoose)
- **Database**: MongoDB

## Setup

### Prerequisites

- Node.js (v18 or higher)
- MongoDB database (local or cloud like MongoDB Atlas)

### Backend Setup

1. Navigate to the server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the `server` directory:
```env
MONGO_URI=your_mongodb_connection_string_here
# ADMIN_PASSCODE is optional - leave it out if you don't want passcode protection
# ADMIN_PASSCODE=your_admin_passcode_here
PORT=3001
```

**Important**: `MONGO_URI` must be in `server/.env`, not in the frontend `.env.local` file!

4. Create the public directory for images:
```bash
mkdir -p public/blog-images
```

5. Start the backend server:
```bash
npm run dev
```

The backend will run on `http://localhost:3001`

### Frontend Setup

1. Navigate to the project root:
```bash
cd ..
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file in the project root (optional):
```env
VITE_API_URL=http://localhost:3001
VITE_BlogPassword=your_admin_passcode_here
```

4. Start the frontend development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:5173` (or another port if 5173 is taken)

## Features

### Blog Management
- Create, edit, and delete blog posts
- Two content types: "post" (Markdown) and "file" (links)
- Categories: "blog", "legacy", "core"
- Author information with profile pictures
- Passcode-protected admin actions

### API Endpoints

- `GET /api/blogs` - Get all blogs (sorted by newest first)
- `POST /api/blogs` - Bulk update blogs (requires passcode)
- `GET /api/blogs/:id` - Get a single blog by ID
- `POST /api/upload-image` - Upload author profile pictures

### Blog Display
- View individual blog posts with Markdown rendering
- Automatic redirect for file-type blogs
- Author profile pictures and metadata

## Database Schema

```typescript
{
  title: string (required)
  type: "post" | "file" (required)
  content?: string (required if type === "post")
  link?: string (required if type === "file")
  category: "blog" | "legacy" | "core" (default: "blog")
  date?: string
  authorName?: string
  authorProfilePicture?: string
  createdAt: Date (auto)
  updatedAt: Date (auto)
}
```

## Usage

1. Start both servers (backend and frontend)
2. Navigate to `/blogManagement` in your browser
3. Enter the admin passcode to unlock the management interface
4. Create, edit, or delete blog entries
5. View blogs at `/blog/:id` where `:id` is the MongoDB `_id`

## Notes

- The backend seeds initial data if the database is empty
- Image uploads are stored in `public/blog-images/`
- Admin passcode is **optional** - if `ADMIN_PASSCODE` is not set in `server/.env`, no passcode is required
- The frontend uses environment variables for API URL configuration
- **MONGO_URI must be in `server/.env`** (backend), not in frontend `.env.local`