import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import Catalog from "./pages/Catalog";
import EventDetail from "./pages/EventDetail";
import OrderStatus from "./pages/OrderStatus";
import CourtesyTickets from "./pages/CourtesyTickets";
import Help from "./pages/Help";
import RecoverTickets from "./pages/RecoverTickets";
import Terms from "./pages/Terms";
import Login from "./pages/Login";
import MyOrders from "./pages/MyOrders";
import { BuyerProvider } from "./lib/buyerAuth";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";

// Al cambiar de página, vuelve arriba (el router no lo hace solo).
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BuyerProvider>
    <BrowserRouter>
      <ScrollToTop />
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/eventos" element={<Catalog />} />
            <Route path="/eventos/:id" element={<EventDetail />} />
            <Route path="/orden/:token" element={<OrderStatus />} />
            <Route path="/cortesia/:token" element={<CourtesyTickets />} />
            <Route path="/ingresar" element={<Login />} />
            <Route path="/mis-compras" element={<MyOrders />} />
            <Route path="/recuperar" element={<RecoverTickets />} />
            <Route path="/terminos" element={<Terms />} />
            <Route path="/privacidad" element={<Privacy />} />
            <Route path="/ayuda" element={<Help />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
    </BuyerProvider>
  );
}
