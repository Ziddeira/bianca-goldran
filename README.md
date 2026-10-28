# Landing Page – Alongamento Molde F1 | Bianca Goldran • Glow Studio

Página curta (cerca de 2 telas) com **galeria de trabalhos** e **agenda online ligada ao Google Agenda da Bianca**. Os preços **não** aparecem na página.

- Horário com evento na agenda → aparece **Ocupado** (riscado, não clica).
- Horário livre → aparece **Vago** e a cliente agenda na hora.
- O agendamento vira um evento na agenda da Bianca (com nome, WhatsApp e link direto para a conversa), e ela recebe um e-mail de aviso.
- Qualquer coisa que a Bianca marcar na agenda (cliente do WhatsApp, almoço, folga, médico) bloqueia o horário automaticamente na página.

```
bianca-goldran/
├── index.html                  ← a página
├── assets/css/style.css
├── assets/js/config.js         ← WhatsApp, Instagram, endereço, serviços, URL da agenda
├── assets/js/app.js            ← lógica da agenda
├── assets/img/                 ← fotos da galeria (galeria-*.webp)
└── google-apps-script/
    ├── Codigo.gs               ← backend da agenda (roda na conta Google da Bianca)
    ├── appsscript.json
    └── teste-local.js          ← testes do backend sem precisar do Google
```

Sem a URL da agenda configurada, a página funciona em **modo demonstração** (horários fictícios), útil para conferir o visual.

---

## 1. Ajustar contatos (2 min)

Abra `assets/js/config.js` e preencha:

| Campo | O que é |
|---|---|
| `duracaoMin` | Duração de cada serviço em minutos |
| `whatsapp` | Número com 55 + DDD, só dígitos. Ex.: `5511987654321` |
| `instagram` | @ sem o arroba |
| `endereco` / `mapsUrl` | Endereço do studio e link do Google Maps |

**Trocar ou adicionar fotos da galeria:** salve a foto em `assets/img/` (de preferência `.webp`, em pé, 720×960) e copie uma das linhas `<li>…galeria__item…</li>` do `index.html`, trocando o nome do arquivo e o texto do `alt`. A primeira foto é a que aparece em destaque (com o topo em arco).

## 2. Ligar a agenda ao Google Agenda da Bianca (10 min, uma vez só)

Faça **logada na conta Google da Bianca** (a mesma do Google Agenda dela):

1. Acesse <https://script.google.com> → **Novo projeto**. Dê o nome *Agenda Glow Studio*.
2. Apague o conteúdo de `Código.gs` e cole todo o conteúdo de `google-apps-script/Codigo.gs`.
3. Engrenagem (**Configurações do projeto**) → marque *"Mostrar o arquivo de manifesto appsscript.json"*. Volte ao editor, abra `appsscript.json` e cole o conteúdo do arquivo de mesmo nome. (Isso deixa o fuso em *America/Sao_Paulo*.)
4. Ajuste no topo do `Codigo.gs` o bloco `CONFIG`:
   - `EXPEDIENTE`: dias e horários de atendimento (hoje: ter–sex 9h–19h, sáb 8h–16h, dom e seg fechado).
   - `PAUSAS`: almoço (hoje 12h–13h).
   - `SERVICOS.duracaoMin`: precisa ser igual ao `config.js`.
   - `INTERVALO_ENTRE_ATENDIMENTOS_MIN`, `ANTECEDENCIA_MIN_HORAS`, `DIAS_A_FRENTE`.
5. Selecione a função **`testarConfiguracao`** e clique em **Executar**. O Google vai pedir autorização → *Revisar permissões* → escolha a conta da Bianca → *Avançado* → *Acessar Agenda Glow Studio (não seguro)* → **Permitir**. (O aviso aparece porque o script é seu, não de uma empresa verificada; é normal.) No registro de execução devem aparecer os horários livres dos próximos 7 dias.
6. **Implantar → Nova implantação** → tipo **App da Web**:
   - *Executar como*: **Eu** (conta da Bianca)
   - *Quem pode acessar*: **Qualquer pessoa**
   - Clique em **Implantar** e copie a **URL do app da Web** (termina em `/exec`).
7. Cole essa URL em `assets/js/config.js`, no campo `apiUrl`.

> Mudou algo no `Codigo.gs` depois? Vá em **Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão → Implantar**. Assim a URL continua a mesma.

**Privacidade:** a página só recebe "livre"/"ocupado". Títulos, descrições e convidados dos eventos da Bianca nunca saem da conta dela.

## 3. Publicar a página (grátis)

Qualquer hospedagem de site estático serve. O jeito mais simples:

- **GitHub Pages** (este repositório já está pronto para isso): no GitHub, abra **Settings → Pages**, em *Branch* escolha `main` e a pasta `/ (root)` e clique em **Save**. Em 1–2 minutos o site fica em `https://ziddeira.github.io/bianca-goldran/` (dá para ligar um domínio próprio, ex.: `agenda.glowstudio.com.br`).
- **Netlify**: em <https://app.netlify.com> → *Add new site → Import an existing project* → escolha este repositório. Cada alteração enviada ao GitHub atualiza o site sozinha.
- Alternativas: Vercel ou Cloudflare Pages.

Coloque o link na **bio do Instagram**, no **WhatsApp Business** (mensagem de saudação/ausência) e nos Stories com figurinha de link.

## 4. Como a Bianca usa no dia a dia

- **Cliente marcou pela página** → aparece sozinho no Google Agenda (cor flamingo, com 💅 no título) + e-mail de aviso. Na descrição tem o link `wa.me` para confirmar com a cliente.
- **Cliente marcou pelo WhatsApp / Direct** → a Bianca cria o evento no Google Agenda e o horário some da página.
- **Folga, feriado, viagem** → crie um evento de dia inteiro ("Folga") e o dia fica bloqueado.
- **Cancelamento** → apague o evento e o horário volta a ficar vago.
- **Lista de espera**: quando a agenda lota, a página oferece entrar na lista de espera pelo WhatsApp.

## 5. Medir conversão (opcional)

Em `config.js`, preencha `metaPixelId` (anúncios no Instagram/Facebook) e/ou `googleAnalyticsId`. A página envia os eventos:
`ViewContent` (clicou em agendar) → `InitiateCheckout` (escolheu horário) → `Schedule` (agendamento confirmado) e `Contact` (clicou no WhatsApp).

## Testes

```bash
TZ=America/Sao_Paulo node google-apps-script/teste-local.js google-apps-script/Codigo.gs
```

Simulam a agenda do Google e conferem: grade de horários, almoço, intervalo entre clientes, evento manual bloqueando horário, convite recusado, agendamento duplo, limite por telefone, anti-robô, dia fechado e folga de dia inteiro.
