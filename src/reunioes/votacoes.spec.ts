import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { ReunioesService } from './reunioes.service.js';
import type { ReuniaoDocument } from './schemas/reuniao.schema.js';
import type { ComissaoDocument } from '../comissoes/schemas/comissao.schema.js';
import type { OrganizacaoDocument } from '../organizacoes/schemas/organizacao.schema.js';
import type { UsuarioDocument } from '../usuarios/schemas/usuario.schema.js';

const presidente = new Types.ObjectId();
const membro = new Types.ObjectId();
const ausente = new Types.ObjectId();
const id = new Types.ObjectId();
const votacaoId = new Types.ObjectId();

const consulta = (valor: unknown) => ({
  exec: vi.fn().mockResolvedValue(valor),
  select: vi.fn().mockReturnThis(),
});

function preparar() {
  const agora = Date.now();
  const reuniao: any = {
    _id: id,
    titulo: 'Reunião de planejamento',
    comissao_id: new Types.ObjectId(),
    criada_por: presidente,
    situacao: 'AGENDADA',
    inicio: new Date(agora - 30 * 60000),
    fim: new Date(agora + 30 * 60000),
    participantes: [
      {
        usuario_id: presidente,
        convite: 'ACEITO',
        presenca: { entrada: new Date(agora - 30 * 60000), situacao: 'CONFIRMADA' },
      },
      {
        usuario_id: membro,
        convite: 'ACEITO',
        presenca: { entrada: new Date(agora - 20 * 60000), situacao: 'CONFIRMADA' },
      },
      { usuario_id: ausente, convite: 'ACEITO' },
    ],
    votacoes: [
      {
        _id: votacaoId,
        titulo: 'Aprovar orçamento',
        descricao: '',
        opcoes: ['Sim', 'Não', 'Abstenção'],
        situacao: 'ABERTA',
        aberta_por: presidente,
        aberta_em: new Date(agora - 10 * 60000),
        votos: [{ usuario_id: presidente, opcao: 0, votado_em: new Date() }],
      },
    ],
    populate: vi.fn().mockImplementation(async () => reuniao),
  };
  const reunioes = {
    findById: vi.fn(() => consulta(reuniao)),
    findOneAndUpdate: vi.fn(() => consulta(reuniao)),
  };
  const comissao = {
    ativo: true,
    organizacao_id: new Types.ObjectId(),
    membros: [
      { usuario_id: presidente, papel: 'RESPONSAVEL' },
      { usuario_id: membro, papel: 'MEMBRO' },
    ],
  };
  const comissoes = { findById: vi.fn(() => consulta(comissao)) };
  const organizacoes = { findById: vi.fn(() => consulta(null)) };
  const usuarios = { findById: vi.fn(() => consulta({ ativo: true })) };
  const service = new ReunioesService(
    reunioes as unknown as Model<ReuniaoDocument>,
    comissoes as unknown as Model<ComissaoDocument>,
    organizacoes as unknown as Model<OrganizacaoDocument>,
    usuarios as unknown as Model<UsuarioDocument>,
  );
  return { service, reunioes, reuniao, comissao };
}

const nova = {
  titulo: 'Escolher data do evento',
  opcoes: ['Sábado', 'Domingo'],
};

