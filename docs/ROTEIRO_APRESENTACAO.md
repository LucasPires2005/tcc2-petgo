# Roteiro de apresentação do PetGo

**Público:** banca de Trabalho de Conclusão de Curso.  
**Duração:** 18 minutos no roteiro principal, com adaptações para 15 ou 20 minutos.  
**Formato:** 12 slides ou momentos, incluindo demonstrações no celular e no painel.  
**Base técnica:** código consultado em 18 de setembro de 2026 e [ARQUITETURA.md](ARQUITETURA.md).

## 1. Orientação para o apresentador

A apresentação deve responder a uma pergunta central: **como a tecnologia pode aproximar quem identifica um animal em situação de vulnerabilidade de quem pode ajudar?**

As falas abaixo são sugestões para ensaiar, não textos para copiar integralmente nos slides. Use títulos curtos, capturas do próprio aplicativo e poucas palavras de apoio. Explique primeiro o benefício para a pessoa e depois a solução técnica.

Apresente o PetGo como um protótipo funcional em evolução. Diferencie funcionalidades implementadas, resultados observados em testes e impacto social esperado. Não invente números de resgates, doações, usuários reais ou acurácia da moderação.

**Distinção de escopo:** o código atual cobre registro, localização, resgate e uma interface de apoio financeiro. Um processo completo de doação de animais para adoção, com candidatura, avaliação do adotante e acompanhamento, é uma evolução futura. Não apresente o status “resgatado” como prova de adoção concluída.

## 2. Distribuição do tempo

Os tempos incluem as falas, trocas de tela e demonstrações. A arguição da banca fica fora desses 18 minutos, salvo orientação diferente da instituição.

| Momento | Tema | Duração | Tempo acumulado |
| --- | --- | --- | --- |
| 1 | Abertura e proposta | 0min45s | 00:00 a 00:45 |
| 2 | Problema e impacto social | 1min15s | 00:45 a 02:00 |
| 3 | Jornada de colaboração | 1min | 02:00 a 03:00 |
| 4 | Arquitetura e escolhas técnicas | 1min30s | 03:00 a 04:30 |
| 5 | Geolocalização | 1min15s | 04:30 a 05:45 |
| 6 | Demonstração mobile | 3min30s | 05:45 a 09:15 |
| 7 | JWT e bloqueio de sessões | 1min30s | 09:15 a 10:45 |
| 8 | Moderação de imagens | 1min15s | 10:45 a 12:00 |
| 9 | Mercado Pago e webhook | 1min30s | 12:00 a 13:30 |
| 10 | Demonstração administrativa | 2min | 13:30 a 15:30 |
| 11 | Validação e próximos passos | 1min30s | 15:30 a 17:00 |
| 12 | Conclusão | 1min | 17:00 a 18:00 |

## 3. Roteiro por slide ou momento

### Slide 1: PetGo

**Na tela:** nome do projeto, uma captura do mapa, seu nome, curso e orientador. Preencha os dados acadêmicos antes da apresentação.

**Fala sugerida:**

> “Bom dia. Eu sou [seu nome] e vou apresentar o PetGo, um aplicativo para registrar animais em situação de vulnerabilidade e facilitar a participação de pessoas que podem ajudar.
>
> A proposta parte de uma situação simples: alguém encontra um animal precisando de atenção, mas a informação precisa chegar a quem está por perto e pode agir. Vou mostrar como o projeto organiza essa informação e quais decisões técnicas sustentam o aplicativo.”

**Transição:** “Para entender a solução, primeiro precisamos olhar para essa dificuldade de comunicação.”

### Slide 2: O problema e o impacto social esperado

**Na tela:** uma situação ilustrativa curta: “Animal encontrado, localização pouco clara, ajuda difícil de coordenar”. Use uma imagem autorizada e sem sofrimento gráfico.

**Fala sugerida:**

> “Imagine que uma pessoa encontre um animal e compartilhe uma foto em uma conversa. Para ajudar, outra pessoa ainda precisa descobrir onde ele está, qual é a situação e se alguém já realizou o resgate.
>
> O PetGo reúne essas informações em um registro com foto, localização e indicação de urgência. A hipótese do projeto é que isso pode facilitar a descoberta de casos próximos e a organização da ajuda.
>
> O impacto pretendido é apoiar o resgate responsável e a participação da comunidade. A aplicação não substitui atendimento veterinário nem garante que uma publicação resulte em resgate. Essa efetividade precisa ser avaliada com usuários e parceiros em uma próxima etapa.”

