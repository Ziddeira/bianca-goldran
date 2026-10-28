/**
 * Configurações da página – edite aqui (não precisa mexer no HTML).
 */
window.GLOW_CONFIG = {
  // URL do "App da Web" publicado no Google Apps Script (termina em /exec).
  // Enquanto estiver vazio, a agenda funciona em MODO DEMONSTRAÇÃO (horários fictícios).
  apiUrl: '',

  // WhatsApp com DDI + DDD, só números. Ex.: 5511987654321
  whatsapp: '5500000000000',
  instagram: 'glowstudio',
  endereco: 'Glow Studio • Endereço do studio',
  mapsUrl: 'https://maps.google.com/?q=Glow+Studio',

  // Serviços da agenda (os preços NÃO aparecem na página). A chave (aplicacao /
  // manutencao) e a duração precisam ser as mesmas do google-apps-script/Codigo.gs.
  servicos: {
    aplicacao: { nome: 'Aplicação Molde F1', duracaoMin: 150 },
    manutencao: { nome: 'Manutenção Molde F1', duracaoMin: 120 },
  },

  // Quantos dias aparecem na agenda.
  diasNaAgenda: 21,

  // Rastreamento opcional (deixe vazio se não usar).
  metaPixelId: '',
  googleAnalyticsId: '',
};
