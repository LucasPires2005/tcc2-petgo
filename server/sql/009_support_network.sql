BEGIN;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS demonstration boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS seed_key text;

CREATE UNIQUE INDEX IF NOT EXISTS partners_seed_key_uidx ON public.partners (seed_key);

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.partners'::regclass AND conname = 'partners_support_category_check') THEN
    ALTER TABLE public.partners ADD CONSTRAINT partners_support_category_check
      CHECK (category IS NULL OR category IN ('store', 'clinic', 'ngo'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.partners'::regclass AND conname = 'partners_support_coordinates_check') THEN
    ALTER TABLE public.partners ADD CONSTRAINT partners_support_coordinates_check
      CHECK ((latitude IS NULL AND longitude IS NULL)
        OR (latitude IS NOT NULL AND longitude IS NOT NULL
          AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180));
  END IF;
END;
$constraints$;


ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.partners FROM PUBLIC, anon, authenticated;

INSERT INTO public.partners
  (seed_key, name, description, icon, category, address, latitude, longitude, demonstration, active)
SELECT seed_key, name, description, icon, category, address, latitude, longitude, true, true
FROM jsonb_to_recordset($partners_seed$
[
  {
    "seed_key": "petgo-demo-senac-store-1",
    "name": "Pata & Companhia",
    "description": "Loja fictícia de ração e acessórios para cães e gatos. Demonstração acadêmica, sem parceria real.",
    "icon": "storefront-outline",
    "category": "store",
    "address": "Região da Av. Eng. Eusébio Stevaux — Santo Amaro, São Paulo/SP (ilustrativo)",
    "latitude": -23.6693,
    "longitude": -46.7020
  },
  {
    "seed_key": "petgo-demo-senac-clinic-1",
    "name": "Clínica Vet Acolher",
    "description": "Clínica fictícia para atendimento e orientação veterinária. Demonstração acadêmica, sem parceria real.",
    "icon": "medkit-outline",
    "category": "clinic",
    "address": "Entorno do campus Senac — Santo Amaro, São Paulo/SP (ilustrativo)",
    "latitude": -23.6724,
    "longitude": -46.7019
  },
  {
    "seed_key": "petgo-demo-senac-ngo-1",
    "name": "Instituto Lar Animal",
    "description": "ONG fictícia de acolhimento e apoio ao resgate responsável. Demonstração acadêmica, sem parceria real.",
    "icon": "heart-outline",
    "category": "ngo",
    "address": "Região da Av. das Nações Unidas — Santo Amaro, São Paulo/SP (ilustrativo)",
    "latitude": -23.6676,
    "longitude": -46.6978
  },
  {
    "seed_key": "petgo-demo-senac-store-2",
    "name": "Casa de Ração Bom Companheiro",
    "description": "Comércio local fictício de alimentos para animais. Demonstração acadêmica, sem parceria real.",
    "icon": "storefront-outline",
    "category": "store",
    "address": "Zona sul — Santo Amaro, São Paulo/SP (ilustrativo)",
    "latitude": -23.6754,
    "longitude": -46.7048
  },
  {
    "seed_key": "petgo-demo-senac-clinic-2",
    "name": "Centro Veterinário Pata Serena",
    "description": "Centro veterinário fictício de apoio aos cuidadores. Demonstração acadêmica, sem parceria real.",
    "icon": "medkit-outline",
    "category": "clinic",
    "address": "Entorno da Av. das Nações Unidas — Santo Amaro, São Paulo/SP (ilustrativo)",
    "latitude": -23.6639,
    "longitude": -46.7051
  },
  {
    "seed_key": "petgo-demo-senac-ngo-2",
    "name": "Associação Amigo de Patas",
    "description": "Associação fictícia de voluntários em apoio à causa animal. Demonstração acadêmica, sem parceria real.",
    "icon": "heart-outline",
    "category": "ngo",
    "address": "Zona sul — Santo Amaro, São Paulo/SP (ilustrativo)",
    "latitude": -23.6792,
    "longitude": -46.6985
  },
  {
    "seed_key": "petgo-demo-senac-store-3",
    "name": "Empório Pet Acolher",
    "description": "Loja fictícia de produtos de cuidado para cães e gatos. Demonstração acadêmica, sem parceria real.",
    "icon": "storefront-outline",
    "category": "store",
    "address": "Região de Santo Amaro — São Paulo/SP (ilustrativo)",
    "latitude": -23.6662,
    "longitude": -46.7134
  }
]
$partners_seed$::jsonb) AS seed(
  seed_key text, name text, description text, icon text, category text,
  address text, latitude double precision, longitude double precision
)
ON CONFLICT (seed_key) DO NOTHING;

COMMIT;


