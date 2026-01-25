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
    console.log("Upload request received");
    // Create uploads directory if it doesn't exist
    const uploadDir = path.join(__dirname, "../../../public/blog-images");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log(`Created upload directory: ${uploadDir}`);
    }

    const form = formidable({
      uploadDir: uploadDir,
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      filter: (part: any) => {
        const isImage = part.mimetype?.startsWith("image/") || false;
        if (!isImage) {
          console.log(`Rejected file with mimetype: ${part.mimetype}`);
        }
        return isImage;
      },
      allowEmptyFiles: false,
    });

    return new Promise<void>((resolve) => {
      form.parse(req, (err: any, fields: any, files: any) => {
        if (err) {
          console.error("Error parsing form:", err);
          if (!res.headersSent) {
            res.status(400).json({ error: "Failed to parse form data", details: err.message });
          }
          resolve();
          return;
        }

        console.log("Form parsed successfully. Files received:", Object.keys(files));

        // Try both 'image' and 'file' field names
        const file = Array.isArray(files.image) 
          ? files.image[0] 
          : files.image || (Array.isArray(files.file) ? files.file[0] : files.file);
        
        if (!file) {
          console.error("No file found in request. Available fields:", Object.keys(files));
          if (!res.headersSent) {
            res.status(400).json({ error: "No image file provided" });
          }
          resolve();
          return;
        }

        console.log(`Processing file: ${file.originalFilename || file.newFilename}, mimetype: ${file.mimetype}`);

        // Check mimetype
        if (!file.mimetype?.startsWith("image/")) {
          if (!res.headersSent) {
            res.status(400).json({ error: "Only image files are allowed" });
          }
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
          console.log(`File uploaded successfully: ${publicUrl}`);
          if (!res.headersSent) {
            res.json({ url: publicUrl });
          }
          resolve();
        } catch (moveError: any) {
          console.error("Error saving file:", moveError);
          if (!res.headersSent) {
            res.status(500).json({ error: "Failed to save image", details: moveError.message });
          }
          resolve();
        }
      });
    });
  } catch (error: any) {
    console.error("Error uploading image:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Failed to upload image" });
    }
  }
});

export default router;
