import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Events from "./pages/Events.jsx";
import EventForm from "./pages/EventForm.jsx";
import EventShell from "./pages/EventShell.jsx";
import EventTiers from "./pages/EventTiers.jsx";
import EventCourtesies from "./pages/EventCourtesies.jsx";
import EventDetails from "./pages/EventDetails.jsx";
import EventDoor from "./pages/EventDoor.jsx";
import EventSales from "./pages/EventSales.jsx";
import Sales from "./pages/Sales.jsx";
import Organizers from "./pages/Organizers.jsx";
import OrganizerDetail from "./pages/OrganizerDetail.jsx";
import Staff from "./pages/Staff.jsx";
import Venues from "./pages/Venues.jsx";

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="p-10 text-muted">Cargando…</p>;
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  return children;
}

// Pantallas solo del superadmin (el backend también lo exige: esto solo evita mostrar pantallas vacías)
function SuperOnly({ children }) {
  const { user } = useAuth();
  return user.role === "SUPERADMIN" ? children : <Navigate to="/eventos" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/entrar" element={<Login />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route path="/eventos" element={<Events />} />
            <Route path="/eventos/nuevo" element={<EventForm />} />
            <Route path="/eventos/:id/editar" element={<EventForm />} />
            <Route path="/eventos/:id" element={<EventShell />}>
              <Route index element={<EventTiers />} />
              <Route path="cortesias" element={<EventCourtesies />} />
              <Route path="ventas" element={<EventSales />} />
              <Route path="puerta" element={<EventDoor />} />
              <Route path="detalles" element={<EventDetails />} />
            </Route>
            <Route path="/organizadores" element={<SuperOnly><Organizers /></SuperOnly>} />
            <Route path="/organizadores/:id" element={<SuperOnly><OrganizerDetail /></SuperOnly>} />
            <Route path="/ventas" element={<Sales />} />
            <Route path="/personal" element={<Staff />} />
            <Route path="/locales" element={<SuperOnly><Venues /></SuperOnly>} />
          </Route>
          <Route path="*" element={<Navigate to="/eventos" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
