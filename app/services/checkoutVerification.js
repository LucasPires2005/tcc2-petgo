export function checkoutMessage(result) {
  if (result.status !== 'approved') {
    return { title: 'Pagamento não aprovado', message: 'O pagamento não foi concluído. Você pode iniciar uma nova tentativa.' };
  }
  if (result.type === 'store_purchase') {
    const logistics = result.deliveryType === 'ONG'
      ? `Retirada em:\n${result.deliveryInfo}`
      : result.deliveryType === 'DELIVERY' ? `Entrega no endereço:\n${result.deliveryInfo}`
        : 'Consulte os dados de retirada ou entrega escolhidos na compra.';
    return { title: 'Compra confirmada! 🎉', message: `${result.title}\n\n${logistics}\n\nPagamento: ${result.paymentId}` };
  }
  if (result.type === 'donation') {
    return { title: 'Obrigado pelo apoio! ❤️', message: `Seu pagamento foi confirmado.\n${result.title}` };
  }
  return { title: 'Plano ativado! 🎉', message: `O pagamento de ${result.title} foi confirmado.` };
}

// Uma instância por checkout: impede alertas duplicados de timer, URL e AppState.
export function createCheckoutVerifier({ load, acknowledge, notify, canNotify = () => true }) {
  let active = true;
  let busy = false;
  let completed = false;
  return {
    dispose() { active = false; },
    async check() {
      if (!active || busy || completed) return null;
      busy = true;
      try {
        const result = await load();
        if (!active || !canNotify()) return null;
        if (['approved', 'rejected', 'cancelled', 'refunded', 'charged_back'].includes(result.status)) {
          await acknowledge(result);
          if (!active) return null;
          completed = true;
          notify(checkoutMessage(result), result);
        }
        return result;
      } finally { busy = false; }
    }
  };
}
