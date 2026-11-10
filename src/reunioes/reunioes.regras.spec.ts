import { afterEach, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { type Connection, Model, Types } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReunioesService } from './reunioes.service.js';
import type { ContadorDocument } from './schemas/contador.schema.js';
import {
  OrigemPresenca,
  RespostaConvite,
  ReuniaoDocument,
  SituacaoPresenca,
  SituacaoReuniao,
} from './schemas/reuniao.schema.js';
import { ComissaoDocument, PapelComissao } from '../comissoes/schemas/comissao.schema.js';
import { OrganizacaoDocument } from '../organizacoes/schemas/organizacao.schema.js';
import { UsuarioDocument } from '../usuarios/schemas/usuario.schema.js';
import { CreateReuniaoDto } from './dto/create-reuniao.dto.js';
import { UpdateReuniaoDto } from './dto/update-reuniao.dto.js';

const responsavelId = new Types.ObjectId().toString();
const membroId = new Types.ObjectId().toString();
const externoId = new Types.ObjectId().toString();
const organizacaoId = new Types.ObjectId().toString();
const comissaoId = new Types.ObjectId().toString();
const reuniaoId = new Types.ObjectId().toString();
const AGORA = new Date('2026-10-16T17:30:00.000Z');
const INICIO = new Date('2026-10-16T17:00:00.000Z');
const FIM = new Date('2026-10-16T18:30:00.000Z');

