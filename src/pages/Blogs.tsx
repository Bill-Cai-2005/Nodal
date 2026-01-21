import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { getApiEndpoint, getApiUrl } from "../utils/api";

interface BlogItem {
  _id?: string;
  id?: string | number;
  title: string;
  content: string;
  date?: string;
  authorName?: string;
  authorProfilePicture?: string;
}

const Blogs = () => {
  const navigate = useNavigate();
  const [blogPosts, setBlogPosts] = useState<BlogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBlogs();
  }, []);

  const fetchBlogs = async () => {
    try {
      setLoading(true);
      const response = await fetch(getApiEndpoint("/api/blogs"));
      
      if (!response.ok) {
        throw new Error(`Failed to fetch blogs: ${response.status}`);
      }
      
      const data = await response.json();
      // Normalize blogs to ensure id field exists
      const normalizedBlogs = data.map((blog: any) => ({
        ...blog,
        id: blog._id || blog.id,
      }));
      setBlogPosts(normalizedBlogs);
      console.log(`Loaded ${normalizedBlogs.length} blogs from backend`);
    } catch (error) {
      console.error("Error fetching blogs:", error);
      setBlogPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleBlogClick = (postId: string | number) => {
    navigate(`/blog/${postId}`);
  };

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
        <button
          onClick={() => navigate("/")}
          style={{
            marginBottom: "2rem",
            padding: "0.5rem 1rem",
            backgroundColor: "transparent",
            color: "#000000",
            border: "1px solid #000000",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          ← Back
        </button>

        {loading ? (
          <p
            style={{
              textAlign: "center",
              color: "#666666",
              fontFamily: "'Crimson Text', serif",
              fontSize: "1.25rem",
            }}
          >
            Loading posts...
          </p>
        ) : blogPosts.length === 0 ? (
          <p
            style={{
              textAlign: "center",
              color: "#666666",
              fontFamily: "'Crimson Text', serif",
              fontSize: "1.25rem",
            }}
          >
            No posts yet.
          </p>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2rem",
              }}
            >
            {blogPosts.map((post) => {
              const postId = post.id || post._id || "";
              if (!postId) return null;

              return (
                <div
                  key={postId}
                  onClick={() => handleBlogClick(postId)}
                  style={{
                    background: "#ffffff",
                    padding: "2rem",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
                    transition: "all 0.3s ease",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    maxWidth: "900px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.08)";
                    e.currentTarget.style.borderColor = "#8B0000";
                    e.currentTarget.style.transform = "translateY(-4px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.04)";
                    e.currentTarget.style.borderColor = "#e2e8f0";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "1rem",
                      marginBottom: "1rem",
                    }}
                  >
                    {post.authorProfilePicture && (
                      <img
                        src={
                          post.authorProfilePicture.startsWith("http") || post.authorProfilePicture.startsWith("/")
                            ? post.authorProfilePicture
                            : `${getApiUrl()}${post.authorProfilePicture}`
                        }
                        alt={post.authorName || "Author"}
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
                      <h3
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 700,
                          marginBottom: "0.75rem",
                          color: "#000000",
                          fontFamily: "Montserrat, sans-serif",
                          lineHeight: "1.3",
                        }}
                      >
                        {post.title}
                      </h3>
                      <div
                        style={{
                          display: "flex",
                          gap: "1rem",
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        {post.date && (
                          <p
                            style={{
                              fontSize: "0.875rem",
                              color: "#666666",
                              margin: 0,
                              fontFamily: "Montserrat, sans-serif",
                            }}
                          >
                            {post.date}
                          </p>
                        )}
                        {post.authorName && (
                          <p
                            style={{
                              fontSize: "0.875rem",
                              color: "#666666",
                              margin: 0,
                              fontFamily: "Montserrat, sans-serif",
                            }}
                          >
                            By {post.authorName}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Blogs;
