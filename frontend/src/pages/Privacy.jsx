import { Link } from "react-router-dom";
import LegalPage from "../components/LegalPage";

const SECTIONS = [
  {
    title: "Quién es responsable de tus datos",
    paragraphs: [
      "Rocktickets es responsable del tratamiento de los datos personales que nos entregas al comprar entradas o al contactarnos. Puedes comunicarte con nosotros por los canales de contacto indicados al final de esta página.",
    ],
  },
  {
    title: "Qué datos recopilamos",
    items: [
      "Datos de la compra: nombre, correo electrónico y teléfono que ingresas al comprar, y el detalle de las entradas (evento, sectores, cantidades y montos).",
      "Datos del pago: no guardamos datos de tu cuenta bancaria ni de tus tarjetas. El pago se procesa a través de PagosYa y tu banco; nosotros recibimos únicamente la confirmación, el monto y los identificadores de la transacción.",
      "Datos técnicos: tu dirección IP y datos básicos de la conexión, que usamos para limitar abusos y proteger la plataforma.",
      "Datos de acceso al evento: el registro de cuándo se leyó el código QR de cada entrada en la puerta.",
      "Datos de contacto: lo que nos escribes cuando pides ayuda o recuperas tus entradas.",
      "Si inicias sesión con Google: tu nombre, correo electrónico, foto de perfil e identificador de cuenta de Google. No recibimos tu contraseña de Google. Iniciar sesión es opcional.",
    ],
  },
  {
    title: "Para qué los usamos",
    items: [
      "Procesar tu compra, confirmar el pago y entregarte las entradas.",
      "Mantener tu sesión, completar tus datos al comprar y mostrarte tu historial en “Mis compras”, si inicias sesión con Google.",
      "Enviarte por correo la confirmación, el PDF de tus entradas y los enlaces de tus compras cuando los pides.",
      "Controlar el ingreso al evento y evitar que una misma entrada se use más de una vez.",
      "Atender consultas, cancelaciones y reembolsos, y avisarte si un evento cambia o se cancela.",
      "Prevenir fraudes, resolver reclamos y cumplir obligaciones legales.",
      "Elaborar reportes de ventas para el organizador del evento.",
    ],
  },
  {
    title: "Con quién los compartimos",
    items: [
      "Organizador del evento y personal autorizado del local: pueden ver los datos de las compras de su evento (nombre, contacto y entradas) para gestionar ventas, asistencia y el ingreso en puerta.",
      "Proveedores que hacen posible el servicio: PagosYa y tu banco (pagos), Google (inicio de sesión), el servicio de envío de correos y el servicio de alojamiento de la plataforma. Solo reciben lo necesario para cumplir su función.",
      "Autoridades, cuando una ley o una orden válida lo exija.",
    ],
    paragraphs: ["No vendemos tus datos personales ni los usamos para publicidad de terceros."],
  },
  {
    title: "Cuánto tiempo los conservamos",
    paragraphs: [
      "Conservamos los datos de tus compras el tiempo necesario para darte acceso a tus entradas, atender reclamos y reembolsos y cumplir obligaciones legales y contables. Después los eliminamos o los dejamos sin posibilidad de identificarte.",
    ],
  },
  {
    title: "Cómo los protegemos",
    paragraphs: [
      "El acceso a tu compra se hace con un enlace único y privado: no lo compartas. Limitamos quién puede ver los datos, validamos que los avisos de pago provengan del proveedor y aplicamos límites de uso contra abusos. Ningún sistema es infalible, pero trabajamos para mantener tus datos seguros.",
    ],
  },
  {
    title: "Cookies y servicios de terceros",
    paragraphs: [
      "Rocktickets no usa cookies de publicidad ni de seguimiento. La sección “El lugar” de cada evento muestra un mapa de Google Maps; al verla, Google puede recibir datos de tu navegador y usar sus propias cookies según su política de privacidad.",
    ],
  },
  {
    title: "Tus derechos",
    paragraphs: [
      "Puedes pedirnos acceder a tus datos, corregirlos o que los eliminemos, y oponerte a ciertos usos, salvo cuando debamos conservarlos por una obligación legal o por una compra vigente. La Constitución de Bolivia reconoce además el derecho a la privacidad y la acción de protección de privacidad.",
      "Para ejercer estos derechos escríbenos indicando el correo y el nombre con los que compraste; podemos pedirte datos adicionales para confirmar que eres tú.",
    ],
  },
  {
    title: "Menores de edad",
    paragraphs: [
      "La plataforma está pensada para personas mayores de edad. Si eres menor, compra con la autorización y supervisión de tu madre, padre o tutor.",
    ],
  },
  {
    title: "Cambios en esta política",
    paragraphs: [
      "Podemos actualizar esta política. La versión vigente es la publicada en esta página, con su fecha de actualización.",
    ],
  },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Política de privacidad"
      intro="Esta política explica qué datos personales recopilamos cuando compras entradas en Rocktickets, para qué los usamos y qué derechos tienes sobre ellos."
      sections={SECTIONS}
      other={
        <Link to="/terminos" className="text-white underline">
          los términos y condiciones
        </Link>
      }
    />
  );
}
