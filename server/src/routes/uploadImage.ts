import express, { Request, Response } from "express";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import { v2 as cloudinary } from "cloudinary";

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// POST /api/upload-image - Handle image uploads
router.post("/", async (req: Request, res: Response) => {
  try {
    console.log("Upload request received");

    // Check if Cloudinary is configured
    const useCloudinary = !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    );

    if (!useCloudinary) {
      console.warn("Cloudinary not configured, falling back to filesystem storage");
      // Fallback to filesystem for local development
      const { fileURLToPath } = await import("url");
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
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

          const file = Array.isArray(files.image) 
            ? files.image[0] 
            : files.image || (Array.isArray(files.file) ? files.file[0] : files.file);
          
          if (!file) {
            if (!res.headersSent) {
              res.status(400).json({ error: "No image file provided" });
            }
            resolve();
            return;
          }

          if (!file.mimetype?.startsWith("image/")) {
            if (!res.headersSent) {
              res.status(400).json({ error: "Only image files are allowed" });
            }
            resolve();
            return;
          }

          const timestamp = Date.now();
          const random = Math.random().toString(36).substring(2, 15);
          const ext = path.extname(file.originalFilename || file.newFilename || ".jpg");
          const filename = `${timestamp}-${random}${ext}`;
          const filepath = path.join(uploadDir, filename);

          try {
            fs.copyFileSync(file.filepath, filepath);
            try {
              fs.unlinkSync(file.filepath);
            } catch (unlinkErr) {
              // Ignore cleanup errors
            }

            const publicUrl = `/blog-images/${filename}`;
            console.log(`File uploaded successfully (filesystem): ${publicUrl}`);
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
    }

    // Use Cloudinary for production
    const form = formidable({
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
      form.parse(req, async (err: any, fields: any, files: any) => {
        if (err) {
          console.error("Error parsing form:", err);
          if (!res.headersSent) {
            res.status(400).json({ error: "Failed to parse form data", details: err.message });
          }
          resolve();
          return;
        }

        console.log("Form parsed successfully. Files received:", Object.keys(files));

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

        if (!file.mimetype?.startsWith("image/")) {
          if (!res.headersSent) {
            res.status(400).json({ error: "Only image files are allowed" });
          }
          resolve();
          return;
        }

        try {
          // Upload to Cloudinary
          const result = await cloudinary.uploader.upload(file.filepath, {
            folder: "blog-images",
            resource_type: "image",
            transformation: [
              { quality: "auto" },
              { fetch_format: "auto" }
            ]
          });

          // Clean up temp file
          try {
            fs.unlinkSync(file.filepath);
          } catch (unlinkErr) {
            // Ignore cleanup errors
          }

          console.log(`File uploaded successfully to Cloudinary: ${result.secure_url}`);
          if (!res.headersSent) {
            res.json({ url: result.secure_url });
          }
          resolve();
        } catch (uploadError: any) {
          console.error("Error uploading to Cloudinary:", uploadError);
          if (!res.headersSent) {
            res.status(500).json({ 
              error: "Failed to upload image", 
              details: uploadError.message 
            });
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
