const SUPABASE_URL = "https://utzatocvigocepssetyd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_kIzQpw2ysR9-5UGczWwWxA_WV8iNycO";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let calendar;
let veiculos = [];
let localidades = [];
let pessoas = [];
let alocacoesCache = [];
let alocacaoEditandoId = null;
let usuarioAtual = null;

document.addEventListener("DOMContentLoaded", async function () {
  configurarEventosAuth();

  const { data } = await supabaseClient.auth.getUser();
  usuarioAtual = data.user || null;

  if (usuarioAtual) {
    await iniciarAplicacao();
  } else {
    mostrarTelaAuth();
  }

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    usuarioAtual = session?.user || null;

    if (usuarioAtual) {
      await iniciarAplicacao();
    } else {
      mostrarTelaAuth();
    }
  });
});

function configurarEventosAuth() {
  document.getElementById("btnLogin").addEventListener("click", login);
  document.getElementById("btnSignup").addEventListener("click", criarConta);
  document.getElementById("btnLogout").addEventListener("click", logout);
}

function mostrarMensagemAuth(msg, erro = false) {
  const el = document.getElementById("authMessage");
  el.textContent = msg;
  el.style.color = erro ? "#c62828" : "#444";
}

function mostrarTelaAuth() {
  document.getElementById("authScreen").classList.remove("oculto");
  document.getElementById("appShell").classList.add("oculto");
}

function mostrarApp() {
  document.getElementById("authScreen").classList.add("oculto");
  document.getElementById("appShell").classList.remove("oculto");
}

async function criarConta() {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;

  if (!email || !password) {
    mostrarMensagemAuth("Preencha email e senha.", true);
    return;
  }

  const { error } = await supabaseClient.auth.signUp({
    email,
    password
  });

  if (error) {
    mostrarMensagemAuth(error.message, true);
    return;
  }

  mostrarMensagemAuth("Conta criada com sucesso. Entre com seu email e senha.");
}

async function login() {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;

  if (!email || !password) {
    mostrarMensagemAuth("Preencha email e senha.", true);
    return;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    mostrarMensagemAuth(error.message, true);
    return;
  }

  mostrarMensagemAuth("Login realizado com sucesso.");
}

async function logout() {
  await supabaseClient.auth.signOut();
}

async function iniciarAplicacao() {
  mostrarApp();
  document.getElementById("usuarioLogado").textContent = `Logado como: ${usuarioAtual?.email || ""}`;

  await carregarBases();

  if (!calendar) {
    await iniciarCalendario();

    document.getElementById("tipoVisualizacao").addEventListener("change", function () {
      calendar.changeView(this.value);
    });

    document.getElementById("btnNovaAlocacao").addEventListener("click", function () {
      const hoje = new Date().toISOString().slice(0, 10);
      abrirModalAlocacao("novo", { data: hoje });
    });

    document.getElementById("btnCopiarSemana").addEventListener("click", copiarSemanaAtual);
    document.getElementById("btnGerenciarCadastros").addEventListener("click", abrirModalCadastros);
    document.getElementById("filtroVeiculo").addEventListener("change", aplicarFiltroVeiculo);
    document.getElementById("btnExportarExcel").addEventListener("click", exportarExcel);
  }

  preencherFiltroVeiculos();
  atualizarCalendario();
}

async function carregarBases() {
  await carregarVeiculos();
  await carregarLocalidades();
  await carregarPessoas();
  await carregarAlocacoesCache();
}

async function carregarVeiculos() {
  const { data, error } = await supabaseClient
    .from("veiculos")
    .select("*")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    console.error("Erro veículos:", error);
    return;
  }

  veiculos = data || [];
}

async function carregarLocalidades() {
  const { data, error } = await supabaseClient
    .from("localidades")
    .select("*")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    console.error("Erro localidades:", error);
    return;
  }

  localidades = data || [];
}

async function carregarPessoas() {
  const { data, error } = await supabaseClient
    .from("pessoas")
    .select("*")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    console.error("Erro pessoas:", error);
    return;
  }

  pessoas = data || [];
}

