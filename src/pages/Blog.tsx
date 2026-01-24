import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import PageHeader from "../components/PageHeader";
import Footer from "../components/Footer";
import { getApiEndpoint, getApiUrl } from "../utils/api";

interface BlogItem {
  _id: string;
  title: string;
  content: string;
  date?: string;
  authorName?: string;
  authorProfilePicture?: string;
}

const Blog = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [blog, setBlog] = useState<BlogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (id) {
      fetchBlog(id);
    }
  }, [id]);

  const fetchBlog = async (blogId: string) => {
    try {
      setLoading(true);
      const response = await fetch(getApiEndpoint(`/api/blogs/${blogId}`));
      
      if (!response.ok) {
        if (response.status === 404) {
          setError("Blog not found");
        } else {
          throw new Error("Failed to fetch blog");
        }
        return;
      }

      const data = await response.json();
      setBlog(data);
      setError("");
    } catch (err: any) {
      console.error("Error fetching blog:", err);
      setError(err.message || "Failed to fetch blog. Make sure the backend server is running.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
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
          paddingTop: "140px", // Space for PageHeader (40px top + ~60px header height + 40px buffer)
        }}
      >
        <PageHeader />
        <div style={{ fontSize: "1.25rem", color: "#666666", fontFamily: "'Crimson Text', serif" }}>Loading...</div>
      </div>
    );
  }

  if (error || !blog) {
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
          paddingTop: "140px", // Space for PageHeader (40px top + ~60px header height + 40px buffer)
        }}
      >
        <PageHeader />
        <div
          style={{
            maxWidth: "600px",
            width: "100%",
            padding: "2rem",
            background: "#fee2e2",
            border: "1px solid #dc2626",
            borderRadius: "8px",
            color: "#dc2626",
          }}
        >
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>
            Error
          </h2>
          <p>{error || "Blog not found"}</p>
          <button
            onClick={() => navigate("/")}
            style={{
              marginTop: "1rem",
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
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const profilePictureUrl = blog.authorProfilePicture
    ? blog.authorProfilePicture.startsWith("http") || blog.authorProfilePicture.startsWith("/")
      ? blog.authorProfilePicture
      : `${getApiUrl()}${blog.authorProfilePicture}`
    : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f5f5",
        padding: "2rem",
        paddingTop: "140px", // Space for PageHeader (40px top + ~60px header height + 40px buffer)
      }}
    >
      <PageHeader />
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div
          onClick={() => navigate("/blogs")}
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            backgroundColor: "#000000",
            cursor: "pointer",
            marginBottom: "2rem",
            transition: "opacity 0.2s ease, transform 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.7";
            e.currentTarget.style.transform = "scale(1.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
            e.currentTarget.style.transform = "scale(1)";
          }}
        />

        <article>
          <h1
            style={{
              fontSize: "3rem",
              fontWeight: 700,
              marginBottom: "1rem",
              color: "#000000",
              fontFamily: "Montserrat, sans-serif",
            }}
          >
            {blog.title}
          </h1>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "1rem",
              marginBottom: "2rem",
              paddingBottom: "1rem",
              borderBottom: "1px solid #e2e8f0",
            }}
          >
            {profilePictureUrl && (
              <img
                src={profilePictureUrl}
                alt={blog.authorName || "Author"}
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "2px solid #f8f8f8",
                  flexShrink: 0,
                }}
              />
            )}
            <div style={{ flex: 1 }}>
              {blog.authorName && (
                <div style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "0.25rem", fontFamily: "Montserrat, sans-serif" }}>
                  {blog.authorName}
                </div>
              )}
              {blog.date && (
                <div style={{ color: "#666666", fontSize: "0.875rem", fontFamily: "Montserrat, sans-serif" }}>
                  {blog.date}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              fontSize: "1.125rem",
              lineHeight: "1.75",
              color: "#333333",
            }}
          >
            <ReactMarkdown
              components={{
                h1: ({ node, ...props }) => (
                  <h1 style={{ fontSize: "2.5rem", fontWeight: 700, marginTop: "2rem", marginBottom: "1.5rem", color: "#000000", fontFamily: "Montserrat, sans-serif" }} {...props} />
                ),
                h2: ({ node, ...props }) => (
                  <h2 style={{ fontSize: "2rem", fontWeight: 700, marginTop: "1.75rem", marginBottom: "1rem", color: "#000000", fontFamily: "Montserrat, sans-serif" }} {...props} />
                ),
                h3: ({ node, ...props }) => (
                  <h3 style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "1.5rem", marginBottom: "0.75rem", color: "#000000", fontFamily: "Montserrat, sans-serif" }} {...props} />
                ),
                h4: ({ node, ...props }) => (
                  <h4 style={{ fontSize: "1.5rem", fontWeight: 600, marginTop: "1.25rem", marginBottom: "0.5rem", color: "#000000", fontFamily: "Montserrat, sans-serif" }} {...props} />
                ),
                h5: ({ node, ...props }) => (
                  <h5 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "1rem", marginBottom: "0.5rem", color: "#000000", fontFamily: "Montserrat, sans-serif" }} {...props} />
                ),
                h6: ({ node, ...props }) => (
                  <h6 style={{ fontSize: "1.125rem", fontWeight: 600, marginTop: "0.75rem", marginBottom: "0.5rem", color: "#000000", fontFamily: "Montserrat, sans-serif" }} {...props} />
                ),
                p: ({ node, ...props }) => (
                  <p style={{ marginBottom: "1.25rem", lineHeight: "1.8" }} {...props} />
                ),
                strong: ({ node, ...props }) => (
                  <strong style={{ fontWeight: 700, color: "#000000" }} {...props} />
                ),
                em: ({ node, ...props }) => (
                  <em style={{ fontStyle: "italic" }} {...props} />
                ),
                code: ({ node, ...props }) => (
                  <code style={{ backgroundColor: "#f8f8f8", padding: "0.2rem 0.4rem", borderRadius: "4px", fontSize: "0.9em", fontFamily: "monospace" }} {...props} />
                ),
                pre: ({ node, ...props }) => (
                  <pre style={{ backgroundColor: "#f8f8f8", padding: "1rem", borderRadius: "8px", overflow: "auto", marginBottom: "1.5rem" }} {...props} />
                ),
                ul: ({ node, ...props }) => (
                  <ul style={{ marginLeft: "1.5rem", marginBottom: "1.25rem", listStyleType: "disc" }} {...props} />
                ),
                ol: ({ node, ...props }) => (
                  <ol style={{ marginLeft: "1.5rem", marginBottom: "1.25rem", listStyleType: "decimal" }} {...props} />
                ),
                li: ({ node, ...props }) => (
                  <li style={{ marginBottom: "0.5rem" }} {...props} />
                ),
                a: ({ node, ...props }) => (
                  <a style={{ color: "#8B0000", textDecoration: "underline" }} {...props} />
                ),
                blockquote: ({ node, ...props }) => (
                  <blockquote style={{ borderLeft: "4px solid #8B0000", paddingLeft: "1rem", marginLeft: 0, marginBottom: "1.25rem", fontStyle: "italic", color: "#666666" }} {...props} />
                ),
                hr: ({ node, ...props }) => (
                  <hr style={{ border: "none", borderTop: "2px solid #e2e8f0", margin: "2rem 0" }} {...props} />
                ),
              }}
            >
              {blog.content || ""}
            </ReactMarkdown>
          </div>
        </article>
      </div>
      <Footer />
    </div>
  );
};

export default Blog;
