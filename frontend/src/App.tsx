import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Planning from './pages/Planning';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Planning />} />
        <Route path="*" element={<Planning />} />
      </Routes>
    </BrowserRouter>
  );
}