async function carregarAlocacoesCache() {
  const { data, error } = await supabaseClient
    .from("alocacoes")
    .select(`
      id,
      data,
      observacao,
      passageiro_1,
      passageiro_2,
      passageiro_3,
      passageiro_4,
      created_at,
      created_by,
      updated_at,
      updated_by,
      veiculos:veiculo_id ( id, nome, cor, placa, cor_hex ),
      partida:partida_id ( id, nome ),
      destino:destino_id ( id, nome ),
      motorista:motorista_id ( id, nome )
    `)
    .order("data");

  if (error) {
    console.error("Erro alocações:", error);
    alocacoesCache = [];
    return;
  }

  alocacoesCache = data || [];
}

function formatarEvento(item) {
  return {
    id: item.id,
    start: item.data,
    allDay: true,
    title: `${item.veiculos?.nome || "Veículo"} - ${item.motorista?.nome || "Sem motorista"}`,
    backgroundColor: item.veiculos?.cor_hex || undefined,
    borderColor: item.veiculos?.cor_hex || undefined,
    extendedProps: item
  };
}

function obterEventosFiltrados() {
  const filtroVeiculo = document.getElementById("filtroVeiculo")?.value || "";
  let lista = [...alocacoesCache];

  if (filtroVeiculo) {
    lista = lista.filter(a => String(a.veiculos?.id) === String(filtroVeiculo));
  }

  return lista.map(formatarEvento);
}

async function iniciarCalendario() {
  const calendarEl = document.getElementById("calendar");

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridWeek",
    locale: "pt-br",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridWeek,dayGridMonth,multiMonthYear"
    },
    buttonText: {
      today: "Hoje",
      week: "Semana",
      month: "Mês",
      year: "Ano"
    },
    events: obterEventosFiltrados(),
    dateClick: function (info) {
      abrirModalAlocacao("novo", { data: info.dateStr });
    },
    eventClick: function(info) {
      abrirModalAlocacao("editar", info.event.extendedProps);
    },
    eventDidMount: function(info) {
      const item = info.event.extendedProps;
      const passageiros = [
        item.passageiro_1,
        item.passageiro_2,
        item.passageiro_3,
        item.passageiro_4
      ].filter(Boolean);

      const tooltip = [
        `Veículo: ${item.veiculos?.nome || "-"}`,
        `Rota: ${item.partida?.nome || "-"} → ${item.destino?.nome || "-"}`,
        `Motorista: ${item.motorista?.nome || "-"}`,
        `Passageiros: ${passageiros.length ? passageiros.join(", ") : "Sem passageiros"}`,
        `Criado por: ${item.created_by || "-"}`,
        `Atualizado por: ${item.updated_by || "-"}`,
        `Obs.: ${item.observacao || "-"}`
      ].join("\n");

      info.el.title = tooltip;

      const html = `
        <div class="evento-linha">
          <strong>🚗 ${item.veiculos?.nome || "Veículo"}</strong>
          <div>📍 ${item.partida?.nome || "-"} → ${item.destino?.nome || "-"}</div>
          <div>👨 ${item.motorista?.nome || "-"}</div>
        </div>
      `;

      const titleEl = info.el.querySelector(".fc-event-title");
      if (titleEl) {
        titleEl.innerHTML = html;
      }
    }
  });

  calendar.render();
}

function atualizarCalendario() {
  if (!calendar) return;
  calendar.removeAllEvents();
  calendar.addEventSource(obterEventosFiltrados());
}

function preencherFiltroVeiculos() {
  const select = document.getElementById("filtroVeiculo");
  if (!select) return;

  select.innerHTML = `<option value="">Todos os veículos</option>` +
    veiculos.map(v => `<option value="${v.id}">${v.nome}</option>`).join("");
}

function aplicarFiltroVeiculo() {
  atualizarCalendario();
}

