import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import EventList from "./pages/EventList";
import EventDetail from "./pages/EventDetail";
import OrderStatus from "./pages/OrderStatus";
import CourtesyTickets from "./pages/CourtesyTickets";

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<EventList />} />
        <Route path="/eventos/:id" element={<EventDetail />} />
        <Route path="/orden/:token" element={<OrderStatus />} />
        <Route path="/cortesia/:token" element={<CourtesyTickets />} />
      </Routes>
    </BrowserRouter>
  );
}