**Cuidado:** o exemplo é ilustrativo. Não o apresente como resultado de pesquisa de campo se você não realizou essa pesquisa.

### Slide 3: A jornada de colaboração

**Na tela:** quatro etapas numeradas: registro, descoberta no mapa, ajuda e atualização do resgate.

**Fala sugerida:**

> “A jornada começa quando uma pessoa registra o animal. Outra pessoa pode encontrá-lo pelo mapa ou pela lista de proximidade e consultar os detalhes. Se realizar o resgate, registra essa ação e uma foto, atualizando a situação no aplicativo.
>
> Também existe uma interface de apoio financeiro. O projeto integra o checkout do Mercado Pago, mas a gestão completa da destinação das doações ainda é uma evolução prevista.
>
> Para uma futura etapa de adoção ou doação responsável de animais, será necessário acrescentar critérios de acompanhamento e responsabilidades. Hoje, vou demonstrar o fluxo que já existe: localizar e registrar um resgate.”

**Transição:** “Essa jornada depende de uma arquitetura com responsabilidades bem definidas.”

### Slide 4: Arquitetura do sistema

**Na tela:** a organização das camadas, usando a arquitetura documentada no projeto. Destaque aplicativo, API, serviços Supabase e painel administrativo. Evite uma lista extensa de versões.

**Fala sugerida:**

> “O aplicativo utiliza React Native com Expo. Essa escolha permite compartilhar grande parte da interface entre Android e iOS, mantendo adaptações para recursos específicos, como o mapa.
>
> A API utiliza Node.js com Express e fica no Render. Ela verifica permissões e executa as operações do sistema. O Supabase fornece o PostgreSQL, a autenticação das contas e o armazenamento das fotos.
>
> O painel administrativo utiliza React com Vite e Tailwind. Ele consulta os dados pela API, que também verifica se a conta tem autorização administrativa.
>
> Organizei aplicativo, servidor e painel no mesmo repositório, em pastas separadas. Isso facilita acompanhar a evolução do projeto, mas cada parte tem suas próprias dependências e publicação.”

**Se perguntarem sobre o banco:** a API usa `pg` para consultas SQL. O SDK Supabase atende às integrações de autenticação e arquivos. O painel não recebe credenciais privilegiadas do banco.

### Slide 5: Geolocalização para encontrar casos próximos

**Na tela:** captura real do mapa e da tela “Próximos”. Mostre a atribuição dos dados cartográficos quando ela estiver na captura.

**Fala sugerida:**

> “A localização transforma um registro em uma informação sobre a qual alguém próximo pode agir. Com a permissão do usuário, o aplicativo obtém a posição e calcula a distância até os animais cadastrados.
>
> Na tela Próximos, a pessoa pode consultar os resultados dentro do raio selecionado. No mapa, pode abrir o marcador para entender a situação do animal.
>
> No APK Android, o projeto usa MapLibre com mapas do OpenFreeMap e dados do OpenStreetMap. No iOS, utiliza React Native Maps. A obtenção de localização usa Expo Location.
>
> A posição depende das permissões e das condições do aparelho. Por isso, os testes no celular físico são importantes. O mapa do Expo Go também pode seguir uma implementação diferente da utilizada pelo APK.”

**Nota técnica:** a distância atual não representa uma rota por ruas nem um tempo estimado de chegada. O filtro ocorre no cliente, a partir das coordenadas recebidas da API.

### Momento 6: Demonstração no celular

**Na tela projetada:** celular físico com APK previamente testado. Deixe o login concluído para não gastar o tempo principal digitando credenciais.

**Introdução:**

> “Vou mostrar um caso fictício, identificado como demonstração. Nenhum animal será apresentado como realmente resgatado durante este teste.”

**Execução, com limite de 3min30s:**

