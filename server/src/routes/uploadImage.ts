import express, { Request, Response } from "express";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// POST /api/upload-image - Handle image uploads
router.post("/", async (req: Request, res: Response) => {
  try {
    // Create uploads directory if it doesn't exist
    const uploadDir = path.join(__dirname, "../../../public/blog-images");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const form = formidable({
      uploadDir: uploadDir,
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      filter: (part: any) => {
        return part.mimetype?.startsWith("image/") || false;
      },
      allowEmptyFiles: false,
    });

    return new Promise<void>((resolve) => {
      form.parse(req, (err: any, fields: any, files: any) => {
        if (err) {
          console.error("Error parsing form:", err);
          res.status(400).json({ error: "Failed to parse form data" });
          resolve();
          return;
        }

        // Try both 'image' and 'file' field names
        const file = Array.isArray(files.image) 
          ? files.image[0] 
          : files.image || (Array.isArray(files.file) ? files.file[0] : files.file);
        
        if (!file) {
          res.status(400).json({ error: "No image file provided" });
          resolve();
          return;
        }

        // Check mimetype
        if (!file.mimetype?.startsWith("image/")) {
          res.status(400).json({ error: "Only image files are allowed" });
          resolve();
          return;
        }

        // Generate unique filename
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        const ext = path.extname(file.originalFilename || file.newFilename || ".jpg");
        const filename = `${timestamp}-${random}${ext}`;
        const filepath = path.join(uploadDir, filename);

        try {
          // Copy file to final location (formidable saves to temp location first)
          fs.copyFileSync(file.filepath, filepath);
          
          // Clean up temp file
          try {
            fs.unlinkSync(file.filepath);
          } catch (unlinkErr) {
            // Ignore cleanup errors
          }

          // Return public URL
          const publicUrl = `/blog-images/${filename}`;
          res.json({ url: publicUrl });
        } catch (moveError: any) {
          console.error("Error saving file:", moveError);
          res.status(500).json({ error: "Failed to save image" });
        }
        resolve();
      });
    });
  } catch (error: any) {
    console.error("Error uploading image:", error);
    res.status(500).json({ error: error.message || "Failed to upload image" });
  }
});

export default router;
