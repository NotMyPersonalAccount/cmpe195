import { Navigate, Route, Routes } from "react-router-dom";

import { Dashboard } from "./pages/Dashboard";
import { Landing } from "./pages/Landing";
import { SliderView } from "./pages/SliderView";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/r/:roomId" element={<SliderView />} />
      <Route path="/dash/:roomId" element={<Dashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
