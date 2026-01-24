import "./App.css";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import ToyGraph from "./components/ToyGraph";
import MobileHome from "./pages/MobileHome";
import BlogManagement from "./pages/BlogManagement";
import Blog from "./pages/Blog";
import Blogs from "./pages/Blogs";
import About from "./pages/About";
import Legal from "./pages/Legal";
import Newsletter from "./pages/Newsletter";
import NotFound from "./pages/NotFound";

function App() {
  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            <div className="app">
              <ToyGraph />
              <div className="mobile-home">
                <MobileHome />
              </div>
            </div>
          }
        />
        <Route path="/about" element={<About />} />
        <Route path="/legal" element={<Legal />} />
        <Route path="/newsletter" element={<Newsletter />} />
        <Route path="/blogs" element={<Blogs />} />
        <Route path="/blogManagement" element={<BlogManagement />} />
        <Route path="/BlogManagement" element={<BlogManagement />} />
        <Route path="/blog/:id" element={<Blog />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;
