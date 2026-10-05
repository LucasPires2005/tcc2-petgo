# Política de Privacidade

Versão: 2026-10-05-v2 — atualizado em 05/10/2026.

Status: Minuta para demonstração acadêmica.

Controlador: PetGo — projeto acadêmico.

Canal oficial: usepetgo@gmail.com.

## 1. Sobre esta Política

Esta Política explica como o PetGo utiliza dados pessoais no aplicativo, na API e no painel administrativo. O canal oficial para dúvidas, direitos de privacidade, denúncias e exclusão é usepetgo@gmail.com.

O PetGo é apresentado como projeto acadêmico. A referência ao projeto não atribui a responsabilidade pelo tratamento à instituição de ensino, a professores ou aos fornecedores de tecnologia. Os Termos de Uso são um documento distinto, disponível para leitura independente.

## 2. Dados utilizados pelo PetGo

Cadastro e acesso: nome, e-mail, identificadores da conta, confirmação do e-mail, credenciais da modalidade escolhida e informações necessárias à sessão. No login Google, dados autorizados de identidade e perfil são recebidos pelo serviço de autenticação; o PetGo utiliza nome, e-mail e identificador para resolver a conta, sem receber sua senha Google.

Maioridade: CPF, data de nascimento e declaração são recebidos para conferir os requisitos de cadastro e resgate. Permanece um registro protegido dessa conferência, vinculado à conta, conforme a seção seguinte.

Animais e resgates: dados descritivos do animal, situação aparente de saúde, urgência, localização, fotos, autoria, status e informações de responsabilidade do resgatador, incluindo nome, telefone e e-mail.

Operações e atendimento: saldo de PetCoins, modalidade de apoio, datas de vigência, status, identificadores e valores de checkout, entrega ou retirada quando informadas, motivos de ações administrativas e mensagens ao suporte. Os serviços também podem gerar dados técnicos de conexão, como IP e horário.

## 3. CPF e declaração de maioridade

O PetGo confere matematicamente o CPF e calcula a idade com base na data de nascimento declarada. Não consulta um cadastro oficial nem comprova identidade, titularidade do documento ou idade real.

Não são armazenados CPF bruto e data de nascimento nos registros de elegibilidade. Em seu lugar, fica uma representação protegida vinculada à conta, necessária para conferir a declaração em um resgate. Essa informação continua sujeita à proteção de dados pessoais e não é divulgada nos perfis ou registros de animais.

Recusar esses dados impede concluir um novo cadastro ou liberar o resgate. Contas antigas mantêm a navegação já disponível, mas devem completar a declaração antes de resgatar. Não inclua CPF ou nascimento em fotos, descrições, nomes ou mensagens públicas.

## 4. Cadastro, login e atualização

No cadastro por e-mail, os dados são verificados antes de criar a conta e o perfil, seguindo a confirmação do endereço. O perfil é utilizado para identificar suas ações, apresentar benefícios e permitir atualização e recuperação de acesso.

No login Google, a autenticação ocorre com Google e Supabase. Novas contas precisam completar CPF e maioridade antes da liberação normal. Se o preenchimento for cancelado, a identidade de autenticação pode permanecer para retomada ou pedido de exclusão.

No uso autenticado, o PetGo verifica a sessão e as permissões da conta. Alterações de e-mail e senha seguem os procedimentos do sistema. Não compartilhe credenciais ou documentos com terceiros que se apresentem como suporte.

## 5. Dados durante o uso do aplicativo

Mapa: a localização do aparelho é solicitada em primeiro plano para posicionamento e cálculo de distâncias. Não há acompanhamento contínuo em segundo plano implementado. A consulta do catálogo da Rede de Apoio não exige envio de sua posição, mas serviços de mapas podem receber dados de conexão e da região visualizada.

Ocorrências: a foto selecionada é analisada pela moderação e, quando aprovada, armazenada com os dados e as coordenadas do animal para exibição. O histórico de criação é utilizado no controle de spam.

Resgate: os dados de responsabilidade, a declaração e a foto são conferidos para atualizar a ocorrência e conceder a recompensa uma única vez. Nome e telefone também podem integrar o registro compartilhado do animal; o e-mail da declaração permanece no registro interno.