const consulta = (valor: unknown) => {
  const query = {
    exec: vi.fn().mockResolvedValue(valor),
    select: vi.fn(),
    sort: vi.fn(),
    populate: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  query.populate.mockReturnValue(query);
  return query;
};

function documento(dados: Record<string, unknown>) {
  const doc = { ...dados, populate: vi.fn(), toObject: vi.fn(() => dados) };
  doc.populate.mockResolvedValue(doc);
  return doc;
}

type ParticipanteTeste = {
  usuario_id: Types.ObjectId;
  convite: RespostaConvite;
  presenca?: {
    entrada: Date;
    saida?: Date;
    situacao: SituacaoPresenca;
    marcada_por: OrigemPresenca;
  };
};

type Opcoes = {
  papel?: PapelComissao;
  comissaoAtiva?: boolean;
  statusOrganizacao?: string;
  usuarioAtivo?: boolean;
  participantes?: ParticipanteTeste[];
  situacao?: SituacaoReuniao;
  inicio?: Date;
  fim?: Date;
  atualizadoEm?: Date;
};

const membroComEntrada: ParticipanteTeste = {
  usuario_id: new Types.ObjectId(membroId),
  convite: RespostaConvite.ACEITO,
  presenca: {
    entrada: INICIO,
    situacao: SituacaoPresenca.AGUARDANDO,
    marcada_por: OrigemPresenca.PROPRIO,
  },
};

const novaReuniao = {
  comissao_id: comissaoId,
  titulo: 'Fechamento do orçamento',
  local: 'Sala do CA',
  inicio: '2026-10-17T17:00:00.000Z',
  fim: '2026-10-17T18:00:00.000Z',
  pauta: 'Despesas do mês',
};

describe('Regras de reuniões', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AGORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function preparar({
    papel = PapelComissao.RESPONSAVEL,
    comissaoAtiva = true,
    statusOrganizacao = 'APROVADA',
    usuarioAtivo = true,
    participantes,
    situacao = SituacaoReuniao.AGENDADA,
    inicio = INICIO,
    fim = FIM,
    atualizadoEm,
  }: Opcoes = {}) {
    const comissao = {
      _id: new Types.ObjectId(comissaoId),
      organizacao_id: new Types.ObjectId(organizacaoId),
      ativo: comissaoAtiva,
      membros: [
        { usuario_id: new Types.ObjectId(responsavelId), papel },
        { usuario_id: new Types.ObjectId(membroId), papel: PapelComissao.MEMBRO },
      ],
    };
    const organizacao = {
      _id: new Types.ObjectId(organizacaoId),
      status: statusOrganizacao,
      membros: [
        { usuario_id: new Types.ObjectId(responsavelId), papel: 'MEMBRO', status: 'APROVADO' },
        { usuario_id: new Types.ObjectId(membroId), papel: 'MEMBRO', status: 'APROVADO' },
      ],
    };
    const reuniao = documento({
      _id: new Types.ObjectId(reuniaoId),
      comissao_id: new Types.ObjectId(comissaoId),
      titulo: 'Fechamento do orçamento',
      local: 'Sala do CA',
      inicio,
      fim,
      pauta: 'Despesas do mês',
      criada_por: new Types.ObjectId(responsavelId),
      situacao,
      ...(atualizadoEm ? { atualizado_em: atualizadoEm } : {}),
      participantes: participantes ?? [
        { usuario_id: new Types.ObjectId(responsavelId), convite: RespostaConvite.ACEITO },
        { usuario_id: new Types.ObjectId(membroId), convite: RespostaConvite.PENDENTE },
      ],
    });
    const reunioes = {
      create: vi.fn(async (dados: Record<string, unknown>) => documento(dados)),
      find: vi.fn(() => consulta([reuniao])),
      findById: vi.fn(() => consulta(reuniao)),
      findOneAndUpdate: vi.fn(() => consulta(reuniao)),
    };
    const comissoes = { findById: vi.fn(() => consulta(comissao)) };
    const organizacoes = { findById: vi.fn(() => consulta(organizacao)) };
    const usuarios = { findById: vi.fn(() => consulta({ ativo: usuarioAtivo })) };
    const service = new ReunioesService(
      reunioes as unknown as Model<ReuniaoDocument>,
      comissoes as unknown as Model<ComissaoDocument>,
      organizacoes as unknown as Model<OrganizacaoDocument>,
      usuarios as unknown as Model<UsuarioDocument>,
      {} as Connection,
      {} as Model<ContadorDocument>,
    );
    return { service, reunioes };
  }

  it('agenda e convida toda a comissão, com o responsável já aceito', async () => {
    const { service, reunioes } = preparar();
    const resultado = await service.criar(novaReuniao, responsavelId);
    expect(reunioes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        local: 'Sala do CA',
        situacao: SituacaoReuniao.AGENDADA,
        criada_por: new Types.ObjectId(responsavelId),
        participantes: [
          { usuario_id: new Types.ObjectId(responsavelId), convite: RespostaConvite.ACEITO },
          { usuario_id: new Types.ObjectId(membroId), convite: RespostaConvite.PENDENTE },
        ],
      }),
    );
    expect(resultado.sou_dono).toBe(true);
  });

  it('agenda sem local e grava o local vazio', async () => {
    const { service, reunioes } = preparar();
    const { local: _local, ...semLocal } = novaReuniao;
    await service.criar(semLocal, responsavelId);
    expect(reunioes.create).toHaveBeenCalledWith(
      expect.objectContaining({ local: '', dia_inteiro: false }),
    );
  });

  it('agenda reunião de dia inteiro com o início e o fim enviados pelo app', async () => {
    const { service, reunioes } = preparar();
    // 17/10 das 00:00:00.000 às 23:59:59.999 em Brasília (UTC-3).
    await service.criar(
      {
        ...novaReuniao,
        inicio: '2026-10-17T03:00:00.000Z',
        fim: '2026-10-18T02:59:59.999Z',
        dia_inteiro: true,
      },
      responsavelId,
    );
    expect(reunioes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        dia_inteiro: true,
        inicio: new Date('2026-10-17T03:00:00.000Z'),
        fim: new Date('2026-10-18T02:59:59.999Z'),
      }),
    );
  });

  it('lista vazia convida somente o organizador, sem incluir toda a comissão', async () => {
    const { service, reunioes } = preparar();
    await service.criar({ ...novaReuniao, convidados_ids: [] }, responsavelId);
    expect(reunioes.create).toHaveBeenCalledWith(expect.objectContaining({ participantes: [
      { usuario_id: new Types.ObjectId(responsavelId), convite: RespostaConvite.ACEITO },
    ] }));
  });

  it('seleciona convidados e mantém organizador único mesmo se enviado explicitamente', async () => {
    const { service, reunioes } = preparar();
    await service.criar({ ...novaReuniao, convidados_ids: [membroId, responsavelId] }, responsavelId);
    const dados = reunioes.create.mock.calls[0][0] as { participantes: { usuario_id: Types.ObjectId }[] };
    expect(dados.participantes.map((p) => p.usuario_id.toString())).toEqual([responsavelId, membroId]);
  });

  it('rejeita pessoa de fora da comissão sem gravar reunião', async () => {
    const { service, reunioes } = preparar();
    await expect(service.criar({ ...novaReuniao, convidados_ids: [externoId] }, responsavelId)).rejects.toBeInstanceOf(BadRequestException);
    expect(reunioes.create).not.toHaveBeenCalled();
  });

  it('valida lista de convidados: não aceita null, IDs inválidos nem duplicados', async () => {
    for (const convidados_ids of [null, ['invalido'], [membroId, membroId], membroId]) {
      const erros = await validate(plainToInstance(CreateReuniaoDto, { ...novaReuniao, convidados_ids }));
      expect(erros.some((e) => e.property === 'convidados_ids')).toBe(true);
    }
    expect(await validate(plainToInstance(CreateReuniaoDto, { ...novaReuniao, convidados_ids: [] }))).toHaveLength(0);
  });

  it.each([
    ['membro comum', { papel: PapelComissao.MEMBRO }, ForbiddenException],
    ['comissão inativa', { comissaoAtiva: false }, BadRequestException],
    ['organização revogada', { statusOrganizacao: 'REVOGADA' }, ForbiddenException],
    ['conta desativada', { usuarioAtivo: false }, ForbiddenException],
  ])('não deixa agendar: %s', async (_, opcoes, erro) => {
    const { service, reunioes } = preparar(opcoes);
    await expect(service.criar(novaReuniao, responsavelId)).rejects.toBeInstanceOf(erro);
    expect(reunioes.create).not.toHaveBeenCalled();
  });

  it('recusa término antes do início e reunião que já terminou', async () => {
    const { service, reunioes } = preparar();
    await expect(
      service.criar({ ...novaReuniao, fim: '2026-10-17T16:00:00.000Z' }, responsavelId),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.criar(
        { ...novaReuniao, inicio: '2026-10-15T10:00:00.000Z', fim: '2026-10-15T11:00:00.000Z' },
        responsavelId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(reunioes.create).not.toHaveBeenCalled();
  });

  it('lista só as reuniões em que o usuário participa, no período pedido', async () => {
    const { service, reunioes } = preparar();
    await service.listar(membroId, {
      de: '2026-10-01T00:00:00.000Z',
      ate: '2026-10-31T23:59:59.000Z',
      comissao_id: comissaoId,
    });
    expect(reunioes.find).toHaveBeenCalledWith({
      'participantes.usuario_id': new Types.ObjectId(membroId),
      fim: { $gte: new Date('2026-10-01T00:00:00.000Z') },
      inicio: { $lte: new Date('2026-10-31T23:59:59.000Z') },
      comissao_id: new Types.ObjectId(comissaoId),
    });
  });

  it('bloqueia quem não participa da reunião', async () => {
    const { service } = preparar();
    await expect(service.buscarPorId(reuniaoId, externoId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('só quem agendou cancela, e só antes do término', async () => {
    const { service, reunioes } = preparar();
    await expect(
      service.atualizar(reuniaoId, { situacao: SituacaoReuniao.CANCELADA }, membroId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await service.atualizar(reuniaoId, { situacao: SituacaoReuniao.CANCELADA }, responsavelId);
    expect(reunioes.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ situacao: SituacaoReuniao.AGENDADA, fim: { $gt: AGORA } }),
      { $set: { situacao: SituacaoReuniao.CANCELADA } },
      expect.anything(),
    );
    vi.setSystemTime(new Date('2026-10-16T19:00:00.000Z'));
    const encerrada = preparar();
    await expect(
      encerrada.service.atualizar(reuniaoId, { situacao: SituacaoReuniao.CANCELADA }, responsavelId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(encerrada.reunioes.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('a alteração aceita o cancelamento ou os campos da reunião, com as regras da criação', async () => {
    const campos = (dados: Record<string, unknown>) =>
      validate(plainToInstance(UpdateReuniaoDto, dados)).then((erros) => erros.map((erro) => erro.property));
    expect(await campos({ situacao: SituacaoReuniao.CANCELADA })).toEqual([]);
    expect(await campos({ titulo: 'Outro título', inicio: '2026-10-17T10:00:00.000Z', local: '' })).toEqual([]);
    expect(await campos({ situacao: SituacaoReuniao.AGENDADA })).toEqual(['situacao']);
    expect(await campos({ titulo: 'a', local: 'A', inicio: '17/10', convidados_ids: ['x'] })).toEqual(
      expect.arrayContaining(['titulo', 'local', 'inicio', 'convidados_ids']),
    );
  });

  describe('edição', () => {
    // Reunião de amanhã, ainda não começou.
    const AMANHA_INICIO = new Date('2026-10-17T17:00:00.000Z');
    const AMANHA_FIM = new Date('2026-10-17T18:00:00.000Z');
    const aceitos = (): ParticipanteTeste[] => [
      { usuario_id: new Types.ObjectId(responsavelId), convite: RespostaConvite.ACEITO },
      { usuario_id: new Types.ObjectId(membroId), convite: RespostaConvite.ACEITO },
    ];
    const gravado = (reunioes: { findOneAndUpdate: ReturnType<typeof vi.fn> }) =>
      reunioes.findOneAndUpdate.mock.calls[0][1].$set;

    it('recusa cancelar e editar juntos, pedido vazio e quem não agendou', async () => {
      const { service } = preparar({ inicio: AMANHA_INICIO, fim: AMANHA_FIM });
      await expect(
        service.atualizar(reuniaoId, { situacao: SituacaoReuniao.CANCELADA, titulo: 'Outro' }, responsavelId),
      ).rejects.toThrow('Cancele ou edite a reunião, não as duas coisas juntas');
      await expect(service.atualizar(reuniaoId, {}, responsavelId)).rejects.toThrow('Nada para alterar');
      await expect(service.atualizar(reuniaoId, { titulo: 'Outro' }, membroId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('trocar só o título mantém as respostas dos convidados', async () => {
      const { service, reunioes } = preparar({ inicio: AMANHA_INICIO, fim: AMANHA_FIM, participantes: aceitos() });
      await service.atualizar(reuniaoId, { titulo: 'Novo título' }, responsavelId);
      const set = gravado(reunioes);
      expect(set.titulo).toBe('Novo título');
      expect(set.participantes.map((p: ParticipanteTeste) => p.convite)).toEqual([
        RespostaConvite.ACEITO,
        RespostaConvite.ACEITO,
      ]);
      expect(set.horario_alterado_em).toBeUndefined();
    });

    it('mudar o horário volta as respostas para pendente, menos a de quem agendou', async () => {
      const { service, reunioes } = preparar({ inicio: AMANHA_INICIO, fim: AMANHA_FIM, participantes: aceitos() });
      await service.atualizar(
        reuniaoId,
        { inicio: '2026-10-17T18:00:00.000Z', fim: '2026-10-17T19:00:00.000Z' },
        responsavelId,
      );
      const set = gravado(reunioes);
      expect(set.participantes.map((p: ParticipanteTeste) => p.convite)).toEqual([
        RespostaConvite.ACEITO,
        RespostaConvite.PENDENTE,
      ]);
      expect(set.horario_alterado_em).toEqual(AGORA);
    });

    it('trava data e horário quando a reunião já começou, mas aceita outros campos', async () => {
      const { service, reunioes } = preparar();
      await expect(
        service.atualizar(reuniaoId, { fim: '2026-10-16T19:00:00.000Z' }, responsavelId),
      ).rejects.toThrow('A reunião já começou; a data e o horário não podem mudar');
      await service.atualizar(reuniaoId, { local: 'Auditório' }, responsavelId);
      expect(gravado(reunioes).local).toBe('Auditório');
    });

    it('não edita reunião cancelada ou encerrada', async () => {
      const cancelada = preparar({ situacao: SituacaoReuniao.CANCELADA, inicio: AMANHA_INICIO, fim: AMANHA_FIM });
      await expect(cancelada.service.atualizar(reuniaoId, { titulo: 'Outro' }, responsavelId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      const encerrada = preparar({ inicio: new Date('2026-10-16T10:00:00.000Z'), fim: new Date('2026-10-16T11:00:00.000Z') });
      await expect(encerrada.service.atualizar(reuniaoId, { titulo: 'Outro' }, responsavelId)).rejects.toThrow(
        'Esta reunião já terminou',
      );
    });

    it('adiciona convidados como pendentes, remove quem saiu da lista e mantém quem agendou', async () => {
      const soDono = preparar({
        inicio: AMANHA_INICIO,
        fim: AMANHA_FIM,
        participantes: [{ usuario_id: new Types.ObjectId(responsavelId), convite: RespostaConvite.ACEITO }],
      });
      await soDono.service.atualizar(reuniaoId, { convidados_ids: [membroId] }, responsavelId);
      expect(gravado(soDono.reunioes).participantes).toEqual([
        { usuario_id: new Types.ObjectId(responsavelId), convite: RespostaConvite.ACEITO },
        { usuario_id: new Types.ObjectId(membroId), convite: RespostaConvite.PENDENTE },
      ]);

      const comMembro = preparar({ inicio: AMANHA_INICIO, fim: AMANHA_FIM, participantes: aceitos() });
      await comMembro.service.atualizar(reuniaoId, { convidados_ids: [] }, responsavelId);
      expect(gravado(comMembro.reunioes).participantes).toEqual([
        { usuario_id: new Types.ObjectId(responsavelId), convite: RespostaConvite.ACEITO },
      ]);

      await expect(
        comMembro.service.atualizar(reuniaoId, { convidados_ids: [externoId] }, responsavelId),
      ).rejects.toThrow('Convide apenas integrantes desta comissão');
    });

    it('só grava se a reunião não mudou desde a leitura', async () => {
      const lidoEm = new Date('2026-10-16T17:20:00.000Z');
      const { service, reunioes } = preparar({ inicio: AMANHA_INICIO, fim: AMANHA_FIM, atualizadoEm: lidoEm });
      reunioes.findOneAndUpdate.mockReturnValueOnce(consulta(null));
      await expect(service.atualizar(reuniaoId, { titulo: 'Outro' }, responsavelId)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect((reunioes.findOneAndUpdate.mock.calls[0] as unknown[])[0]).toEqual(
        expect.objectContaining({ atualizado_em: lidoEm }),
      );
    });
  });

  it('o convidado aceita ou recusa, exceto o organizador, quem já entrou e em reunião cancelada', async () => {
    const { service, reunioes } = preparar();
    await service.responderConvite(reuniaoId, false, membroId);
    expect(reunioes.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        participantes: {
          $elemMatch: { usuario_id: new Types.ObjectId(membroId), presenca: { $exists: false } },
        },
      }),
      { $set: { 'participantes.$.convite': RespostaConvite.RECUSADO } },
      expect.anything(),
    );
    await expect(service.responderConvite(reuniaoId, false, responsavelId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const comEntrada = preparar({
      participantes: [
        { usuario_id: new Types.ObjectId(responsavelId), convite: RespostaConvite.ACEITO },
        membroComEntrada,
      ],
    });
    await expect(comEntrada.service.responderConvite(reuniaoId, false, membroId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const cancelada = preparar({ situacao: SituacaoReuniao.CANCELADA });
    await expect(cancelada.service.responderConvite(reuniaoId, true, membroId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('a entrada do membro aguarda confirmação e a do responsável já vem confirmada', async () => {
    const { service, reunioes } = preparar();
    await service.marcarEntrada(reuniaoId, membroId);
    expect(reunioes.findOneAndUpdate).toHaveBeenLastCalledWith(
      expect.anything(),
      {
        $set: {
          'participantes.$.presenca': {
            entrada: AGORA,
            situacao: SituacaoPresenca.AGUARDANDO,
            marcada_por: OrigemPresenca.PROPRIO,
          },
        },
      },
      expect.anything(),
    );
    await service.marcarEntrada(reuniaoId, responsavelId);
    expect(reunioes.findOneAndUpdate).toHaveBeenLastCalledWith(
      expect.anything(),
      {
        $set: {
          'participantes.$.presenca': expect.objectContaining({
            situacao: SituacaoPresenca.CONFIRMADA,
          }),
        },
      },
      expect.anything(),
    );
  });

  it('quem recusou o convite não marca entrada', async () => {
    const { service, reunioes } = preparar({
      participantes: [
        { usuario_id: new Types.ObjectId(responsavelId), convite: RespostaConvite.ACEITO },
        { usuario_id: new Types.ObjectId(membroId), convite: RespostaConvite.RECUSADO },
      ],
    });
    await expect(service.marcarEntrada(reuniaoId, membroId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(reunioes.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('a entrada vale do início ao término, sem antecedência', async () => {
    const { service } = preparar();
    vi.setSystemTime(new Date('2026-10-16T16:50:00.000Z'));
    await expect(service.marcarEntrada(reuniaoId, membroId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    vi.setSystemTime(INICIO);
    await expect(service.marcarEntrada(reuniaoId, membroId)).resolves.toBeDefined();
    vi.setSystemTime(new Date('2026-10-16T18:31:00.000Z'));
    await expect(service.marcarEntrada(reuniaoId, membroId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    vi.setSystemTime(AGORA);
    const cancelada = preparar({ situacao: SituacaoReuniao.CANCELADA });
    await expect(cancelada.service.marcarEntrada(reuniaoId, membroId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('não registra a entrada duas vezes', async () => {
    const { service, reunioes } = preparar({
      participantes: [
        { usuario_id: new Types.ObjectId(responsavelId), convite: RespostaConvite.ACEITO },
        membroComEntrada,
      ],
    });
    await expect(service.marcarEntrada(reuniaoId, membroId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(reunioes.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('a saída exige entrada e não passa do término', async () => {
    const semEntrada = preparar();
    await expect(semEntrada.service.marcarSaida(reuniaoId, membroId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const comEntrada = preparar({
      participantes: [
        { usuario_id: new Types.ObjectId(responsavelId), convite: RespostaConvite.ACEITO },
        membroComEntrada,
      ],
    });
    vi.setSystemTime(new Date('2026-10-16T19:00:00.000Z'));
    await comEntrada.service.marcarSaida(reuniaoId, membroId);
    expect(comEntrada.reunioes.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { $set: { 'participantes.$.presenca.saida': FIM } },
      expect.anything(),
    );
  });

  it('só quem agendou marca presente quem não registrou entrada, depois do início', async () => {
    const { service, reunioes } = preparar();
    await expect(
      service.atualizarPresenca(reuniaoId, membroId, SituacaoPresenca.CONFIRMADA, membroId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    vi.setSystemTime(new Date('2026-10-16T16:50:00.000Z'));
    await expect(
      service.atualizarPresenca(reuniaoId, membroId, SituacaoPresenca.CONFIRMADA, responsavelId),
    ).rejects.toBeInstanceOf(BadRequestException);
    vi.setSystemTime(AGORA);
    await expect(
      service.atualizarPresenca(reuniaoId, membroId, SituacaoPresenca.RECUSADA, responsavelId),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.atualizarPresenca(reuniaoId, membroId, SituacaoPresenca.CONFIRMADA, responsavelId);
    expect(reunioes.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      {
        $set: {
          'participantes.$.presenca': {
            entrada: INICIO,
            situacao: SituacaoPresenca.CONFIRMADA,
            marcada_por: OrigemPresenca.RESPONSAVEL,
          },
        },
      },
      expect.anything(),
    );
  });

  it('quem agendou confirma a entrada que estava aguardando', async () => {
    const { service, reunioes } = preparar({
      participantes: [
        { usuario_id: new Types.ObjectId(responsavelId), convite: RespostaConvite.ACEITO },
        membroComEntrada,
      ],
    });
    await service.atualizarPresenca(reuniaoId, membroId, SituacaoPresenca.CONFIRMADA, responsavelId);
    expect(reunioes.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { $set: { 'participantes.$.presenca.situacao': SituacaoPresenca.CONFIRMADA } },
      expect.anything(),
    );
  });

  it('valida os campos da nova reunião', async () => {
    const dto = plainToInstance(CreateReuniaoDto, {
      comissao_id: 'x',
      titulo: ' a ',
      local: ' ',
      inicio: '16/10',
      fim: '',
      pauta: '  Despesas do mês\nPróximos passos  ',
    });
    const campos = (await validate(dto)).map((erro) => erro.property);
    expect(campos).toEqual(
      expect.arrayContaining(['comissao_id', 'titulo', 'inicio', 'fim']),
    );
    expect(campos).not.toContain('local');
    expect(campos).not.toContain('pauta');
    expect(dto.local).toBe('');
    expect(dto.pauta).toBe('Despesas do mês\nPróximos passos');
  });

  it('local é opcional, mas quando informado precisa de 2 a 120 caracteres', async () => {
    const base = {
      comissao_id: comissaoId,
      titulo: 'Reunião',
      inicio: '2026-10-17T15:00:00.000Z',
      fim: '2026-10-17T16:00:00.000Z',
    };
    const camposCom = async (extra: Record<string, unknown>) =>
      (await validate(plainToInstance(CreateReuniaoDto, { ...base, ...extra }))).map(
        (erro) => erro.property,
      );
    expect(await camposCom({})).not.toContain('local');
    expect(await camposCom({ local: 'Sala 2' })).not.toContain('local');
    expect(await camposCom({ local: 'A' })).toContain('local');
    expect(await camposCom({ local: 'x'.repeat(121) })).toContain('local');
  });

  it('dia_inteiro é opcional e precisa ser booleano', async () => {
    const base = {
      comissao_id: comissaoId,
      titulo: 'Reunião',
      inicio: '2026-10-17T03:00:00.000Z',
      fim: '2026-10-18T02:59:59.999Z',
    };
    const camposCom = async (extra: Record<string, unknown>) =>
      (await validate(plainToInstance(CreateReuniaoDto, { ...base, ...extra }))).map(
        (erro) => erro.property,
      );
    expect(await camposCom({})).not.toContain('dia_inteiro');
    expect(await camposCom({ dia_inteiro: true })).not.toContain('dia_inteiro');
    expect(await camposCom({ dia_inteiro: 'sim' })).toContain('dia_inteiro');
  });

  it('recusa pauta em lista ou maior que 2000 caracteres', async () => {
    const base = {
      comissao_id: comissaoId,
      titulo: 'Reunião',
      local: 'Sala',
      inicio: '2026-10-17T15:00:00.000Z',
      fim: '2026-10-17T16:00:00.000Z',
    };
    for (const pauta of [['Item'], 'x'.repeat(2001)]) {
      const campos = (await validate(plainToInstance(CreateReuniaoDto, { ...base, pauta }))).map((erro) => erro.property);
      expect(campos).toEqual(['pauta']);
    }
  });
});
