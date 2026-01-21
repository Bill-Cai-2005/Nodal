import "./App.css";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import ToyGraph from "./components/ToyGraph";
import UltraChaos from "./pages/UltraChaos";
import BlogManagement from "./pages/BlogManagement";
import Blog from "./pages/Blog";
import Blogs from "./pages/Blogs";
import About from "./pages/About";

function App() {
  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            <div className="app">
              <ToyGraph />
            </div>
          }
        />
        <Route path="/ultra-chaos" element={<UltraChaos />} />
        <Route path="/about" element={<About />} />
        <Route path="/blogs" element={<Blogs />} />
        <Route path="/blogManagement" element={<BlogManagement />} />
        <Route path="/blog/:id" element={<Blog />} />
      </Routes>
    </Router>
  );
}

export default App;
