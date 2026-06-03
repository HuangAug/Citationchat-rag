import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import Chat from "@/pages/Chat";
import KbPage from "@/pages/Kb";
import Login from "@/pages/Login";
import Me from "@/pages/Me";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/me" element={<Me />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/kb" element={<KbPage />} />
        <Route path="/eval" element={<div className="mx-auto max-w-3xl p-6 text-center text-xl">Eval - Coming Soon</div>} />
      </Routes>
    </Router>
  );
}
