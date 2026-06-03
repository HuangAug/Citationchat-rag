import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import Login from "@/pages/Login";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/chat" element={<div className="mx-auto max-w-3xl p-6 text-center text-xl">Chat - Coming Soon</div>} />
        <Route path="/kb" element={<div className="mx-auto max-w-3xl p-6 text-center text-xl">Knowledge Base - Coming Soon</div>} />
        <Route path="/eval" element={<div className="mx-auto max-w-3xl p-6 text-center text-xl">Eval - Coming Soon</div>} />
      </Routes>
    </Router>
  );
}
