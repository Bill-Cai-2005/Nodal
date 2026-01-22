import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { getApiEndpoint, getApiUrl } from "../utils/api";

interface BlogItem {
  _id?: string;
  id?: string;
  title: string;
  content: string;
  date?: string;
  authorName?: string;
  authorProfilePicture?: string;
}

const BlogManagement = () => {
  const navigate = useNavigate();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [blogs, setBlogs] = useState<BlogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({
    title: true,
    date: true,
    authorName: true,
    authorProfilePicture: true,
    content: true,
    actions: true,
  });
  const profilePictureInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    date: "",
    authorName: "",
    authorProfilePicture: "",
  });

  useEffect(() => {
    // Fetch blogs on component mount, regardless of authorization
    fetchBlogs();
  }, []);

  // Also fetch blogs when authorized state changes
  useEffect(() => {
    if (isAuthorized) {
      fetchBlogs();
    }
  }, [isAuthorized]);

  const fetchBlogs = async () => {
    try {
      setLoading(true);
      const url = getApiEndpoint("/api/blogs");
      console.log(`Fetching blogs from: ${url}`);
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      console.log(`Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error response:`, errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`Received ${data.length} blogs from backend`);
      
      // Ensure blogs have both _id and id for compatibility
      const normalizedBlogs = data.map((blog: any) => ({
        ...blog,
        id: blog._id || blog.id,
      }));
      setBlogs(normalizedBlogs);
      setError("");
      console.log(`Successfully loaded ${normalizedBlogs.length} blogs`);
    } catch (err: any) {
      console.error("Error fetching blogs:", err);
      const errorMessage = err.message || "Unknown error";
      setError(`Failed to fetch blogs: ${errorMessage}. Check console for details. Backend should be at ${getApiEndpoint("/api/blogs")}`);
    } finally {
      setLoading(false);
    }
  };


  const handleUnlock = () => {
    // Passcode is optional - allow access without it
      setIsAuthorized(true);
      setError("");
  };

  const handleProfilePictureUpload = useCallback(async (
    file: File,
    index: number
  ): Promise<string> => {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      throw new Error("Invalid file type");
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image size must be less than 10MB");
      throw new Error("File too large");
    }

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch(getApiEndpoint("/api/upload-image"), {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload image");
      }

      const data = await response.json();
      const imageUrl = data.url;

        if (index >= 0) {
          setBlogs((prev) => {
            const updated = [...prev];
            updated[index].authorProfilePicture = imageUrl;
            return updated;
          });
        }

      return imageUrl;
    } catch (err) {
      console.error("Error uploading image:", err);
      setError("Failed to upload image. Make sure the backend server is running.");
      throw err;
    }
  }, []);

  const handleAdd = () => {
    if (!formData.title) {
      setError("Title is required");
      return;
    }

    const newItem: BlogItem = {
      title: formData.title,
      content: formData.content || "",
      date: formData.date || new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      authorName: formData.authorName || "",
      authorProfilePicture: formData.authorProfilePicture || "",
    };

    setBlogs([newItem, ...blogs]);
    setFormData({
      title: "",
      content: "",
      date: "",
      authorName: "",
      authorProfilePicture: "",
    });
    setError("");
  };

  const handleDelete = (index: number) => {
    if (window.confirm("Are you sure you want to delete this entry?")) {
      const updated = blogs.filter((_, i) => i !== index);
      setBlogs(updated);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const response = await fetch(getApiEndpoint("/api/blogs"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          blogs: blogs,
          passcode: passcode || "", // Optional passcode
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save blogs");
      }

      const updatedBlogs = await response.json();
      // Normalize blogs to ensure both _id and id are present
      const normalizedBlogs = updatedBlogs.map((blog: any) => ({
        ...blog,
        id: blog._id || blog.id,
      }));
      setBlogs(normalizedBlogs);
    setError("");
    alert("Blogs saved successfully!");
    } catch (err: any) {
      console.error("Error saving blogs:", err);
      setError(err.message || "Failed to save blogs. Make sure the backend server is running.");
    } finally {
      setLoading(false);
    }
  };

  const updateBlog = (index: number, field: keyof BlogItem, value: any) => {
    const updated = [...blogs];
    updated[index] = { ...updated[index], [field]: value };
    setBlogs(updated);
  };

  const baseColumns = useMemo(() => [
    {
      key: "title",
      title: "Title",
      width: "20%",
      render: (_: any, record: BlogItem, index: number) => (
        <input
          type="text"
          value={record.title}
          onChange={(e) => updateBlog(index, "title", e.target.value)}
          style={{
            width: "100%",
            padding: "0.5rem",
            border: "1px solid #e2e8f0",
            borderRadius: "4px",
            fontSize: "0.875rem",
          }}
        />
      ),
    },
    {
      key: "date",
      title: "Date",
      width: "15%",
      render: (_: any, record: BlogItem, index: number) => (
        <input
          type="text"
          value={record.date || ""}
          onChange={(e) => updateBlog(index, "date", e.target.value)}
          placeholder="e.g., January 15, 2024"
          style={{
            width: "100%",
            padding: "0.5rem",
            border: "1px solid #e2e8f0",
            borderRadius: "4px",
            fontSize: "0.875rem",
          }}
        />
      ),
    },
    {
      key: "authorName",
      title: "Author Name",
      width: "15%",
      render: (_: any, record: BlogItem, index: number) => (
        <input
          type="text"
          value={record.authorName || ""}
          onChange={(e) => updateBlog(index, "authorName", e.target.value)}
          placeholder="Author name"
          style={{
            width: "100%",
            padding: "0.5rem",
            border: "1px solid #e2e8f0",
            borderRadius: "4px",
            fontSize: "0.875rem",
          }}
        />
      ),
    },
    {
      key: "authorProfilePicture",
      title: "Profile Picture",
      width: "15%",
      render: (_: any, record: BlogItem, index: number) => (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <input
            type="file"
            accept="image/*"
            ref={(el) => {
              profilePictureInputRefs.current[index] = el;
            }}
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                try {
                  await handleProfilePictureUpload(file, index);
                } catch (error) {
                  // Error already handled
                }
                if (profilePictureInputRefs.current[index]) {
                  profilePictureInputRefs.current[index]!.value = "";
                }
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              profilePictureInputRefs.current[index]?.click();
            }}
            style={{
              padding: "0.25rem 0.5rem",
              backgroundColor: "#000000",
              color: "#ffffff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            Upload
          </button>
          {record.authorProfilePicture && (
            <div>
              <img
                src={record.authorProfilePicture.startsWith("http") || record.authorProfilePicture.startsWith("/") 
                  ? record.authorProfilePicture 
                  : `${getApiUrl()}${record.authorProfilePicture}`}
                alt="Profile"
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  marginBottom: "0.25rem",
                }}
              />
              <input
                type="text"
                value={record.authorProfilePicture}
                onChange={(e) => updateBlog(index, "authorProfilePicture", e.target.value)}
                placeholder="/blog-images/..."
                style={{
                  width: "100%",
                  padding: "0.25rem",
                  border: "1px solid #e2e8f0",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                }}
              />
            </div>
          )}
        </div>
      ),
    },
    {
      key: "content",
      title: "Content",
      width: "30%",
      render: (_: any, record: BlogItem, index: number) => (
        <textarea
          value={record.content || ""}
          onChange={(e) => updateBlog(index, "content", e.target.value)}
          rows={6}
          style={{
            width: "100%",
            padding: "0.5rem",
            border: "1px solid #e2e8f0",
            borderRadius: "4px",
            fontSize: "0.875rem",
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />
      ),
    },
    {
      key: "actions",
      title: "Actions",
      width: "5%",
      render: (_: any, _record: BlogItem, index: number) => (
        <button
          type="button"
          onClick={() => handleDelete(index)}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "#dc2626",
            color: "#ffffff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          Delete
        </button>
      ),
    },
  ], [blogs, handleProfilePictureUpload]);

  const visibleColumns = useMemo(
    () =>
      baseColumns.filter((column) => columnVisibility[column.key] !== false),
    [baseColumns, columnVisibility]
  );

  const toggleableColumns = useMemo(
    () =>
      baseColumns.map((column) => ({
        key: column.key,
        label: column.title,
      })),
    [baseColumns]
  );

  if (!isAuthorized) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#f5f5f5",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          position: "relative",
        }}
      >
        <PageHeader />
        <div
          style={{
            maxWidth: "400px",
            width: "100%",
            padding: "2rem",
            background: "#f8f8f8",
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
          }}
        >
          <h2
            style={{
              fontSize: "2rem",
              fontWeight: 700,
              marginBottom: "1.5rem",
              textAlign: "center",
              color: "#000000",
              fontFamily: "Montserrat, sans-serif",
            }}
          >
            Blog Management
          </h2>
          <div style={{ marginBottom: "1rem" }}>
            <input
              type="password"
              placeholder="Enter Admin Passcode (optional)"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleUnlock();
                }
              }}
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                fontSize: "1rem",
              }}
              autoFocus
            />
          </div>
          {error && (
            <p style={{ color: "#dc2626", marginBottom: "1rem", fontSize: "0.875rem" }}>
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={handleUnlock}
            style={{
              width: "100%",
              padding: "0.75rem 1.5rem",
              backgroundColor: "#000000",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#333333";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#000000";
            }}
          >
            Unlock
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            style={{
              width: "100%",
              marginTop: "1rem",
              padding: "0.75rem 1.5rem",
              backgroundColor: "transparent",
              color: "#000000",
              border: "1px solid #000000",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#f8f8f8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f5f5",
        padding: "2rem",
        position: "relative",
      }}
    >
      <PageHeader />
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "2rem",
          }}
        >
          <h1
            style={{
              fontSize: "2.5rem",
              fontWeight: 700,
              color: "#000000",
              fontFamily: "Montserrat, sans-serif",
            }}
          >
            Blog Management
          </h1>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={fetchBlogs}
              disabled={loading}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: loading ? "#9ca3af" : "#4a5568",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          <button
            type="button"
            onClick={() => {
              setIsAuthorized(false);
              setPasscode("");
            }}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#000000",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            Logout
          </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: "1rem",
              backgroundColor: "#fee2e2",
              border: "1px solid #dc2626",
              borderRadius: "6px",
              marginBottom: "1rem",
              color: "#dc2626",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            background: "#f8f8f8",
            padding: "2rem",
            borderRadius: "8px",
            marginBottom: "2rem",
          }}
        >
          <h3 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>
            Add New Entry
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
                Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Article title"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  fontSize: "1rem",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
                Date
              </label>
              <input
                type="text"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                placeholder="e.g., January 15, 2024"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  fontSize: "1rem",
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
                Author Name
              </label>
              <input
                type="text"
                value={formData.authorName}
                onChange={(e) => setFormData({ ...formData, authorName: e.target.value })}
                placeholder="Author name"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  fontSize: "1rem",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
                Author Profile Picture
              </label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  value={formData.authorProfilePicture}
                  onChange={(e) => setFormData({ ...formData, authorProfilePicture: e.target.value })}
                  placeholder="/blog-images/filename.jpg"
                  style={{
                    flex: 1,
                    padding: "0.75rem",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    fontSize: "1rem",
                  }}
                />
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  id="profile-upload"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      try {
                        const url = await handleProfilePictureUpload(file, -1);
                        setFormData({ ...formData, authorProfilePicture: url });
                      } catch (error) {
                        // Error already handled
                      }
                    }
                  }}
                />
                <label
                  htmlFor="profile-upload"
                  style={{
                    padding: "0.75rem 1rem",
                    backgroundColor: "#000000",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    display: "inline-block",
                  }}
                >
                  Upload
                </label>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
              Content (Markdown)
            </label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={8}
              placeholder="Write content with Markdown formatting"
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                fontSize: "1rem",
                fontFamily: "inherit",
              }}
            />
          </div>

          <button
            type="button"
            onClick={handleAdd}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#000000",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            Add
          </button>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <div style={{ marginBottom: "0.5rem", fontWeight: 600 }}>Visible columns</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            {toggleableColumns.map((column) => (
              <label
                key={column.key}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={columnVisibility[column.key] !== false}
                  onChange={(e) => {
                    setColumnVisibility((prev) => ({
                      ...prev,
                      [column.key]: e.target.checked,
                    }));
                  }}
                />
                {column.label}
              </label>
            ))}
          </div>
        </div>

        <div style={{ overflowX: "auto", marginBottom: "2rem" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "#f8f8f8" }}>
                {visibleColumns.map((column) => (
                  <th
                    key={column.key}
                    style={{
                      padding: "1rem",
                      textAlign: "left",
                      borderBottom: "2px solid #e2e8f0",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                    }}
                  >
                    {column.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visibleColumns.length} style={{ padding: "2rem", textAlign: "center" }}>
                    Loading...
                  </td>
                </tr>
              ) : blogs.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} style={{ padding: "2rem", textAlign: "center", color: "#666666" }}>
                    No blog entries yet.
                  </td>
                </tr>
              ) : (
                blogs.map((blog, index) => (
                  <tr key={blog._id || blog.id || index} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    {visibleColumns.map((column) => (
                      <td
                        key={column.key}
                        style={{
                          padding: "1rem",
                          verticalAlign: "top",
                        }}
                      >
                        {column.render(null, blog, index)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div>
          <input
            type="password"
            placeholder="Passcode (optional)"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            style={{
              width: "250px",
              padding: "0.75rem",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              fontSize: "1rem",
              marginRight: "1rem",
            }}
          />
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#000000",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            Save Blogs
          </button>
        </div>
      </div>
    </div>
  );
};

export default BlogManagement;