1. **Mapa e marcador, 40 segundos.** Abra o mapa e toque em um animal de teste próximo. Mostre foto, saúde e urgência. Fale: “O registro concentra as informações necessárias para a pessoa avaliar como pode ajudar.”
2. **Próximos, 30 segundos.** Mostre a lista e altere o raio uma vez. Fale: “Aqui a descoberta parte da proximidade, sem exigir que a pessoa procure manualmente cada marcador.”
3. **Novo registro, 45 segundos.** Abra o formulário, mostre a seleção de foto e role pelos campos com o teclado aberto. Explique que a API analisa a imagem antes do armazenamento, quando a moderação está configurada. Não envie esse formulário no roteiro principal. Feche-o para evitar depender do tempo de upload.
4. **Resgate de teste, 1min10s.** Abra um registro descartável já preparado. Preencha os dados de demonstração e escolha uma foto inofensiva previamente separada. Envie uma única vez. Mostre a confirmação e a atualização em “Resgatados”, se ela carregar dentro do tempo. Fale: “O sistema registra a ação informada pelo usuário. Isso permite acompanhar o caso, embora ainda não constitua uma verificação independente do resgate.”
5. **Apoio, 25 segundos.** Em outro animal ainda disponível, abra “Apoiar” e mostre a interface de doação. Não conclua uma transação financeira. Fale: “Essa é a entrada para o apoio financeiro. Mais adiante explico a integração de pagamento e seus limites atuais.”

**Condição para executar o passo 4:** use somente conta e animal próprios de teste, preferencialmente em ambiente separado. Nunca altere um registro real para encenar um resgate.

**Se houver atraso:** após aproximadamente 15 segundos sem avanço, mostre a captura ou gravação do mesmo fluxo e continue. Identifique-a verbalmente como gravação de um teste anterior. Não toque repetidamente em enviar.

**Transição:** “Essas operações precisam de controles no servidor, mesmo quando o usuário já está dentro do aplicativo.”

### Slide 7: JWT e bloqueio de sessões ativas

**Na tela:** quatro passos numerados: login, emissão do token, requisição autenticada e verificação do estado de acesso.

**Fala sugerida:**

> “Para as contas vinculadas ao Supabase, o backend valida o login nesse serviço. Depois, a API PetGo emite seu próprio JWT para as operações do aplicativo.
>
> O celular envia esse token no cabeçalho das requisições protegidas. O servidor verifica a assinatura e a validade, identifica a conta e consulta se ela está banida.
>
> O diferencial do bloqueio é a versão da sessão. Quando um administrador bane ou desbane a conta, o sistema incrementa essa versão. Um token emitido antes da mudança deixa de ser aceito, mesmo que ainda não tenha expirado.
>
> Portanto, o bloqueio alcança a próxima chamada protegida de uma sessão que já estava aberta. A autorização ocorre no backend, além dos controles de interface.”

**Precisão técnica para perguntas:**

- O JWT mobile tem assinatura HS256 e validade de 12 horas. A chave permanece no backend.
- JWT assinado não significa conteúdo criptografado.
- O banimento não fecha instantaneamente uma tela ociosa e não cancela operações já autorizadas.
- O painel usa token do Supabase e autorização pela tabela privada de administradores, diferente do JWT mobile.
- Não use expressões como “impossível invadir” ou “100% blindado”. Há limitações documentadas e melhorias pendentes.

### Slide 8: Moderação de imagens

**Na tela:** sequência textual de envio, análise, decisão e armazenamento, acompanhada de uma foto apropriada de animal. Uma mensagem real de bloqueio pode aparecer sem a imagem que a originou.

**Fala sugerida:**

> “Uma plataforma com fotos enviadas por usuários precisa considerar conteúdo inadequado. No cadastro e no resgate, o backend integra o Sightengine para analisar conteúdo sexual explícito e violência gráfica.
>
> O serviço retorna probabilidades. O PetGo compara esses valores com limites definidos no código e pode rejeitar o envio antes de armazenar a foto.
>
> A moderação automática tem limitações. Fotografias de animais feridos exigem cuidado para equilibrar proteção do público e utilidade do registro. Por isso, o painel também permite revisão humana e exclusão de registros inadequados.”

**Demonstração segura:** use uma captura de mensagem de rejeição obtida em teste autorizado, se você já a tiver. Sem essa evidência, explique o fluxo pelo código. Não invente um resultado e não projete nudez, gore ou sofrimento explícito.

**Limite que deve ser conhecido:** sem as credenciais configuradas, o código atual pula a análise. Com o serviço configurado, uma indisponibilidade gera erro. Não descreva a moderação como infalível ou obrigatoriamente ativa em qualquer instalação.

### Slide 9: Mercado Pago e confirmação por webhook

**Na tela:** cinco etapas numeradas: solicitação do checkout, criação da preferência, pagamento no provedor, notificação ao backend e consulta do pagamento.

**Fala sugerida:**