function abrirModalAlocacao(modo, dados) {
  const modal = document.getElementById("modalAlocacao");
  alocacaoEditandoId = modo === "editar" ? dados.id : null;

  const dataValor = dados?.data || "";
  const veiculoId = dados?.veiculos?.id || "";
  const partidaId = dados?.partida?.id || "";
  const destinoId = dados?.destino?.id || "";
  const motoristaId = dados?.motorista?.id || "";

  modal.innerHTML = `
    <div class="caixa-modal">
      <h2>${modo === "editar" ? "Editar alocação" : "Nova alocação"}</h2>

      <label>Data</label>
      <input type="date" id="alcData" value="${dataValor}" />

      <label>Veículo</label>
      <div class="linha-com-botao">
        <select id="alcVeiculo"></select>
        <button type="button" id="btnAddVeiculo">+</button>
      </div>

      <label>Partida</label>
      <div class="linha-com-botao">
        <select id="alcPartida"></select>
        <button type="button" id="btnAddPartida">+</button>
      </div>

      <label>Destino</label>
      <div class="linha-com-botao">
        <select id="alcDestino"></select>
        <button type="button" id="btnAddDestino">+</button>
      </div>

      <label>Motorista</label>
      <div class="linha-com-botao">
        <select id="alcMotorista"></select>
        <button type="button" id="btnAddMotorista">+</button>
      </div>

      <label>Passageiro 1</label>
      <input type="text" id="pass1" value="${dados?.passageiro_1 || ""}" />

      <label>Passageiro 2</label>
      <input type="text" id="pass2" value="${dados?.passageiro_2 || ""}" />

      <label>Passageiro 3</label>
      <input type="text" id="pass3" value="${dados?.passageiro_3 || ""}" />

      <label>Passageiro 4</label>
      <input type="text" id="pass4" value="${dados?.passageiro_4 || ""}" />

      <label>Observação</label>
      <textarea id="alcObs">${dados?.observacao || ""}</textarea>

      <div class="acoes-modal">
        ${modo === "editar" ? `<button type="button" class="btn-perigo" id="btnExcluirAlocacao">Excluir</button>` : ""}
        <button type="button" id="btnSalvarAlocacao">${modo === "editar" ? "Salvar alterações" : "Salvar"}</button>
        <button type="button" class="btn-secundario" id="btnFecharModal">Fechar</button>
      </div>
    </div>
  `;

  modal.classList.remove("oculto");

  atualizarSelectVeiculos("alcVeiculo", veiculoId);
  atualizarSelectLocalidades("alcPartida", partidaId);
  atualizarSelectLocalidades("alcDestino", destinoId);
  atualizarSelectMotoristas("alcMotorista", motoristaId);

  document.getElementById("btnFecharModal").onclick = () => modal.classList.add("oculto");
  document.getElementById("btnSalvarAlocacao").onclick = salvarAlocacao;
  document.getElementById("btnAddVeiculo").onclick = () => abrirModalNovoVeiculo("alcVeiculo");
  document.getElementById("btnAddPartida").onclick = () => abrirModalNovaLocalidade("alcPartida");
  document.getElementById("btnAddDestino").onclick = () => abrirModalNovaLocalidade("alcDestino");
  document.getElementById("btnAddMotorista").onclick = () => abrirModalNovaPessoa("alcMotorista");

  if (modo === "editar") {
    document.getElementById("btnExcluirAlocacao").onclick = excluirAlocacao;
  }
}

function atualizarSelectVeiculos(selectId, valorSelecionado = "") {
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = veiculos.length
    ? veiculos.map(v => `<option value="${v.id}">${v.nome}</option>`).join("")
    : `<option value="">Nenhum veículo cadastrado</option>`;

  if (valorSelecionado) select.value = String(valorSelecionado);
}

function atualizarSelectLocalidades(selectId, valorSelecionado = "") {
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = localidades.length
    ? localidades.map(l => `<option value="${l.id}">${l.nome}</option>`).join("")
    : `<option value="">Nenhuma localidade cadastrada</option>`;

  if (valorSelecionado) select.value = String(valorSelecionado);
}

function atualizarSelectMotoristas(selectId, valorSelecionado = "") {
  const select = document.getElementById(selectId);
  if (!select) return;

  const motoristas = pessoas.filter(p => p.pode_dirigir === true);

  select.innerHTML = motoristas.length
    ? motoristas.map(p => `<option value="${p.id}">${p.nome}</option>`).join("")
    : `<option value="">Nenhum motorista cadastrado</option>`;

  if (valorSelecionado) select.value = String(valorSelecionado);
}