describe('Votações da reunião', () => {
  it('permite ao responsável abrir uma votação durante a reunião', async () => {
    const { service, reunioes } = preparar();
    await service.abrirVotacao(id.toString(), nova, presidente.toString());
    expect(reunioes.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: id.toString(), situacao: 'AGENDADA' }),
      {
        $push: {
          votacoes: expect.objectContaining({
            titulo: nova.titulo,
            opcoes: nova.opcoes,
            situacao: 'ABERTA',
            votos: [],
          }),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('recusa abertura por quem não é responsável da comissão', async () => {
    const { service } = preparar();
    await expect(
      service.abrirVotacao(id.toString(), nova, membro.toString()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('recusa abertura fora do horário, em reunião cancelada ou com opções repetidas', async () => {
    const { service, reuniao } = preparar();
    await expect(
      service.abrirVotacao(
        id.toString(),
        { titulo: 'Assunto', opcoes: ['Sim', 'sim'] },
        presidente.toString(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    reuniao.inicio = new Date(Date.now() + 60000);
    await expect(
      service.abrirVotacao(id.toString(), nova, presidente.toString()),
    ).rejects.toBeInstanceOf(BadRequestException);
    reuniao.inicio = new Date(Date.now() - 120000);
    reuniao.fim = new Date(Date.now() - 60000);
    await expect(
      service.abrirVotacao(id.toString(), nova, presidente.toString()),
    ).rejects.toBeInstanceOf(BadRequestException);
    reuniao.fim = new Date(Date.now() + 60000);
    reuniao.situacao = 'CANCELADA';
    await expect(
      service.abrirVotacao(id.toString(), nova, presidente.toString()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registra o voto de um participante presente', async () => {
    const { service, reunioes } = preparar();
    await service.votar(
      id.toString(),
      votacaoId.toString(),
      1,
      membro.toString(),
    );
    const [filtro, alteracao, opcoes] = reunioes.findOneAndUpdate.mock
      .calls[0] as unknown as [any, any, any];
    expect(filtro.votacoes.$elemMatch['votos.usuario_id']).toEqual({
      $ne: membro,
    });
    expect(alteracao.$push['votacoes.$[votacao].votos']).toEqual(
      expect.objectContaining({ usuario_id: membro, opcao: 1 }),
    );
    expect(opcoes.arrayFilters).toEqual([{ 'votacao._id': votacaoId }]);
  });

  it('impede voto duplicado, sem presença e após a saída', async () => {
    const { service, reuniao } = preparar();
    await expect(
      service.votar(id.toString(), votacaoId.toString(), 1, presidente.toString()),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.votar(id.toString(), votacaoId.toString(), 1, ausente.toString()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    reuniao.participantes[1].presenca.saida = new Date();
    await expect(
      service.votar(id.toString(), votacaoId.toString(), 1, membro.toString()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    reuniao.participantes[1].presenca = {
      entrada: new Date(),
      situacao: 'RECUSADA',
    };
    await expect(
      service.votar(id.toString(), votacaoId.toString(), 1, membro.toString()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('impede voto em opção inválida, votação inexistente ou encerrada', async () => {
    const { service, reuniao } = preparar();
    await expect(
      service.votar(id.toString(), votacaoId.toString(), 5, membro.toString()),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.votar(
        id.toString(),
        new Types.ObjectId().toString(),
        0,
        membro.toString(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    reuniao.votacoes[0].situacao = 'ENCERRADA';
    await expect(
      service.votar(id.toString(), votacaoId.toString(), 0, membro.toString()),
    ).rejects.toBeInstanceOf(BadRequestException);
    reuniao.votacoes[0].situacao = 'ABERTA';
    reuniao.fim = new Date(Date.now() - 1000);
    await expect(
      service.votar(id.toString(), votacaoId.toString(), 0, membro.toString()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('encerra a votação apenas pelo responsável e uma única vez', async () => {
    const { service, reunioes, reuniao } = preparar();
    await expect(
      service.encerrarVotacao(
        id.toString(),
        votacaoId.toString(),
        membro.toString(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await service.encerrarVotacao(
      id.toString(),
      votacaoId.toString(),
      presidente.toString(),
    );
    expect(reunioes.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        votacoes: {
          $elemMatch: { _id: votacaoId, situacao: 'ABERTA' },
        },
      }),
      {
        $set: {
          'votacoes.$.situacao': 'ENCERRADA',
          'votacoes.$.encerrada_em': expect.any(Date),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
    reuniao.votacoes[0].situacao = 'ENCERRADA';
    await expect(
      service.encerrarVotacao(
        id.toString(),
        votacaoId.toString(),
        presidente.toString(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('esconde votos individuais e só mostra o resultado após o encerramento', async () => {
    const { service, reuniao } = preparar();
    const aberta = (await service.buscarPorId(
      id.toString(),
      presidente.toString(),
    )) as any;
    expect(aberta.votacoes[0]).not.toHaveProperty('votos');
    expect(aberta.votacoes[0]).toMatchObject({
      situacao: 'ABERTA',
      total_votos: 1,
      meu_voto: 0,
      resultado: null,
    });
    reuniao.votacoes[0].votos.push({
      usuario_id: membro,
      opcao: 1,
      votado_em: new Date(),
    });
    reuniao.votacoes[0].situacao = 'ENCERRADA';
    const encerrada = (await service.buscarPorId(
      id.toString(),
      membro.toString(),
    )) as any;
    expect(encerrada.votacoes[0]).toMatchObject({
      situacao: 'ENCERRADA',
      total_votos: 2,
      meu_voto: 1,
      resultado: [1, 1, 0],
    });
  });

  it('considera encerrada a votação aberta quando a reunião termina', async () => {
    const { service, reuniao } = preparar();
    reuniao.fim = new Date(Date.now() - 1000);
    const dados = (await service.buscarPorId(
      id.toString(),
      membro.toString(),
    )) as any;
    expect(dados.votacoes[0]).toMatchObject({
      situacao: 'ENCERRADA',
      meu_voto: null,
      resultado: [1, 0, 0],
    });
  });
});
