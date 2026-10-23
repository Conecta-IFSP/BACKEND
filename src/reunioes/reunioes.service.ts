import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Comissao,
  ComissaoDocument,
  PapelComissao,
} from '../comissoes/schemas/comissao.schema.js';
import {
  Organizacao,
  OrganizacaoDocument,
  StatusMembroOrganizacao,
  StatusOrganizacao,
} from '../organizacoes/schemas/organizacao.schema.js';
import {
  Usuario,
  UsuarioDocument,
} from '../usuarios/schemas/usuario.schema.js';
import {
  OrigemPresenca,
  RespostaConvite,
  Reuniao,
  ReuniaoDocument,
  SituacaoPresenca,
  SituacaoReuniao,
} from './schemas/reuniao.schema.js';
import { CreateReuniaoDto } from './dto/create-reuniao.dto.js';
import { UpdateReuniaoDto } from './dto/update-reuniao.dto.js';
import { SalvarAtaDto } from './dto/ata.dto.js';
import type { Ata } from './schemas/reuniao.schema.js';

type FiltrosReuniao = { de?: string; ate?: string; comissao_id?: string };

@Injectable()
export class ReunioesService {
  constructor(
    @InjectModel(Reuniao.name)
    private readonly reuniaoModel: Model<ReuniaoDocument>,
    @InjectModel(Comissao.name)
    private readonly comissaoModel: Model<ComissaoDocument>,
    @InjectModel(Organizacao.name)
    private readonly organizacaoModel: Model<OrganizacaoDocument>,
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
  ) {}

  private validarId(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('ID inválido');
  }

  private async validarUsuario(usuarioId: string) {
    this.validarId(usuarioId);
    const usuario = await this.usuarioModel.findById(usuarioId).exec();
    if (!usuario?.ativo)
      throw new ForbiddenException('Usuário sem acesso ativo');
  }