function abrirModalNovaLocalidade(selectDestinoId) {
  const modal = document.getElementById("modalAuxiliar");

  modal.innerHTML = `
    <div class="caixa-modal">
      <h2>Nova localidade</h2>

      <label>Nome</label>
      <input type="text" id="novaLocalidadeNome" />

      <label>Sigla</label>
      <input type="text" id="novaLocalidadeSigla" />

      <div class="acoes-modal">
        <button type="button" id="btnSalvarLocalidade">Salvar</button>
        <button type="button" class="btn-secundario" id="btnFecharAuxiliar">Fechar</button>
      </div>
    </div>
  `;

  modal.classList.remove("oculto");

  document.getElementById("btnFecharAuxiliar").onclick = () => modal.classList.add("oculto");

  document.getElementById("btnSalvarLocalidade").onclick = async () => {
    const nome = document.getElementById("novaLocalidadeNome").value.trim();
    const sigla = document.getElementById("novaLocalidadeSigla").value.trim();

    if (!nome) {
      alert("Informe o nome da localidade.");
      return;
    }

    const { data, error } = await supabaseClient
      .from("localidades")
      .insert([{ nome, sigla, ativo: true }])
      .select()
      .single();

    if (error) {
      console.error("Erro localidade:", error);
      alert("Erro ao salvar localidade.");
      return;
    }

    await carregarLocalidades();
    atualizarSelectLocalidades("alcPartida");
    atualizarSelectLocalidades("alcDestino");

    const select = document.getElementById(selectDestinoId);
    if (select) select.value = String(data.id);

    modal.classList.add("oculto");
  };
}

function abrirModalNovoVeiculo(selectDestinoId) {
  const modal = document.getElementById("modalAuxiliar");

  modal.innerHTML = `
    <div class="caixa-modal">
      <h2>Novo veículo</h2>

      <label>Nome</label>
      <input type="text" id="novoVeiculoNome" />

      <label>Cor</label>
      <input type="text" id="novoVeiculoCor" />

      <label>Placa</label>
      <input type="text" id="novoVeiculoPlaca" />

      <label>Cor hex (opcional)</label>
      <input type="text" id="novoVeiculoCorHex" placeholder="#1f4e79" />

      <div class="acoes-modal">
        <button type="button" id="btnSalvarVeiculo">Salvar</button>
        <button type="button" class="btn-secundario" id="btnFecharAuxiliar">Fechar</button>
      </div>
    </div>
  `;

  modal.classList.remove("oculto");

  document.getElementById("btnFecharAuxiliar").onclick = () => modal.classList.add("oculto");

  document.getElementById("btnSalvarVeiculo").onclick = async () => {
    const nome = document.getElementById("novoVeiculoNome").value.trim();
    const cor = document.getElementById("novoVeiculoCor").value.trim();
    const placa = document.getElementById("novoVeiculoPlaca").value.trim();
    const cor_hex = document.getElementById("novoVeiculoCorHex").value.trim();

    if (!nome) {
      alert("Informe o nome do veículo.");
      return;
    }

    const { data, error } = await supabaseClient
      .from("veiculos")
      .insert([{ nome, cor, placa, cor_hex, ativo: true }])
      .select()
      .single();

    if (error) {
      console.error("Erro veículo:", error);
      alert("Erro ao salvar veículo.");
      return;
    }

    await carregarVeiculos();
    preencherFiltroVeiculos();
    atualizarSelectVeiculos("alcVeiculo");

    const select = document.getElementById(selectDestinoId);
    if (select) select.value = String(data.id);

    modal.classList.add("oculto");
  };
}

function abrirModalNovaPessoa(selectDestinoId) {
  const modal = document.getElementById("modalAuxiliar");

  modal.innerHTML = `
    <div class="caixa-modal">
      <h2>Nova pessoa / motorista</h2>

      <label>Nome</label>
      <input type="text" id="novaPessoaNome" />

      <label>Pode dirigir?</label>
      <select id="novaPessoaPodeDirigir">
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </select>

      <div class="acoes-modal">
        <button type="button" id="btnSalvarPessoa">Salvar</button>
        <button type="button" class="btn-secundario" id="btnFecharAuxiliar">Fechar</button>
      </div>
    </div>
  `;

  modal.classList.remove("oculto");

  document.getElementById("btnFecharAuxiliar").onclick = () => modal.classList.add("oculto");

  document.getElementById("btnSalvarPessoa").onclick = async () => {
    const nome = document.getElementById("novaPessoaNome").value.trim();
    const pode_dirigir = document.getElementById("novaPessoaPodeDirigir").value === "true";

    if (!nome) {
      alert("Informe o nome da pessoa.");
      return;
    }

    const { data, error } = await supabaseClient
      .from("pessoas")
      .insert([{ nome, pode_dirigir, ativo: true }])
      .select()
      .single();

    if (error) {
      console.error("Erro pessoa:", error);
      alert("Erro ao salvar pessoa.");
      return;
    }

    await carregarPessoas();
    atualizarSelectMotoristas("alcMotorista");

    const select = document.getElementById(selectDestinoId);
    if (select && pode_dirigir) select.value = String(data.id);

    modal.classList.add("oculto");
  };
}

