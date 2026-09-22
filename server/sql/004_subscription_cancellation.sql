-- Executar após 003 e ANTES do deploy. Não altera datas, moedas ou benefícios.
BEGIN;
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS subscription_cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS premium_cancelled_at timestamptz;
COMMIT;
