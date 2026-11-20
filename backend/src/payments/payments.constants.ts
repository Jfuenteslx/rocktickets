// Vigencia del checkout (QR de pago) de PagosYa. Es más corta que la reserva de la orden
// (15 min): si el QR vence y la reserva sigue viva, se genera uno nuevo con la misma orden.
export const CHECKOUT_MINUTES = 5;