async function salvarAlocacao() {
  const payload = {
    data: document.getElementById("alcData").value,
    veiculo_id: Number(document.getElementById("alcVeiculo").value),
    partida_id: Number(document.getElementById("alcPartida").value),
    destino_id: Number(document.getElementById("alcDestino").value),
    motorista_id: Number(document.getElementById("alcMotorista").value),
    passageiro_1: document.getElementById("pass1").value.trim(),
    passageiro_2: document.getElementById("pass2").value.trim(),
    passageiro_3: document.getElementById("pass3").value.trim(),
    passageiro_4: document.getElementById("pass4").value.trim(),
    observacao: document.getElementById("alcObs").value.trim(),
    updated_at: new Date().toISOString(),
    updated_by: usuarioAtual?.email || null
  };

  if (!payload.data || !payload.veiculo_id || !payload.partida_id || !payload.destino_id || !payload.motorista_id) {
    alert("Preencha data, veículo, partida, destino e motorista.");
    return;
  }

  const conflitosMesmoDia = alocacoesCache.filter(a =>
    a.data === payload.data &&
    String(a.id) !== String(alocacaoEditandoId || "")
  );

  const conflitoVeiculo = conflitosMesmoDia.find(a => Number(a.veiculos?.id) === payload.veiculo_id);
  if (conflitoVeiculo) {
    alert(
      `Não foi possível salvar.\n\n` +
      `O veículo "${conflitoVeiculo.veiculos?.nome || ""}" já está alocado em ${payload.data}.`
    );
    return;
  }

  const conflitoMotorista = conflitosMesmoDia.find(a => Number(a.motorista?.id) === payload.motorista_id);
  if (conflitoMotorista) {
    alert(
      `Não foi possível salvar.\n\n` +
      `O motorista "${conflitoMotorista.motorista?.nome || ""}" já está alocado em ${payload.data}.`
    );
    return;
  }

  let error;

  if (alocacaoEditandoId) {
    ({ error } = await supabaseClient
      .from("alocacoes")
      .update(payload)
      .eq("id", alocacaoEditandoId));
  } else {
    payload.created_at = new Date().toISOString();
    payload.created_by = usuarioAtual?.email || null;

    ({ error } = await supabaseClient
      .from("alocacoes")
      .insert([payload]));
  }

  if (error) {
    console.error("Erro salvar alocação:", error);
    alert("Erro ao salvar alocação.");
    return;
  }

  alert("Alocação salva com sucesso.");

  document.getElementById("modalAlocacao").classList.add("oculto");
  await carregarAlocacoesCache();
  atualizarCalendario();
}
async function excluirAlocacao() {
  if (!alocacaoEditandoId) return;

  const confirmar = confirm("Deseja excluir esta alocação?");
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from("alocacoes")
    .delete()
    .eq("id", alocacaoEditandoId);

  if (error) {
    console.error("Erro ao excluir alocação:", error);
    alert("Erro ao excluir alocação.");
    return;
  }

  document.getElementById("modalAlocacao").classList.add("oculto");
  await carregarAlocacoesCache();
  atualizarCalendario();
}