> “O aplicativo solicita um checkout ao backend, que cria uma preferência no Mercado Pago e devolve o endereço para pagamento.
>
> Um ponto técnico importante é a diferença entre o retorno visual e a confirmação no servidor. O usuário pode fechar o navegador. Por isso, a integração também recebe uma notificação chamada webhook.
>
> Ao receber o identificador do pagamento, o backend consulta o Mercado Pago. No fluxo atual de planos, quando encontra o status aprovado, utiliza a referência externa para atualizar o plano da conta.
>
> A página de retorno é informativa. A integração ainda precisa evoluir no tratamento específico de doações e produtos, no histórico de pedidos e na confirmação visual de retirada ou entrega.”

**O que mostrar:** uma captura do checkout de teste e, se já disponível, uma evidência sanitizada da notificação e da atualização do plano. Oculte tokens, e-mails, identificadores pessoais e dados financeiros.

**O que não prometer:** o código atual não implementa assinatura da notificação, processamento idempotente com registro do evento nem reconciliação com um pedido persistido. A consulta ao provedor é uma etapa existente, não uma garantia de segurança financeira completa.

**Atenção ao fluxo de doação:** o mobile envia o tipo de apoio, mas o backend atual compartilha um contrato orientado a planos. Não apresente rastreamento por animal, repasse a instituições, entrega de produtos ou cobrança recorrente como concluídos. Não realize uma cobrança real para a banca.

### Momento 10: Painel administrativo e banimento

**Na tela projetada:** painel já autenticado com conta administrativa. Use o celular com uma segunda conta, comum e exclusiva para testes.

**Fala de abertura:**

> “A participação da comunidade também exige gestão. O painel permite acompanhar os registros e agir quando uma conta ou publicação exige intervenção.”

**Execução, com limite de 2 minutos:**

1. **Dashboard, 25 segundos.** Mostre as contagens. Explique que elas refletem uma consulta ao banco, não uma atualização contínua em tempo real.
2. **Animais, 30 segundos.** Mostre fotos e o comando de exclusão. Abra a confirmação e cancele. Não apague dados durante a apresentação principal.
3. **Usuários, 25 segundos.** Localize a conta comum de teste e mostre seu plano. Explique que o backend exige autorização administrativa para essa operação.
4. **Banimento, 40 segundos.** Se ensaiado e autorizado para a conta descartável, bane-a e, no celular que já estava conectado, execute uma ação que faça nova requisição protegida. Mostre o bloqueio ou encerramento da sessão. Não dependa apenas de alternar para uma tela já carregada em memória.

**Conclusão da demonstração:**

> “A conta já tinha uma sessão aberta. Mesmo assim, a próxima requisição passou novamente pela verificação no servidor e encontrou o bloqueio.”

**Preparação obrigatória:** confirme no ensaio qual ação do aplicativo produz a requisição. Não use a própria conta administrativa no teste. Após a apresentação, desbane a conta de teste, se desejado. Os tokens antigos continuam inválidos e será necessário novo login.

**Alternativa sem alteração ao vivo:** mostre uma gravação do teste de banimento, claramente identificada, e use o painel ao vivo somente para consulta.

### Slide 11: Validação, limites e evolução

**Na tela:** evidências de testes realmente realizados e uma lista curta de prioridades futuras.

**Fala sugerida:**

> “O desenvolvimento incluiu testes em aparelho físico, ajustes de interface no Android e testes automatizados dos controles de acesso. O projeto tem verificações de JWT, autorização administrativa e revogação por banimento.
>
> Esses testes ajudam a verificar comportamentos específicos. Ainda são necessários testes de integração para serviços externos e uma avaliação de uso com participantes.
>
> As próximas prioridades são eliminar a duplicação de senhas no perfil local e reforçar as regras de operações financeiras. Depois, estruturar pedidos e doações, com histórico e tratamento de eventos repetidos.
>
> Para ampliar o impacto social, proponho validar a experiência com protetores e instituições, melhorar a acessibilidade e estudar um fluxo de adoção responsável.”

**Notas para sustentar a fala:**

- A referência técnica registra 35 testes no commit documentado. Se quiser citar esse número, execute a suíte antes e use o resultado da versão que será apresentada.
- Não descreva testes com dependências simuladas como testes completos em produção.
- A duplicação de senhas em texto puro em `public.users` é uma limitação real e prioritária. O uso de Supabase Auth não elimina automaticamente essa cópia feita pelas rotas atuais.
- Antes de ampliação pública, também precisam de revisão as políticas de dados e arquivos, os limites de requisições, as transações de moedas/resgates e o histórico de ações administrativas.
- Uma futura avaliação pode medir tempo para localizar um caso, taxa de conclusão das tarefas e feedback dos participantes. Esses são indicadores propostos, não resultados já obtidos.