Contribuição e marketplace: são utilizados os dados necessários ao checkout Mercado Pago Sandbox e à confirmação dos benefícios. O CPF de elegibilidade não é enviado para esse checkout. Informações de entrega ou retirada podem fazer parte do contexto da compra demonstrativa.

Exclusão: a conta e o acesso podem ser removidos, preservando ocorrências sem o vínculo direto com o usuário. A exclusão de um animal aciona a limpeza das fotos, observadas as condições de conservação e exclusão desta Política.

## 6. O que outros usuários podem visualizar

Usuários autenticados podem acessar os registros de animais, suas coordenadas, fotografias e informações de resgate disponíveis. Nome e telefone do resgatador podem ser acessíveis mesmo quando determinada tela não os mostra. Não considere esses contatos exclusivamente privados.

As fotos são disponibilizadas por URLs públicas: quem possui o link pode acessar a imagem sem login. Cópias e capturas feitas por terceiros podem permanecer depois da remoção do registro. Evite publicar rostos, documentos, menores, placas ou detalhes pessoais desnecessários.

CPF, representação protegida do CPF e nascimento não são apresentados nas respostas públicas de perfil ou animais. Caso identifique exposição indevida, solicite análise pelo canal oficial.

## 7. Finalidades e fundamentos do tratamento

Os dados necessários à conta, ao acesso e às ações solicitadas são utilizados para execução de contrato de uso do serviço e procedimentos relacionados, conforme o art. 7º, V, da LGPD.

Segurança, integridade e prevenção de abuso podem utilizar legítimo interesse, considerando necessidade, equilíbrio e direitos dos titulares. Obrigações legais e defesa de direitos podem justificar tratamentos específicos quando aplicáveis, sem autorizar divulgação ou conservação ilimitadas.

Quando uma finalidade exigir consentimento, ele deverá ser específico e poderá ser revogado. Ler esta Política ou aceitar os Termos não constitui consentimento genérico para qualquer uso. Não há autorização para vender dados ou utilizar CPF para publicidade.

## 8. Armazenamento e serviços utilizados

Supabase fornece o banco de dados, a autenticação e o armazenamento das fotografias. Render executa a API, e Vercel hospeda o frontend do painel administrativo. O acesso administrativo depende das permissões verificadas pelo servidor.

Google e Supabase participam do login social. Sightengine recebe as imagens para moderação antes da publicação; a análise de rostos é um filtro de conteúdo, não reconhecimento de identidade.

Mercado Pago processa o checkout de testes e os dados necessários ao fluxo. O PetGo não recebe nem armazena número completo de cartão ou código de segurança. Aplicativos de mapas e, no mapa Android aplicável, OpenFreeMap/OpenStreetMap, fornecem mapas e navegação. Como chegar envia o destino ao serviço externo. O serviço api.qrserver.com recebe o código do voucher quando utilizado para gerar sua imagem.

O serviço de e-mail processa as mensagens enviadas ao atendimento. Os fornecedores possuem condições e políticas próprias; informações adicionais sobre compartilhamento podem ser solicitadas ao PetGo.

## 9. Serviços internacionais

A infraestrutura e os fornecedores podem processar dados fora do Brasil, conforme suas configurações e condições. Não se declara armazenamento exclusivamente brasileiro.

O tratamento internacional deve observar a LGPD e os mecanismos aplicáveis definidos pela ANPD. A leitura desta Política não substitui essa avaliação. Informações disponíveis sobre os serviços e o tratamento podem ser solicitadas pelo canal oficial.

## 10. Proteção da conta e dos dados

O PetGo utiliza controle de acesso, autorização administrativa, verificações de sessão e controles de integridade para reduzir o risco de uso indevido. Informações da declaração de maioridade não são disponibilizadas nas respostas públicas.

Esta versão é destinada a demonstrações acadêmicas controladas. As medidas de segurança ainda precisam de revisão antes do uso público com dados e credenciais reais. Utilize senhas exclusivas de teste e não reutilize credenciais de outros serviços.

Nenhum serviço está totalmente livre de incidentes. Se suspeitar de exposição de dados ou acesso indevido, comunique o suporte sem enviar senhas, documentos completos ou dados de cartão.

## 11. Conservação dos dados

Os dados devem ser mantidos pelo tempo necessário às finalidades informadas, observando os direitos dos titulares e eventuais obrigações legais. O registro protegido da declaração acompanha a conta; CPF bruto e nascimento não são conservados nos dados de elegibilidade.

