# Site + Agenda online · Bianca Gondran

Landing page do **Molde F1** com valores, galeria de resultados, botão de WhatsApp
e **agendamento online ligado direto ao Google Agenda da Bianca**.

```
bianca-gondran-agenda/
├── index.html          ← o site (é o único arquivo que vai para a hospedagem, junto com /img)
├── img/                ← fotos e vídeo dos resultados
├── backend/
│   ├── Code.gs         ← "servidor" da agenda (Google Apps Script, roda grátis na conta da Bianca)
│   └── appsscript.json ← fuso horário e permissões
└── tests/              ← testes automáticos da lógica da agenda
```

## Como a agenda funciona

- A cliente escolhe **Aplicação** ou **Manutenção**, vê o calendário e só consegue clicar nos dias com horário livre.
- Dias **lotados** aparecem riscados; sábado, domingo e datas passadas ficam bloqueados.
- Ao confirmar, o evento é criado **na hora** na Google Agenda da Bianca, com nome, WhatsApp
  (com link para conversar) e observações. A Bianca também recebe um e-mail.
- Tudo que já estiver na agenda dela bloqueia o horário: compromissos, médico, folga de dia inteiro.
  **Para fechar um dia, basta criar um evento de dia inteiro "Folga".**
- Eventos com `#livre` no título não bloqueiam (ex.: lembretes).
- Proteções: confere de novo o horário no momento de gravar (sem agendamento duplicado),
  campo anti-robô, limite de 2 horários futuros por número e limite de pedidos por hora.
- A página nunca mostra os detalhes da agenda, só se o horário está livre ou não.

Regras atuais (mudar em `backend/Code.gs`, bloco `CONFIG`):

| Regra | Valor |
|---|---|
| Dias de atendimento | segunda a sexta |
| Horário | 9h às 19h (o atendimento termina até 19h) |
| Aplicação Molde F1 | 2h30 |
| Manutenção | 1h30 |
| Intervalo entre clientes | 15 min |
| Antecedência mínima | 3 horas |
| Agenda aberta | próximos 60 dias |

## Passo a passo para ligar a agenda (5 minutos, feito com a conta Google da Bianca)

1. Entre em **https://script.google.com** com o Gmail da agenda da Bianca e clique em **Novo projeto**.
2. Dê o nome **Agenda Site Bianca**. Apague o conteúdo de `Código.gs` e cole todo o `backend/Code.gs`.
3. Em **Configurações do projeto** (engrenagem), marque *Mostrar o arquivo de manifesto "appsscript.json"*.
   Volte ao editor, abra `appsscript.json` e cole o conteúdo de `backend/appsscript.json`.
4. Salve, escolha a função **testarConfiguracao** no topo e clique em **Executar**.
   O Google vai pedir autorização (agenda + e-mail). Aceite. No registro aparecem os horários livres dos próximos dias.
5. Clique em **Implantar → Nova implantação → (engrenagem) App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   - **Implantar** e copie a **URL do app da Web** (termina em `/exec`).
6. Abra o `index.html` e, no bloco `CONFIG` (perto do final do arquivo), cole a URL:
   ```js
   API_URL: 'https://script.google.com/macros/s/XXXX/exec',
   ```
   Pronto: o aviso "Modo demonstração" some e os agendamentos passam a ser reais.

> Se a agência preferir publicar o script na própria conta: a Bianca compartilha a agenda dela com
> a conta da agência com a permissão **"Fazer alterações nos eventos"**, e em `Code.gs` troque
> `CALENDAR_ID: 'primary'` pelo e-mail da Bianca.

### Alterou o Code.gs depois?
**Implantar → Gerenciar implantações → lápis → Versão: Nova versão → Implantar.** A URL continua a mesma.

## Ajustes no site (`index.html`, bloco `CONFIG`)

```js
PRECOS: { aplicacao: 180, manutencao: 120 },   // ← VALORES PROVISÓRIOS, confirmar com a Bianca
PRECOS_PROVISORIOS: true,                       // ← mude para false quando confirmar (some o "valor provisório")
WHATSAPP: '5549991914945',
```
Se mudar a duração dos serviços, mude nos **dois** lugares: `index.html` e `backend/Code.gs`.

Link direto já com a manutenção selecionada (bom para stories e anúncios): `seusite.com/?servico=manutencao`

## Publicar o site

O site é estático (HTML + imagens). Qualquer uma destas opções funciona, de graça:

- **Netlify Drop**: arraste a pasta em https://app.netlify.com/drop (não precisa enviar `backend/` nem `tests/`).
- **Vercel** ou **GitHub Pages**.

Depois é só apontar um domínio (ex.: `biancagondran.com.br`) e colocar o link na bio do Instagram.

## Métricas de conversão (opcional)

Se o site tiver Google Tag Manager/GA4 ou Pixel da Meta, a página já envia estes eventos:
`clique_agendar`, `escolheu_horario`, `iniciou_dados`, `agendamento_confirmado` (+ `Schedule` no Pixel) e `clique_whatsapp`.

## Testes

```bash
TZ=America/Sao_Paulo node --test tests/agenda.test.js
```