### Slide 12: Conclusão

**Na tela:** captura do aplicativo e uma frase curta: “Informação organizada para facilitar a ajuda”.

**Fala sugerida:**

> “O PetGo demonstra como uma aplicação mobile pode reunir localização e registros de animais para facilitar a colaboração. O protótipo conecta essa experiência a uma API, ao armazenamento de imagens e a um painel administrativo.
>
> As principais contribuições técnicas estão na integração da geolocalização, no controle de acesso com bloqueio de sessões, na moderação de imagens e na comunicação de pagamentos por webhook.
>
> O próximo passo é aprofundar a segurança e validar o uso com pessoas envolvidas na causa animal. Assim poderemos avaliar se a solução realmente facilita o atendimento dos casos e orientar sua evolução.
>
> Obrigado. Estou à disposição para as perguntas.”

## 4. Preparação da demonstração

### Antes do dia da banca

- Defina a versão do APK e do backend que serão apresentados. Evite publicar mudanças de última hora sem repetir os testes.
- Use um celular físico, de preferência o mesmo Android em que ensaiou. Não dependa do emulador para localização.
- Prepare uma conta comum de demonstração com e-mail confirmado e uma conta administrativa separada.
- Prepare pelo menos dois animais fictícios próximos ao local da apresentação: um descartável para resgate e outro para consulta. Identifique-os como testes. Prefira ambiente separado e dados sem pessoas reais.
- Separe fotos apropriadas, próprias ou com autorização de uso. Não use imagens de animais em sofrimento para causar impacto emocional.
- Ensaie a navegação e os formulários com o teclado aberto, incluindo o envio de uma foto e a reação ao banimento.
- Verifique a configuração da moderação e o ambiente de teste de pagamentos. Não exiba variáveis de ambiente nem painéis com segredos.
- Grave uma demonstração curta do mesmo APK e prepare capturas dos momentos principais. Armazene tudo localmente no computador da apresentação.
- Confirme como o celular será projetado. Teste cabo, adaptador ou espelhamento antes. Desative notificações pessoais.
- Ajuste o tempo em ensaio real. A leitura isolada das falas não inclui espera de rede e troca de janelas.

### Cerca de 15 minutos antes de começar

1. Carregue o celular e conecte o computador à energia.
2. Confirme internet, permissão de localização e posição recebida pelo aplicativo.
3. Abra o app e o painel para verificar se a API responde. Isso reduz a chance de a primeira chamada da apresentação coincidir com uma retomada do serviço após inatividade, mas não garante disponibilidade.
4. Confira os registros de teste e o raio selecionado em “Próximos”.
5. Faça login novamente se necessário e mantenha as telas iniciais prontas.
6. Abra a gravação de apoio, sem reprodução automática, em uma janela separada.
7. Ative o cronômetro e confirme a ordem das janelas que vai projetar.

## 5. Plano de apoio para falhas

| Situação | Conduta durante a apresentação | Frase sugerida |
| --- | --- | --- |
| Localização não chega | Mostre captura ou gravação feita antes, sem simular que o dado acabou de chegar | “O aparelho não obteve a posição neste momento. Esta gravação mostra o mesmo fluxo em um teste anterior.” |
| API ou upload demora | Espere brevemente e avance para o material local. Não repita o envio várias vezes | “A operação depende de rede. Vou usar o registro do teste anterior para manter o tempo da apresentação.” |
| Checkout não abre | Explique a sequência e use captura de teste | “A abertura depende do provedor externo. Aqui está a tela registrada no ensaio.” |
| Bloqueio não aparece ao trocar de aba | Execute apenas a ação previamente ensaiada que consulta a API. Se não funcionar, use a gravação | “O bloqueio é aplicado em uma nova requisição protegida. Uma tela em memória pode continuar visível.” |
| Painel indisponível | Mostre capturas de dashboard, moderação e teste de acesso | “Vou apresentar a evidência do teste realizado com esta versão.” |

Não diga que o aplicativo funciona offline por ter uma gravação disponível. O material local é apenas apoio à apresentação.

## 6. Adaptações para 15 e 20 minutos