A exclusão da conta remove o perfil e os registros privados vinculados conforme seus relacionamentos, mas preserva ocorrências e fotos pertinentes ao mapa. Auditorias podem conservar identificação do administrador, nome/e-mail do alvo, motivo, dados da ocorrência e data da ação, inclusive após a exclusão.

A conservação posterior exige finalidade e fundamento próprios, sem autorização de guarda indefinida. Cópias de segurança e registros de fornecedores podem seguir ciclos de eliminação distintos. Você pode solicitar informação sobre dados conservados e sua justificativa pelo canal oficial.

## 12. Exclusão, correção e atendimento

Você pode utilizar Excluir Conta no aplicativo ou escrever para usepetgo@gmail.com, preferencialmente pelo e-mail da conta. Identifique o pedido e o registro envolvido, sem enviar senha, CPF completo ou cartão. A confirmação de titularidade, quando necessária, deve usar apenas informações proporcionais ao pedido.

A exclusão efetivada remove perfil e acesso vinculado, preservando a integridade dos animais no mapa com desvinculação da autoria e ajuste dos dados de resgate correspondentes. Informações de outro resgatador não são apagadas por um pedido do criador.

Caso fotos ou textos ainda identifiquem você, solicite avaliação específica. Excluir uma conta não garante eliminação imediata de toda auditoria, fotografia ou cópia. A exclusão autorizada de uma ocorrência aciona a remoção de suas fotos, preservando arquivos ainda compartilhados. Falhas podem exigir regularização pelo suporte.

## 13. Seus direitos

Pelo canal oficial, você pode solicitar confirmação e acesso, correção, informação sobre compartilhamento, bloqueio ou eliminação de dados excessivos ou irregulares, portabilidade conforme regulamentação, revogação de consentimento e eliminação de dados tratados com essa base, observadas as hipóteses legais de conservação.

Também pode exercer oposição nas hipóteses legais, solicitar revisão de decisão exclusivamente automatizada que afete seus interesses e procurar a ANPD. O atendimento deve ser gratuito e observar os prazos legais aplicáveis; eventual impedimento deve ser explicado.

Recusas de imagem e medidas administrativas podem ser contestadas pelo suporte. O exercício de direitos não depende de contribuição paga ou de concordância com uma sanção.

## 14. Proteção de crianças e adolescentes

O PetGo é destinado a pessoas com 18 anos ou mais e não oferece cadastro autorizado a menores. A conferência de dados declarados não garante identificar toda informação falsa.

Situações que envolvam menores devem ser avaliadas com respeito à sua proteção e ao melhor interesse, conforme a legislação aplicável. Não publique fotos ou documentos de menores nem use a plataforma para contatá-los. Pais e responsáveis podem informar tratamento indevido pelo suporte, sem enviar documentos completos na mensagem inicial. A classificação +18 não dispensa avaliar as medidas aplicáveis do ECA Digital.

## 15. Permissões e dados no aparelho

Câmera, galeria e localização são solicitadas para funções específicas. Você pode revisar as permissões nas configurações do aparelho; recusá-las pode limitar o envio de fotos ou os recursos de localização.

O aplicativo pode manter informações temporárias de sessão e arquivos de acompanhamento de operações, necessários à continuidade dos fluxos e à prevenção de repetição. Esses arquivos de operações não contêm CPF, nascimento ou dados completos de cartão. Fotos selecionadas podem permanecer no aparelho conforme a câmera e o sistema.

O painel administrativo utiliza armazenamento do navegador para sua sessão. Proteja o aparelho e encerre o acesso quando necessário. Mapas, checkout e outras páginas externas podem utilizar recursos próprios de armazenamento conforme suas políticas.

## 16. Atualizações e comunicação de incidentes

Suspeitas de acesso indevido, exposição de dados e falhas de moderação podem ser comunicadas a usepetgo@gmail.com. Incidentes com risco ou dano relevante devem ser avaliados e comunicados à ANPD e aos titulares quando exigido, nos prazos legais aplicáveis.

Mudanças relevantes desta Política devem ser informadas com clareza. Novas finalidades não ficam automaticamente autorizadas por um aceite anterior. Consulte a versão e a data do documento e utilize o canal oficial para esclarecer dúvidas.