  private lerData(valor: string, mensagem: string) {
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) throw new BadRequestException(mensagem);
    return data;
  }

  private validarHorario(inicio: Date, fim: Date) {
    if (fim <= inicio)
      throw new BadRequestException('O término deve ser depois do início');
    if (fim <= new Date())
      throw new BadRequestException(
        'Não é possível agendar uma reunião que já terminou',
      );
  }

  private async autorizarResponsavel(comissaoId: string, usuarioId: string) {
    this.validarId(comissaoId);
    await this.validarUsuario(usuarioId);
    const comissao = await this.comissaoModel.findById(comissaoId).exec();
    if (!comissao) throw new NotFoundException('Comissão não encontrada');
    const responsavel = comissao.membros.some(
      (membro) =>
        membro.usuario_id.toString() === usuarioId &&
        membro.papel === PapelComissao.RESPONSAVEL,
    );
    if (!responsavel)
      throw new ForbiddenException(
        'Apenas o responsável da comissão pode agendar reuniões',
      );
    if (!comissao.ativo)
      throw new BadRequestException(
        'Reative a comissão antes de agendar reuniões',
      );
    const organizacao = await this.organizacaoModel
      .findById(comissao.organizacao_id)
      .exec();
    const aprovado =
      organizacao?.status === StatusOrganizacao.APROVADA &&
      organizacao.membros.some(
        (membro) =>
          membro.usuario_id.toString() === usuarioId &&
          membro.status === StatusMembroOrganizacao.APROVADO,
      );
    if (!aprovado)
      throw new ForbiddenException('Você não tem acesso a esta organização');
    return comissao;
  }

  private async carregar(id: string, usuarioId: string) {
    this.validarId(id);
    await this.validarUsuario(usuarioId);
    const reuniao = await this.reuniaoModel.findById(id).exec();
    if (!reuniao) throw new NotFoundException('Reunião não encontrada');
    const participante = reuniao.participantes.find(
      (item) => item.usuario_id.toString() === usuarioId,
    );
    if (!participante)
      throw new ForbiddenException('Você não participa desta reunião');
    return {
      reuniao,
      participante,
      dono: reuniao.criada_por.toString() === usuarioId,
    };
  }

  private async carregarComoDono(id: string, usuarioId: string) {
    const carga = await this.carregar(id, usuarioId);
    if (!carga.dono)
      throw new ForbiddenException(
        'Apenas quem agendou a reunião pode fazer isso',
      );
    return carga;
  }

  private exigirAgendada(reuniao: Reuniao) {
    if (reuniao.situacao === SituacaoReuniao.CANCELADA)
      throw new BadRequestException('Esta reunião foi cancelada');
  }

  private popular(reuniao: ReuniaoDocument) {
    return reuniao.populate([
      { path: 'comissao_id', select: 'nome organizacao_id' },
      { path: 'participantes.usuario_id', select: 'nome email' },
    ]);
  }

  private apresentar(reuniao: ReuniaoDocument, usuarioId: string) {
    const dados = (
      typeof reuniao.toObject === 'function' ? reuniao.toObject() : reuniao
    ) as Reuniao & { _id: Types.ObjectId };
    return { ...dados, sou_dono: dados.criada_por.toString() === usuarioId };
  }

  private async responder(
    reuniao: ReuniaoDocument | null,
    usuarioId: string,
    conflito: string,
  ) {
    if (!reuniao) throw new ConflictException(conflito);
    return this.apresentar(await this.popular(reuniao), usuarioId);
  }

  async criar(dto: CreateReuniaoDto, usuarioId: string) {
    const comissao = await this.autorizarResponsavel(
      dto.comissao_id,
      usuarioId,
    );
    const inicio = this.lerData(dto.inicio, 'Informe um início válido');
    const fim = this.lerData(dto.fim, 'Informe um término válido');
    this.validarHorario(inicio, fim);
    // Clientes anteriores sem o campo mantêm o comportamento antigo.
    // Lista vazia significa somente o organizador; não significa convidar todos.
    const escolhidos =
      dto.convidados_ids ??
      comissao.membros.map((m) => m.usuario_id.toString());
    if (
      escolhidos.some(
        (id) => !comissao.membros.some((m) => m.usuario_id.toString() === id),
      )
    ) {
      throw new BadRequestException(
        'Convide apenas integrantes desta comissão',
      );
    }
    const participantesIds = [...new Set([usuarioId, ...escolhidos])];
    const reuniao = await this.reuniaoModel.create({
      comissao_id: comissao._id,
      titulo: dto.titulo,
      local: dto.local,
      inicio,
      fim,
      pauta: dto.pauta ?? '',
      criada_por: new Types.ObjectId(usuarioId),
      situacao: SituacaoReuniao.AGENDADA,
      participantes: participantesIds.map((id) => ({
        usuario_id: new Types.ObjectId(id),
        convite:
          id === usuarioId ? RespostaConvite.ACEITO : RespostaConvite.PENDENTE,
      })),
    });
    return this.apresentar(await this.popular(reuniao), usuarioId);
  }

  async listar(usuarioId: string, filtros: FiltrosReuniao = {}) {
    await this.validarUsuario(usuarioId);
    const consulta: Record<string, unknown> = {
      'participantes.usuario_id': new Types.ObjectId(usuarioId),
    };
    if (filtros.de)
      consulta.fim = { $gte: this.lerData(filtros.de, 'Período inválido') };
    if (filtros.ate)
      consulta.inicio = { $lte: this.lerData(filtros.ate, 'Período inválido') };
    if (filtros.comissao_id) {
      this.validarId(filtros.comissao_id);
      consulta.comissao_id = new Types.ObjectId(filtros.comissao_id);
    }
    const reunioes = await this.reuniaoModel
      .find(consulta)
      .populate('comissao_id', 'nome organizacao_id')
      .populate('participantes.usuario_id', 'nome email')
      .sort({ inicio: 1 })
      .exec();
    return reunioes.map((reuniao) => this.apresentar(reuniao, usuarioId));
  }

  async buscarPorId(id: string, usuarioId: string) {
    const { reuniao } = await this.carregar(id, usuarioId);
    return this.apresentar(await this.popular(reuniao), usuarioId);
  }

  async atualizar(id: string, dto: UpdateReuniaoDto, usuarioId: string) {
    const { reuniao } = await this.carregarComoDono(id, usuarioId);
    this.exigirAgendada(reuniao);
    const agora = new Date();
    if (reuniao.fim <= agora)
      throw new BadRequestException('Esta reunião já terminou');
    const atualizada = await this.reuniaoModel
      .findOneAndUpdate(
        {
          _id: id,
          criada_por: new Types.ObjectId(usuarioId),
          situacao: SituacaoReuniao.AGENDADA,
          fim: { $gt: agora },
        },
        { $set: { situacao: dto.situacao } },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    return this.responder(
      atualizada,
      usuarioId,
      'A reunião mudou. Atualize a tela.',
    );
  }

  async responderConvite(id: string, aceito: boolean, usuarioId: string) {
    const { reuniao, participante, dono } = await this.carregar(id, usuarioId);
    if (dono)
      throw new ForbiddenException(
        'Quem agendou a reunião não responde ao convite',
      );
    this.exigirAgendada(reuniao);
    if (reuniao.fim <= new Date())
      throw new BadRequestException('Esta reunião já terminou');
    if (!aceito && participante.presenca)
      throw new BadRequestException('Você já marcou entrada nesta reunião');
    const atualizada = await this.reuniaoModel
      .findOneAndUpdate(
        {
          _id: id,
          situacao: SituacaoReuniao.AGENDADA,
          participantes: {
            $elemMatch: {
              usuario_id: new Types.ObjectId(usuarioId),
              ...(aceito ? {} : { presenca: { $exists: false } }),
            },
          },
        },
        {
          $set: {
            'participantes.$.convite': aceito
              ? RespostaConvite.ACEITO
              : RespostaConvite.RECUSADO,
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    return this.responder(
      atualizada,
      usuarioId,
      'A reunião mudou. Atualize a tela.',
    );
  }

  async marcarEntrada(id: string, usuarioId: string) {
    const { reuniao, participante, dono } = await this.carregar(id, usuarioId);
    this.exigirAgendada(reuniao);
    const agora = new Date();
    if (agora < reuniao.inicio)
      throw new BadRequestException('A reunião ainda não começou');
    if (agora > reuniao.fim)
      throw new BadRequestException('Esta reunião já terminou');
    if (participante.convite === RespostaConvite.RECUSADO)
      throw new BadRequestException(
        'Aceite o convite antes de marcar a entrada',
      );
    if (participante.presenca)
      throw new ConflictException('Sua entrada já foi registrada');
    const atualizada = await this.reuniaoModel
      .findOneAndUpdate(
        {
          _id: id,
          situacao: SituacaoReuniao.AGENDADA,
          participantes: {
            $elemMatch: {
              usuario_id: new Types.ObjectId(usuarioId),
              convite: { $ne: RespostaConvite.RECUSADO },
              presenca: { $exists: false },
            },
          },
        },
        {
          $set: {
            'participantes.$.presenca': {
              entrada: agora,
              situacao: dono
                ? SituacaoPresenca.CONFIRMADA
                : SituacaoPresenca.AGUARDANDO,
              marcada_por: OrigemPresenca.PROPRIO,
            },
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    return this.responder(
      atualizada,
      usuarioId,
      'Sua entrada já foi registrada',
    );
  }

  async marcarSaida(id: string, usuarioId: string) {
    const { reuniao, participante } = await this.carregar(id, usuarioId);
    this.exigirAgendada(reuniao);
    const presenca = participante.presenca;
    if (!presenca || presenca.situacao === SituacaoPresenca.RECUSADA)
      throw new BadRequestException('Marque a entrada antes da saída');
    if (presenca.saida)
      throw new ConflictException('Sua saída já foi registrada');
    const agora = new Date();
    const atualizada = await this.reuniaoModel
      .findOneAndUpdate(
        {
          _id: id,
          participantes: {
            $elemMatch: {
              usuario_id: new Types.ObjectId(usuarioId),
              'presenca.saida': { $exists: false },
              'presenca.situacao': { $ne: SituacaoPresenca.RECUSADA },
            },
          },
        },
        {
          $set: {
            'participantes.$.presenca.saida':
              agora > reuniao.fim ? reuniao.fim : agora,
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    return this.responder(atualizada, usuarioId, 'Sua saída já foi registrada');
  }

  async atualizarPresenca(
    id: string,
    participanteId: string,
    situacao: SituacaoPresenca.CONFIRMADA | SituacaoPresenca.RECUSADA,
    usuarioId: string,
  ) {
    this.validarId(participanteId);
    const { reuniao } = await this.carregarComoDono(id, usuarioId);
    this.exigirAgendada(reuniao);
    if (new Date() < reuniao.inicio)
      throw new BadRequestException('A reunião ainda não começou');
    const alvo = reuniao.participantes.find(
      (item) => item.usuario_id.toString() === participanteId,
    );
    if (!alvo)
      throw new NotFoundException('Esta pessoa não participa da reunião');
    if (!alvo.presenca && situacao === SituacaoPresenca.RECUSADA)
      throw new BadRequestException('Esta pessoa não marcou entrada');
    const usuarioAlvo = new Types.ObjectId(participanteId);
    const atualizada = await this.reuniaoModel
      .findOneAndUpdate(
        {
          _id: id,
          situacao: SituacaoReuniao.AGENDADA,
          participantes: {
            $elemMatch: {
              usuario_id: usuarioAlvo,
              presenca: { $exists: Boolean(alvo.presenca) },
            },
          },
        },
        alvo.presenca
          ? { $set: { 'participantes.$.presenca.situacao': situacao } }
          : {
              $set: {
                'participantes.$.presenca': {
                  entrada: reuniao.inicio,
                  situacao: SituacaoPresenca.CONFIRMADA,
                  marcada_por: OrigemPresenca.RESPONSAVEL,
                },
              },
            },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    return this.responder(
      atualizada,
      usuarioId,
      'A presença mudou. Atualize a tela.',
    );
  }
  private exigirEncerrada(reuniao: Reuniao) {
    this.exigirAgendada(reuniao);
    if (reuniao.fim > new Date())
      throw new BadRequestException('Aguarde o término da reunião');
  }

  private async gravarAta(
    reuniao: ReuniaoDocument,
    ata: Ata,
    usuarioId: string,
  ) {
    const atualizada = await this.reuniaoModel
      .findOneAndUpdate(
        {
          _id: reuniao._id,
          situacao: SituacaoReuniao.AGENDADA,
          ata: reuniao.ata ?? { $exists: false },
        },
        { $set: { ata } },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    return this.responder(
      atualizada,
      usuarioId,
      'A ata mudou. Atualize antes de continuar.',
    );
  }

  async salvarAta(id: string, dto: SalvarAtaDto, usuarioId: string) {
    const { reuniao } = await this.carregar(id, usuarioId);
    await this.autorizarResponsavel(reuniao.comissao_id.toString(), usuarioId);
    this.exigirEncerrada(reuniao);
    if (reuniao.ata && reuniao.ata.situacao !== 'RASCUNHO') {
      throw new BadRequestException(
        'Uma ata enviada para aprovação não pode ser editada',
      );
    }
    if (dto.versao !== (reuniao.ata?.versao ?? 0))
      throw new ConflictException('Versão da ata desatualizada');
    return this.gravarAta(
      reuniao,
      {
        conteudo: dto.conteudo,
        versao: dto.versao + 1,
        situacao: 'RASCUNHO',
        autor_id: new Types.ObjectId(usuarioId),
        atualizada_em: new Date(),
        aprovadores: [],
        aprovacoes: [],
      },
      usuarioId,
    );
  }

  async publicarAta(id: string, versao: number, usuarioId: string) {
    const { reuniao } = await this.carregar(id, usuarioId);
    await this.autorizarResponsavel(reuniao.comissao_id.toString(), usuarioId);
    this.exigirEncerrada(reuniao);
    const ata = reuniao.ata;
    if (!ata || ata.situacao !== 'RASCUNHO')
      throw new BadRequestException('Salve um rascunho antes de enviar');
    if (ata.versao !== versao)
      throw new ConflictException('Versão da ata desatualizada');
    const aprovadores = reuniao.participantes
      .filter((p) => p.presenca?.situacao === SituacaoPresenca.CONFIRMADA)
      .map((p) => p.usuario_id);
    if (!aprovadores.length)
      throw new BadRequestException(
        'Confirme ao menos uma presença antes de enviar a ata',
      );
    return this.gravarAta(
      reuniao,
      {
        conteudo: ata.conteudo,
        versao: ata.versao,
        autor_id: ata.autor_id,
        situacao: 'EM_APROVACAO',
        atualizada_em: new Date(),
        aprovadores,
        aprovacoes: [],
      },
      usuarioId,
    );
  }

  async aprovarAta(id: string, versao: number, usuarioId: string) {
    const { reuniao } = await this.carregar(id, usuarioId);
    this.exigirEncerrada(reuniao);
    const ata = reuniao.ata;
    if (!ata || ata.versao !== versao)
      throw new ConflictException(
        'Atualize para consultar a versão atual da ata',
      );
    if (!ata.aprovadores.some((id) => id.toString() === usuarioId))
      throw new ForbiddenException(
        'Você não está entre os aprovadores desta ata',
      );
    if (ata.aprovacoes.some((id) => id.toString() === usuarioId))
      return this.buscarPorId(id, usuarioId);
    if (ata.situacao !== 'EM_APROVACAO')
      throw new BadRequestException('A ata não está em aprovação');
    const aprovacoes = [...ata.aprovacoes, new Types.ObjectId(usuarioId)];
    return this.gravarAta(
      reuniao,
      {
        conteudo: ata.conteudo,
        versao: ata.versao,
        autor_id: ata.autor_id,
        situacao:
          aprovacoes.length === ata.aprovadores.length
            ? 'APROVADA'
            : 'EM_APROVACAO',
        atualizada_em: new Date(),
        aprovadores: [...ata.aprovadores],
        aprovacoes,
      },
      usuarioId,
    );
  }

  async gerarListaPresenca(id: string, usuarioId: string) {
    const { reuniao } = await this.carregar(id, usuarioId);
    const pessoas = await this.usuarioModel
      .find({ _id: { $in: reuniao.participantes.map((p) => p.usuario_id) } })
      .select('nome')
      .exec();
    return {
      reuniao_id: reuniao._id,
      titulo: reuniao.titulo,
      inicio: reuniao.inicio,
      fim: reuniao.fim,
      gerada_em: new Date(),
      participantes: reuniao.participantes.map((p) => ({
        usuario_id: p.usuario_id,
        nome:
          pessoas.find((u) => u._id.toString() === p.usuario_id.toString())
            ?.nome ?? 'Usuário indisponível',
        convite: p.convite,
        situacao: p.presenca?.situacao ?? 'SEM_REGISTRO',
        entrada: p.presenca?.entrada ?? null,
        saida: p.presenca?.saida ?? null,
        minutos: p.presenca?.saida
          ? Math.max(
              0,
              Math.floor(
                (p.presenca.saida.getTime() - p.presenca.entrada.getTime()) /
                  60000,
              ),
            )
          : null,
      })),
    };
  }
}