async function copiarSemanaAtual() {
  if (!calendar) return;

  const inicio = calendar.view.currentStart;
  const fimExclusivo = calendar.view.currentEnd;

  const inicioStr = inicio.toISOString().slice(0, 10);
  const fim = new Date(fimExclusivo);
  fim.setDate(fim.getDate() - 1);
  const fimStr = fim.toISOString().slice(0, 10);

  const { data, error } = await supabaseClient
    .from("alocacoes")
    .select("*")
    .gte("data", inicioStr)
    .lte("data", fimStr);

  if (error) {
    console.error("Erro ao buscar semana:", error);
    alert("Erro ao buscar semana atual.");
    return;
  }

  if (!data || !data.length) {
    alert("Não há alocações nesta semana para copiar.");
    return;
  }

  const confirmar = confirm("Deseja copiar a semana atual para a próxima semana?");
  if (!confirmar) return;

  const novos = data.map(item => {
    const novaData = new Date(item.data + "T00:00:00");
    novaData.setDate(novaData.getDate() + 7);

    return {
      data: novaData.toISOString().slice(0, 10),
      veiculo_id: item.veiculo_id,
      partida_id: item.partida_id,
      destino_id: item.destino_id,
      motorista_id: item.motorista_id,
      passageiro_1: item.passageiro_1,
      passageiro_2: item.passageiro_2,
      passageiro_3: item.passageiro_3,
      passageiro_4: item.passageiro_4,
      observacao: item.observacao,
      created_at: new Date().toISOString(),
      created_by: usuarioAtual?.email || null,
      updated_at: new Date().toISOString(),
      updated_by: usuarioAtual?.email || null
    };
  });

  const { error: errorInsert } = await supabaseClient
    .from("alocacoes")
    .insert(novos);

  if (errorInsert) {
    console.error("Erro ao copiar semana:", errorInsert);
    alert("Erro ao copiar semana.");
    return;
  }

  await carregarAlocacoesCache();
  atualizarCalendario();
  alert("Semana copiada com sucesso.");
}

function exportarExcel() {
  const dados = alocacoesCache.map(item => ({
    Data: item.data,
    Veículo: item.veiculos?.nome || "",
    Partida: item.partida?.nome || "",
    Destino: item.destino?.nome || "",
    Motorista: item.motorista?.nome || "",
    Passageiro1: item.passageiro_1 || "",
    Passageiro2: item.passageiro_2 || "",
    Passageiro3: item.passageiro_3 || "",
    Passageiro4: item.passageiro_4 || "",
    Observação: item.observacao || "",
    CriadoPor: item.created_by || "",
    AtualizadoPor: item.updated_by || ""
  }));

  const worksheet = XLSX.utils.json_to_sheet(dados);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Alocacoes");
  XLSX.writeFile(workbook, "alocacoes.xlsx");
}

function abrirModalCadastros() {
  const modal = document.getElementById("modalCadastros");

  modal.innerHTML = `
    <div class="caixa-modal modal-grande">
      <h2>Gerenciar cadastros</h2>

      <div class="grid-cadastros">
        <div class="bloco-cadastro">
          <h3>Veículos</h3>
          <button type="button" id="btnNovoVeiculoCadastro">Novo veículo</button>
          <div class="lista-cadastro" id="listaVeiculos"></div>
        </div>

        <div class="bloco-cadastro">
          <h3>Localidades</h3>
          <button type="button" id="btnNovaLocalidadeCadastro">Nova localidade</button>
          <div class="lista-cadastro" id="listaLocalidades"></div>
        </div>

        <div class="bloco-cadastro">
          <h3>Pessoas / Motoristas</h3>
          <button type="button" id="btnNovaPessoaCadastro">Nova pessoa</button>
          <div class="lista-cadastro" id="listaPessoas"></div>
        </div>
      </div>

      <div class="acoes-modal">
        <button type="button" class="btn-secundario" id="btnFecharCadastros">Fechar</button>
      </div>
    </div>
  `;

  modal.classList.remove("oculto");
  document.getElementById("btnFecharCadastros").onclick = () => modal.classList.add("oculto");
  document.getElementById("btnNovoVeiculoCadastro").onclick = () => abrirFormularioEdicaoVeiculo();
  document.getElementById("btnNovaLocalidadeCadastro").onclick = () => abrirFormularioEdicaoLocalidade();
  document.getElementById("btnNovaPessoaCadastro").onclick = () => abrirFormularioEdicaoPessoa();

  renderizarListaCadastros();
}