### Versão de 15 minutos

Reduza exatamente 3 minutos do roteiro principal:

- Arquitetura: de 1min30s para 1min, sem detalhar a organização dos pacotes.
- Demonstração mobile: de 3min30s para 2min, mantendo mapa, proximidade e evidência de resgate. Pule a abertura do formulário e a interface de apoio.
- Painel: de 2min para 1min, mostrando as listagens e uma evidência gravada do bloqueio.

Mantenha as explicações de JWT, moderação e webhook. Elas sustentam os diferenciais técnicos solicitados.

### Versão de 20 minutos

Acrescente 2 minutos ao roteiro principal:

- Mais 1 minuto após a demonstração mobile para mostrar evidências previamente gravadas de confirmação de e-mail e recuperação de senha. Não espere e-mails ao vivo.
- Mais 1 minuto no momento de validação para explicar um teste automatizado de revogação de token e seu resultado real.

Se os 20 minutos incluírem perguntas, use a versão de 15 minutos e reserve os 5 restantes para a banca.

## 7. Perguntas prováveis da banca

### “Qual é o diferencial em relação a publicar em uma rede social?”

> “O projeto organiza a informação em campos que a aplicação consegue usar: coordenadas, urgência e situação do resgate. Isso permite descoberta por proximidade e acompanhamento no próprio sistema. A vantagem prática ainda precisa de avaliação comparativa com usuários.”

### “Por que usar Supabase Auth e outro JWT no mobile?”

> “O Supabase valida a identidade das contas vinculadas. O token da API representa o acesso ao domínio PetGo e inclui uma versão que posso invalidar pelo controle de banimento. Essa escolha também acrescenta responsabilidade de implementação e manutenção ao backend.”

### “O banimento desconecta imediatamente todos os aparelhos?”

> “Os tokens antigos deixam de ser aceitos na próxima requisição protegida. O sistema consulta o estado de acesso no banco. Não há um aviso por push que feche imediatamente uma tela ociosa.”

### “O pagamento está confirmado quando aparece a página de sucesso?”

> “A página é informativa. No fluxo atual de planos, o backend recebe a notificação e consulta o pagamento no Mercado Pago. Ainda preciso acrescentar validação da assinatura da notificação, registro de eventos e reconciliação com pedidos.”

### “O dinheiro chega diretamente ao responsável por cada animal?”

> “O protótipo ainda não implementa repasse individual nem prestação de contas por animal. A interface de apoio e a integração de checkout são a base. A gestão financeira completa exige uma próxima etapa.”

### “A inteligência artificial sempre identifica uma foto inadequada?”

> “Não. O serviço retorna probabilidades e pode errar. O sistema aplica limites de decisão e complementa isso com moderação administrativa. A avaliação específica de fotos de animais feridos ainda precisa de mais testes.”

### “Como vocês comprovam que o animal foi realmente resgatado?”

> “Hoje o sistema registra a declaração e a foto enviadas pelo usuário. Não há verificação independente. Uma evolução possível é a validação por moderadores ou instituições, preservando a privacidade das pessoas.”

### “O sistema está pronto para operação pública em grande escala?”

> “Ele é um protótipo funcional. Antes de ampliar o uso, preciso corrigir limitações documentadas, como a cópia de senhas no perfil local, as regras financeiras e o tratamento de concorrência. Também são necessários testes de integração, revisão de privacidade e avaliação com usuários.”

## 8. Material de consulta

- [Arquitetura técnica](ARQUITETURA.md): stack, autenticação, tabelas e limites atuais.
- [Publicação da segurança](../server/SECURITY_ROLLOUT.md): configuração e compatibilidade entre backend e aplicativo.
- [JWT mobile](../server/services/mobileSession.js) e [middleware mobile](../server/middleware/requireMobileUser.js): emissão, validação e controle de acesso.
- [Rotas de autenticação e pagamentos](../server/routes/auth.js): cadastro, recuperação, preferência e webhook.
- [Moderação de imagens](../server/services/imageModeration.js): análise e decisão sobre uploads.
- [Tela do mapa](../app/screens/MapScreen.js): registro, consulta, resgate e apoio.
- [Painel administrativo](../admin/src/App.jsx): navegação das páginas administrativas.

Este roteiro orienta a apresentação. Não constitui evidência de resultados de campo, de conformidade regulatória ou de validação integral de segurança. Atualize as falas caso a implementação mude antes da banca.
