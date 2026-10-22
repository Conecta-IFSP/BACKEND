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

  private async responder(reuniao: ReuniaoDocument | null, usuarioId: string, conflito: string) {
    if (!reuniao) throw new ConflictException(conflito);
    return this.apresentar(await this.popular(reuniao), usuarioId);
  }

  async criar(dto: CreateReuniaoDto, usuarioId: string) {
    const comissao = await this.autorizarResponsavel(dto.comissao_id, usuarioId);
    const inicio = this.lerData(dto.inicio, 'Informe um início válido');
    const fim = this.lerData(dto.fim, 'Informe um término válido');
    this.validarHorario(inicio, fim);
    const reuniao = await this.reuniaoModel.create({
      comissao_id: comissao._id,
      titulo: dto.titulo,
      local: dto.local,
      inicio,
      fim,
      pauta: dto.pauta ?? '',
      criada_por: new Types.ObjectId(usuarioId),
      situacao: SituacaoReuniao.AGENDADA,
      participantes: comissao.membros.map((membro) => ({
        usuario_id: membro.usuario_id,
        convite:
          membro.usuario_id.toString() === usuarioId
            ? RespostaConvite.ACEITO
            : RespostaConvite.PENDENTE,
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
    const dados: Record<string, unknown> = {};
    if (dto.titulo !== undefined) dados.titulo = dto.titulo;
    if (dto.local !== undefined) dados.local = dto.local;
    if (dto.pauta !== undefined) dados.pauta = dto.pauta;
    if (dto.situacao !== undefined) dados.situacao = dto.situacao;
    if (dto.inicio !== undefined || dto.fim !== undefined) {
      const inicio =
        dto.inicio !== undefined
          ? this.lerData(dto.inicio, 'Informe um início válido')
          : reuniao.inicio;
      const fim =
        dto.fim !== undefined
          ? this.lerData(dto.fim, 'Informe um término válido')
          : reuniao.fim;
      this.validarHorario(inicio, fim);
      dados.inicio = inicio;
      dados.fim = fim;
    }
    const atualizada = await this.reuniaoModel
      .findOneAndUpdate(
        {
          _id: id,
          criada_por: new Types.ObjectId(usuarioId),
          situacao: SituacaoReuniao.AGENDADA,
        },
        { $set: dados },
        { new: true, runValidators: true },
      )
      .exec();
    return this.responder(atualizada, usuarioId, 'A reunião mudou. Atualize a tela.');
  }

  async responderConvite(id: string, aceito: boolean, usuarioId: string) {
    const { reuniao } = await this.carregar(id, usuarioId);
    this.exigirAgendada(reuniao);
    if (reuniao.fim <= new Date())
      throw new BadRequestException('Esta reunião já terminou');
    const atualizada = await this.reuniaoModel
      .findOneAndUpdate(
        {
          _id: id,
          situacao: SituacaoReuniao.AGENDADA,
          'participantes.usuario_id': new Types.ObjectId(usuarioId),
        },
        {
          $set: {
            'participantes.$.convite': aceito
              ? RespostaConvite.ACEITO
              : RespostaConvite.RECUSADO,
          },
        },
        { new: true, runValidators: true },
      )
      .exec();
    return this.responder(atualizada, usuarioId, 'A reunião mudou. Atualize a tela.');
  }

  async marcarEntrada(id: string, usuarioId: string) {
    const { reuniao, participante, dono } = await this.carregar(id, usuarioId);
    this.exigirAgendada(reuniao);
    const agora = new Date();
    if (agora < reuniao.inicio)
      throw new BadRequestException('A reunião ainda não começou');
    if (agora > reuniao.fim)
      throw new BadRequestException('Esta reunião já terminou');
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
        { new: true, runValidators: true },
      )
      .exec();
    return this.responder(atualizada, usuarioId, 'Sua entrada já foi registrada');
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
        { new: true, runValidators: true },
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
        { new: true, runValidators: true },
      )
      .exec();
    return this.responder(atualizada, usuarioId, 'A presença mudou. Atualize a tela.');
  }
}