function renderizarListaCadastros() {
  const listaVeiculos = document.getElementById("listaVeiculos");
  const listaLocalidades = document.getElementById("listaLocalidades");
  const listaPessoas = document.getElementById("listaPessoas");

  if (listaVeiculos) {
    listaVeiculos.innerHTML = veiculos.map(v => `
      <div class="item-cadastro">
        <strong>${v.nome}</strong>
        <div>Cor: ${v.cor || "-"}</div>
        <div>Placa: ${v.placa || "-"}</div>
        <div>Hex: ${v.cor_hex || "-"}</div>
        <div class="item-acoes">
          <button type="button" onclick="abrirFormularioEdicaoVeiculo(${v.id})">Editar</button>
          <button type="button" class="btn-perigo" onclick="excluirVeiculo(${v.id})">Excluir</button>
        </div>
      </div>
    `).join("");
  }

  if (listaLocalidades) {
    listaLocalidades.innerHTML = localidades.map(l => `
      <div class="item-cadastro">
        <strong>${l.nome}</strong>
        <div>Sigla: ${l.sigla || "-"}</div>
        <div class="item-acoes">
          <button type="button" onclick="abrirFormularioEdicaoLocalidade(${l.id})">Editar</button>
          <button type="button" class="btn-perigo" onclick="excluirLocalidade(${l.id})">Excluir</button>
        </div>
      </div>
    `).join("");
  }

  if (listaPessoas) {
    listaPessoas.innerHTML = pessoas.map(p => `
      <div class="item-cadastro">
        <strong>${p.nome}</strong>
        <div>Pode dirigir: ${p.pode_dirigir ? "Sim" : "Não"}</div>
        <div class="item-acoes">
          <button type="button" onclick="abrirFormularioEdicaoPessoa(${p.id})">Editar</button>
          <button type="button" class="btn-perigo" onclick="excluirPessoa(${p.id})">Excluir</button>
        </div>
      </div>
    `).join("");
  }
}

function abrirFormularioEdicaoVeiculo(id = null) {
  const item = id ? veiculos.find(v => v.id === id) : null;
  const modal = document.getElementById("modalAuxiliar");

  modal.innerHTML = `
    <div class="caixa-modal">
      <h2>${id ? "Editar veículo" : "Novo veículo"}</h2>

      <label>Nome</label>
      <input type="text" id="editVeiculoNome" value="${item?.nome || ""}" />

      <label>Cor</label>
      <input type="text" id="editVeiculoCor" value="${item?.cor || ""}" />

      <label>Placa</label>
      <input type="text" id="editVeiculoPlaca" value="${item?.placa || ""}" />

      <label>Cor hex</label>
      <input type="text" id="editVeiculoCorHex" value="${item?.cor_hex || ""}" placeholder="#1f4e79" />

      <div class="acoes-modal">
        <button type="button" id="btnSalvarEditVeiculo">${id ? "Salvar alterações" : "Salvar"}</button>
        <button type="button" class="btn-secundario" id="btnFecharAuxiliar">Fechar</button>
      </div>
    </div>
  `;

  modal.classList.remove("oculto");
  document.getElementById("btnFecharAuxiliar").onclick = () => modal.classList.add("oculto");
  document.getElementById("btnSalvarEditVeiculo").onclick = async () => {
    const payload = {
      nome: document.getElementById("editVeiculoNome").value.trim(),
      cor: document.getElementById("editVeiculoCor").value.trim(),
      placa: document.getElementById("editVeiculoPlaca").value.trim(),
      cor_hex: document.getElementById("editVeiculoCorHex").value.trim(),
      ativo: true
    };

    if (!payload.nome) {
      alert("Informe o nome do veículo.");
      return;
    }

    let error;

    if (id) {
      ({ error } = await supabaseClient.from("veiculos").update(payload).eq("id", id));
    } else {
      ({ error } = await supabaseClient.from("veiculos").insert([payload]));
    }

    if (error) {
      console.error(error);
      alert("Erro ao salvar veículo.");
      return;
    }

    await carregarVeiculos();
    preencherFiltroVeiculos();
    renderizarListaCadastros();
    atualizarCalendario();
    modal.classList.add("oculto");
  };
}

