import express, { Request, Response } from "express";
import formidable from "formidable";
import fs from "fs";

const router = express.Router();

// POST /api/upload-image - Handle image uploads and return base64
router.post("/", (req: Request, res: Response) => {
  // Set content type to JSON to prevent HTML responses
  res.setHeader("Content-Type", "application/json");

  console.log("Upload request received");

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

  form.parse(req, (err: any, fields: any, files: any) => {
    if (err) {
      console.error("Error parsing form:", err);
      if (!res.headersSent) {
        return res.status(400).json({ error: "Failed to parse form data", details: err.message });
      }
      return;
    }

    const file = Array.isArray(files.image) 
      ? files.image[0] 
      : files.image || (Array.isArray(files.file) ? files.file[0] : files.file);
    
    if (!file) {
      console.error("No file found in request");
      if (!res.headersSent) {
        return res.status(400).json({ error: "No image file provided" });
      }
      return;
    }

    if (!file.mimetype?.startsWith("image/")) {
      if (!res.headersSent) {
        return res.status(400).json({ error: "Only image files are allowed" });
      }
      return;
    }

    try {
      // Read file and convert to base64
      const imageBuffer = fs.readFileSync(file.filepath);
      const base64Image = imageBuffer.toString("base64");
      const dataUri = `data:${file.mimetype};base64,${base64Image}`;

      // Clean up temp file
      try {
        fs.unlinkSync(file.filepath);
      } catch (unlinkErr) {
        // Ignore cleanup errors
      }

      console.log(`Image converted to base64 successfully`);
      if (!res.headersSent) {
        return res.json({ url: dataUri });
      }
    } catch (readError: any) {
      console.error("Error reading file:", readError);
      if (!res.headersSent) {
        return res.status(500).json({ error: "Failed to process image", details: readError.message });
      }
    }
  });
});

export default router;
