import { Link } from "react-router-dom";
import LegalPage from "../components/LegalPage";
import { RESERVATION_MINUTES } from "../lib/site";

const SECTIONS = [
  {
    title: "Quiénes somos",
    paragraphs: [
      "Rocktickets es una plataforma web para la venta de entradas a eventos. Actuamos como intermediario entre los organizadores y locales que realizan los eventos y las personas que compran las entradas.",
      "Cada evento es responsabilidad de su organizador: programa, horarios, artistas y condiciones del lugar. Rocktickets se encarga de la venta, el pago y la entrega de las entradas.",
    ],
  },
  {
    title: "Cómo funciona la compra",
    items: [
      "No necesitas crear una cuenta: compras indicando tu nombre, correo electrónico y teléfono. Debes ingresar datos reales y un correo al que tengas acceso, porque ahí enviamos tus entradas.",
      `Al continuar con el pago reservamos tus entradas durante ${RESERVATION_MINUTES} minutos. Si el pago no se confirma en ese tiempo, la reserva se libera y las entradas vuelven a estar disponibles.`,
      "El pago se realiza escaneando un código QR desde la aplicación de tu banco. El código QR de pago tiene una vigencia corta; si vence y tu reserva sigue activa, puedes generar uno nuevo desde la misma pantalla.",
      "Los precios se muestran en bolivianos (Bs) y son el total que pagas por las entradas elegidas.",
      "Una compra queda confirmada cuando recibimos la confirmación del pago. Desde ese momento puedes ver y descargar tus entradas.",
    ],
  },
  {
    title: "Pagos recibidos fuera de tiempo, por montos distintos o repetidos",
    paragraphs: [
      "Si tu pago llega cuando la reserva ya venció y las entradas ya no están disponibles, si el monto pagado no coincide con el de la compra, o si se paga dos veces la misma compra, revisaremos el caso y te devolveremos el dinero que corresponda, o regularizaremos la compra contigo si aún es posible. Escríbenos con tu número de orden y el comprobante de pago.",
    ],
  },
  {
    title: "Tus entradas",
    items: [
      "Cada entrada tiene un código QR único que se puede usar una sola vez. Una vez que se lee en la puerta, no vuelve a ser válida.",
      "Cuida tu entrada y el enlace de tu compra: quien tenga el código puede ingresar. No las publiques ni las compartas en redes. Rocktickets no se responsabiliza por entradas copiadas, compartidas o adquiridas fuera de la plataforma.",
      "Puedes descargar tus entradas en PDF desde la página de tu compra o desde el correo de confirmación, y recuperar el enlace de tus compras pagadas desde “Recuperar mis tickets”.",
    ],
  },
  {
    title: "Ingreso al evento",
    paragraphs: [
      "El ingreso se rige por las reglas del local y del organizador (por ejemplo, edad mínima, aforo, control de ingreso o artículos permitidos). Tener una entrada no garantiza el ingreso a quien incumpla esas reglas o ponga en riesgo la seguridad del evento.",
    ],
  },
  {
    title: "Cambios, devoluciones y cancelaciones",
    items: [
      "Las entradas no tienen devolución por arrepentimiento, imposibilidad de asistir u otras razones personales.",
      "Si un evento se cancela, te devolveremos el precio de las entradas. Nos pondremos en contacto con los compradores por correo o teléfono para coordinar el reembolso.",
      "Si un evento se reprograma, tus entradas siguen siendo válidas para la nueva fecha.",
    ],
  },
  {
    title: "Responsabilidad",
    paragraphs: [
      "Rocktickets no es responsable por el contenido, la calidad o el desarrollo de los eventos, ni por los cambios de programación que decida el organizador. Tampoco por daños o pérdidas ocurridos en el local, ni por hechos de fuerza mayor o caso fortuito que impidan realizar un evento o prestar el servicio.",
      "Nos esforzamos por mantener la plataforma disponible, pero no garantizamos que funcione sin interrupciones.",
    ],
  },
  {
    title: "Uso adecuado de la plataforma",
    paragraphs: [
      "No está permitido usar la plataforma para fraudes, reservar entradas sin intención de pagarlas, automatizar compras masivas, ni intentar alterar el sistema o las entradas. Podemos cancelar compras y bloquear accesos ante un uso indebido.",
    ],
  },
  {
    title: "Propiedad intelectual",
    paragraphs: [
      "La marca Rocktickets, el diseño y el software de la plataforma son de su titular. Los nombres, imágenes y marcas de los eventos pertenecen a sus organizadores o a sus respectivos dueños.",
    ],
  },
  {
    title: "Datos personales",
    paragraphs: ["El tratamiento de tus datos personales se explica en nuestra Política de privacidad."],
  },
  {
    title: "Cambios en estos términos y ley aplicable",
    paragraphs: [
      "Podemos actualizar estos términos. La versión vigente es la publicada en esta página y se aplica a las compras realizadas desde su fecha de actualización; guardamos la versión que aceptaste en cada compra.",
      "Estos términos se rigen por las leyes de Bolivia. Ante cualquier reclamo, primero intentaremos resolverlo contigo directamente por los canales de contacto indicados.",
    ],
  },
];

export default function Terms() {
  return (
    <LegalPage
      title="Términos y condiciones"
      intro="Al comprar entradas en Rocktickets aceptas estos términos. Léelos antes de pagar: explican cómo funciona la compra, las entradas y las cancelaciones."
      sections={SECTIONS}
      other={
        <Link to="/privacidad" className="text-white underline">
          la política de privacidad
        </Link>
      }
    />
  );
}