function abrirFormularioEdicaoLocalidade(id = null) {
  const item = id ? localidades.find(l => l.id === id) : null;
  const modal = document.getElementById("modalAuxiliar");

  modal.innerHTML = `
    <div class="caixa-modal">
      <h2>${id ? "Editar localidade" : "Nova localidade"}</h2>

      <label>Nome</label>
      <input type="text" id="editLocalidadeNome" value="${item?.nome || ""}" />

      <label>Sigla</label>
      <input type="text" id="editLocalidadeSigla" value="${item?.sigla || ""}" />

      <div class="acoes-modal">
        <button type="button" id="btnSalvarEditLocalidade">${id ? "Salvar alterações" : "Salvar"}</button>
        <button type="button" class="btn-secundario" id="btnFecharAuxiliar">Fechar</button>
      </div>
    </div>
  `;

  modal.classList.remove("oculto");
  document.getElementById("btnFecharAuxiliar").onclick = () => modal.classList.add("oculto");
  document.getElementById("btnSalvarEditLocalidade").onclick = async () => {
    const payload = {
      nome: document.getElementById("editLocalidadeNome").value.trim(),
      sigla: document.getElementById("editLocalidadeSigla").value.trim(),
      ativo: true
    };

    if (!payload.nome) {
      alert("Informe o nome da localidade.");
      return;
    }

    let error;

    if (id) {
      ({ error } = await supabaseClient.from("localidades").update(payload).eq("id", id));
    } else {
      ({ error } = await supabaseClient.from("localidades").insert([payload]));
    }

    if (error) {
      console.error(error);
      alert("Erro ao salvar localidade.");
      return;
    }

    await carregarLocalidades();
    renderizarListaCadastros();
    modal.classList.add("oculto");
  };
}

function abrirFormularioEdicaoPessoa(id = null) {
  const item = id ? pessoas.find(p => p.id === id) : null;
  const modal = document.getElementById("modalAuxiliar");

  modal.innerHTML = `
    <div class="caixa-modal">
      <h2>${id ? "Editar pessoa" : "Nova pessoa"}</h2>

      <label>Nome</label>
      <input type="text" id="editPessoaNome" value="${item?.nome || ""}" />

      <label>Pode dirigir?</label>
      <select id="editPessoaPodeDirigir">
        <option value="true" ${item?.pode_dirigir ? "selected" : ""}>Sim</option>
        <option value="false" ${item && !item.pode_dirigir ? "selected" : ""}>Não</option>
      </select>

      <div class="acoes-modal">
        <button type="button" id="btnSalvarEditPessoa">${id ? "Salvar alterações" : "Salvar"}</button>
        <button type="button" class="btn-secundario" id="btnFecharAuxiliar">Fechar</button>
      </div>
    </div>
  `;

  modal.classList.remove("oculto");
  document.getElementById("btnFecharAuxiliar").onclick = () => modal.classList.add("oculto");
  document.getElementById("btnSalvarEditPessoa").onclick = async () => {
    const payload = {
      nome: document.getElementById("editPessoaNome").value.trim(),
      pode_dirigir: document.getElementById("editPessoaPodeDirigir").value === "true",
      ativo: true
    };

    if (!payload.nome) {
      alert("Informe o nome da pessoa.");
      return;
    }

    let error;

    if (id) {
      ({ error } = await supabaseClient.from("pessoas").update(payload).eq("id", id));
    } else {
      ({ error } = await supabaseClient.from("pessoas").insert([payload]));
    }

    if (error) {
      console.error(error);
      alert("Erro ao salvar pessoa.");
      return;
    }

    await carregarPessoas();
    renderizarListaCadastros();
    modal.classList.add("oculto");
  };
}

async function excluirVeiculo(id) {
  const confirmar = confirm("Deseja excluir este veículo?");
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from("veiculos")
    .update({ ativo: false })
    .eq("id", id);

  if (error) {
    console.error(error);
    alert("Erro ao excluir veículo.");
    return;
  }

  await carregarVeiculos();
  preencherFiltroVeiculos();
  renderizarListaCadastros();
  atualizarCalendario();
}

async function excluirLocalidade(id) {
  const confirmar = confirm("Deseja excluir esta localidade?");
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from("localidades")
    .update({ ativo: false })
    .eq("id", id);

  if (error) {
    console.error(error);
    alert("Erro ao excluir localidade.");
    return;
  }

  await carregarLocalidades();
  renderizarListaCadastros();
}

async function excluirPessoa(id) {
  const confirmar = confirm("Deseja excluir esta pessoa?");
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from("pessoas")
    .update({ ativo: false })
    .eq("id", id);

  if (error) {
    console.error(error);
    alert("Erro ao excluir pessoa.");
    return;
  }

  await carregarPessoas();
  renderizarListaCadastros();
}