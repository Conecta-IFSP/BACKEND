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
} from './schemas/comissao.schema.js';
import {
  Organizacao,
  OrganizacaoDocument,
  PapelOrganizacao,
  StatusMembroOrganizacao,
  StatusOrganizacao,
} from '../organizacoes/schemas/organizacao.schema.js';
import {
  Usuario,
  UsuarioDocument,
} from '../usuarios/schemas/usuario.schema.js';
import { CreateComissaoDto } from './dto/create-comissao.dto.js';
import { UpdateComissaoDto } from './dto/update-comissao.dto.js';
import { AddMembroComissaoDto } from './dto/add-membro-comissao.dto.js';

@Injectable()
export class ComissoesService {
  constructor(
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

  private administra(
    organizacao: Pick<Organizacao, 'membros'>,
    usuarioId: string,
  ) {
    return organizacao.membros.some(
      (membro) =>
        membro.usuario_id.toString() === usuarioId &&
        membro.papel === PapelOrganizacao.ADMIN &&
        membro.status === StatusMembroOrganizacao.APROVADO,
    );
  }

  private async autorizarOrganizacao(organizacaoId: string, usuarioId: string) {
    this.validarId(organizacaoId);
    await this.validarUsuario(usuarioId);
    const organizacao = await this.organizacaoModel
      .findById(organizacaoId)
      .exec();
    if (!organizacao) throw new NotFoundException('Organização não encontrada');
    if (
      !this.administra(organizacao, usuarioId) ||
      organizacao.status !== StatusOrganizacao.APROVADA
    ) {
      throw new ForbiddenException(
        'Apenas administradores da organização podem gerenciar comissões',
      );
    }
    return organizacao;
  }

  private async autorizarLeitura(organizacaoId: string, usuarioId: string) {
    this.validarId(organizacaoId);
    await this.validarUsuario(usuarioId);
    const organizacao = await this.organizacaoModel
      .findById(organizacaoId)
      .exec();
    if (!organizacao) throw new NotFoundException('Organização não encontrada');
    const aprovado = organizacao.membros.some(
      (membro) =>
        membro.usuario_id.toString() === usuarioId &&
        membro.status === StatusMembroOrganizacao.APROVADO,
    );
    if (!aprovado || organizacao.status !== StatusOrganizacao.APROVADA) {
      throw new ForbiddenException(
        'Você não tem acesso às comissões desta organização',
      );
    }
    return organizacao;
  }

  private async autorizarComissao(id: string, usuarioId: string) {
    this.validarId(id);
    const comissao = await this.comissaoModel.findById(id).exec();
    if (!comissao) throw new NotFoundException('Comissão não encontrada');
    await this.autorizarOrganizacao(
      comissao.organizacao_id.toString(),
      usuarioId,
    );
    return comissao;
  }

  private popular(comissao: ComissaoDocument) {
    return comissao.populate([
      { path: 'organizacao_id', select: 'nome status' },
      { path: 'membros.usuario_id', select: 'nome email ativo' },
    ]);
  }

  async listarOrganizacoes(usuarioId: string) {
    await this.validarUsuario(usuarioId);
    return this.organizacaoModel
      .find({
        status: StatusOrganizacao.APROVADA,
        membros: {
          $elemMatch: {
            usuario_id: new Types.ObjectId(usuarioId),
            papel: PapelOrganizacao.ADMIN,
            status: StatusMembroOrganizacao.APROVADO,
          },
        },
      })
      .select('nome')
      .sort({ nome: 1 })
      .exec();
  }

  async listarMinhas(organizacaoId: string, usuarioId: string) {
    this.validarId(organizacaoId);
    await this.validarUsuario(usuarioId);
    const organizacao = await this.organizacaoModel
      .findById(organizacaoId)
      .exec();
    if (!organizacao) throw new NotFoundException('Organização não encontrada');
    const membro = organizacao.membros.some(
      (item) =>
        item.usuario_id.toString() === usuarioId &&
        item.status === StatusMembroOrganizacao.APROVADO,
    );
    if (!membro || organizacao.status !== StatusOrganizacao.APROVADA) {
      throw new ForbiddenException(
        'Você precisa ser membro aprovado de uma organização autorizada',
      );
    }
    const comissoes = await this.comissaoModel
      .find({
        organizacao_id: organizacao._id,
        'membros.usuario_id': new Types.ObjectId(usuarioId),
      })
      .select('nome descricao ativo membros')
      .sort({ nome: 1 })
      .exec();
    return {
      organizacao: { _id: organizacao._id, nome: organizacao.nome },
      comissoes: comissoes.map((comissao) => ({
        _id: comissao._id,
        nome: comissao.nome,
        descricao: comissao.descricao,
        ativo: comissao.ativo,
        meu_papel: comissao.membros.find(
          (item) => item.usuario_id.toString() === usuarioId,
        )?.papel,
      })),
    };
  }

  async listarMembrosDisponiveis(organizacaoId: string, usuarioId: string) {
    const organizacao = await this.autorizarOrganizacao(
      organizacaoId,
      usuarioId,
    );
    const ids = organizacao.membros
      .filter((membro) => membro.status === StatusMembroOrganizacao.APROVADO)
      .map((membro) => membro.usuario_id);
    return this.usuarioModel
      .find({ _id: { $in: ids }, ativo: true })
      .select('nome email')
      .sort({ nome: 1 })
      .exec();
  }

  async criar(dto: CreateComissaoDto, usuarioId: string) {
    await this.autorizarOrganizacao(dto.organizacao_id, usuarioId);
    await this.exigirElegivel(
      dto.organizacao_id,
      dto.responsavel_id,
      usuarioId,
    );
    const comissao = await this.comissaoModel.create({
      nome: dto.nome,
      descricao: dto.descricao,
      organizacao_id: new Types.ObjectId(dto.organizacao_id),
      membros: [
        {
          usuario_id: new Types.ObjectId(dto.responsavel_id),
          papel: PapelComissao.RESPONSAVEL,
          adicionado_em: new Date(),
        },
      ],
      ativo: true,
    });
    return this.popular(comissao);
  }

  async listar(usuarioId: string, organizacaoId?: string) {
    if (organizacaoId !== undefined) {
      const organizacao = await this.autorizarLeitura(organizacaoId, usuarioId);
      return this.consultar(
        this.administra(organizacao, usuarioId)
          ? { organizacao_id: organizacao._id }
          : {
              organizacao_id: organizacao._id,
              'membros.usuario_id': new Types.ObjectId(usuarioId),
            },
      );
    }

    await this.validarUsuario(usuarioId);
    const meuId = new Types.ObjectId(usuarioId);
    const organizacoes = await this.organizacaoModel
      .find({
        status: StatusOrganizacao.APROVADA,
        membros: {
          $elemMatch: {
            usuario_id: meuId,
            status: StatusMembroOrganizacao.APROVADO,
          },
        },
      })
      .select('membros')
      .exec();
    const administradas = organizacoes
      .filter((organizacao) => this.administra(organizacao, usuarioId))
      .map((organizacao) => organizacao._id);
    const participa = organizacoes
      .filter((organizacao) => !this.administra(organizacao, usuarioId))
      .map((organizacao) => organizacao._id);
    return this.consultar({
      $or: [
        { organizacao_id: { $in: administradas } },
        { organizacao_id: { $in: participa }, 'membros.usuario_id': meuId },
      ],
    });
  }

  async buscarPorId(id: string, usuarioId: string) {
    this.validarId(id);
    const comissao = await this.comissaoModel.findById(id).exec();
    if (!comissao) throw new NotFoundException('Comissão não encontrada');
    const organizacao = await this.autorizarLeitura(
      comissao.organizacao_id.toString(),
      usuarioId,
    );
    const naEquipe = comissao.membros.some(
      (membro) => membro.usuario_id.toString() === usuarioId,
    );
    if (!this.administra(organizacao, usuarioId) && !naEquipe) {
      throw new ForbiddenException('Você não faz parte desta comissão');
    }
    return this.popular(comissao);
  }

  private consultar(filtro: Record<string, unknown>) {
    return this.comissaoModel
      .find(filtro)
      .populate('organizacao_id', 'nome status')
      .populate('membros.usuario_id', 'nome email ativo')
      .sort({ criado_em: -1 })
      .exec();
  }

  async atualizar(id: string, dto: UpdateComissaoDto, usuarioId: string) {
    const atual = await this.autorizarComissao(id, usuarioId);
    if (dto.ativo === true) this.exigirResponsavelUnico(atual);
    const dados: UpdateComissaoDto = {};
    if (dto.nome !== undefined) dados.nome = dto.nome;
    if (dto.descricao !== undefined) dados.descricao = dto.descricao;
    if (dto.ativo !== undefined) dados.ativo = dto.ativo;
    const comissao = await this.comissaoModel
      .findByIdAndUpdate(
        id,
        { $set: dados },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (!comissao) throw new NotFoundException('Comissão não encontrada');
    return this.popular(comissao);
  }

  async remover(id: string, usuarioId: string) {
    const comissao = await this.atualizar(id, { ativo: false }, usuarioId);
    return { mensagem: 'Comissão desativada com sucesso', comissao };
  }

  private exigirResponsavelUnico(comissao: ComissaoDocument) {
    if (
      comissao.membros.filter((m) => m.papel === PapelComissao.RESPONSAVEL)
        .length !== 1
    ) {
      throw new BadRequestException(
        'Defina exatamente um responsável para regularizar esta comissão',
      );
    }
  }

  private async exigirElegivel(
    organizacaoId: string,
    membroId: string,
    usuarioId: string,
  ) {
    this.validarId(membroId);
    const pessoas = await this.listarMembrosDisponiveis(
      organizacaoId,
      usuarioId,
    );
    if (!pessoas.some((pessoa) => pessoa._id.toString() === membroId)) {
      throw new BadRequestException(
        'O responsável ou integrante deve estar ativo e aprovado na organização',
      );
    }
  }

  private async gravarEquipe(
    comissao: ComissaoDocument,
    membros: Comissao['membros'],
  ) {
    // Compare-and-swap: não sobrescreve uma alteração de equipe concorrente.
    // Uma única escrita substitui todos os papéis, sem estado intermediário sem responsável.
    const atualizada = await this.comissaoModel
      .findOneAndUpdate(
        { _id: comissao._id, ativo: comissao.ativo, membros: comissao.membros },
        { $set: { membros } },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (!atualizada)
      throw new ConflictException(
        'A comissão mudou. Atualize e tente novamente.',
      );
    return this.popular(atualizada);
  }

  async definirResponsavel(id: string, membroId: string, usuarioId: string) {
    const comissao = await this.autorizarComissao(id, usuarioId);
    await this.exigirElegivel(
      comissao.organizacao_id.toString(),
      membroId,
      usuarioId,
    );
    const membros = comissao.membros.map((membro) => ({
      usuario_id: membro.usuario_id,
      adicionado_em: membro.adicionado_em,
      papel:
        membro.usuario_id.toString() === membroId
          ? PapelComissao.RESPONSAVEL
          : PapelComissao.MEMBRO,
    }));
    if (!membros.some((membro) => membro.usuario_id.toString() === membroId)) {
      membros.push({
        usuario_id: new Types.ObjectId(membroId),
        papel: PapelComissao.RESPONSAVEL,
        adicionado_em: new Date(),
      });
    }
    // Também regulariza dados legados e comissões inativas, sem reativá-las.
    return this.gravarEquipe(comissao, membros);
  }

  async adicionarMembro(
    id: string,
    dto: AddMembroComissaoDto,
    usuarioId: string,
  ) {
    const comissao = await this.autorizarComissao(id, usuarioId);
    if (!comissao.ativo)
      throw new BadRequestException(
        'Reative a comissão antes de gerenciar sua equipe',
      );
    this.exigirResponsavelUnico(comissao);
    if (dto.papel === PapelComissao.RESPONSAVEL) {
      throw new BadRequestException(
        'Use a substituição de responsável; a comissão deve ter exatamente um',
      );
    }
    await this.exigirElegivel(
      comissao.organizacao_id.toString(),
      dto.usuario_id,
      usuarioId,
    );
    if (
      comissao.membros.some((m) => m.usuario_id.toString() === dto.usuario_id)
    ) {
      throw new ConflictException('Usuário já pertence à comissão');
    }
    return this.gravarEquipe(comissao, [
      ...comissao.membros.map((m) => ({
        usuario_id: m.usuario_id,
        papel: m.papel,
        adicionado_em: m.adicionado_em,
      })),
      {
        usuario_id: new Types.ObjectId(dto.usuario_id),
        papel: PapelComissao.MEMBRO,
        adicionado_em: new Date(),
      },
    ]);
  }

  async atualizarMembro(
    id: string,
    membroId: string,
    papel: PapelComissao,
    usuarioId: string,
  ) {
    const comissao = await this.validarEquipe(id, membroId, usuarioId);
    if (papel === PapelComissao.RESPONSAVEL)
      return this.definirResponsavel(id, membroId, usuarioId);
    this.exigirResponsavelUnico(comissao);
    if (
      comissao.membros.some(
        (m) =>
          m.usuario_id.toString() === membroId &&
          m.papel === PapelComissao.RESPONSAVEL,
      )
    ) {
      throw new BadRequestException(
        'Substitua o responsável antes de alterar seu papel',
      );
    }
    return this.popular(comissao);
  }

  async removerMembro(id: string, membroId: string, usuarioId: string) {
    const comissao = await this.validarEquipe(id, membroId, usuarioId);
    this.exigirResponsavelUnico(comissao);
    if (
      comissao.membros.some(
        (m) =>
          m.usuario_id.toString() === membroId &&
          m.papel === PapelComissao.RESPONSAVEL,
      )
    ) {
      throw new BadRequestException(
        'Substitua o responsável antes de removê-lo',
      );
    }
    return this.gravarEquipe(
      comissao,
      comissao.membros
        .filter((m) => m.usuario_id.toString() !== membroId)
        .map((m) => ({
          usuario_id: m.usuario_id,
          papel: m.papel,
          adicionado_em: m.adicionado_em,
        })),
    );
  }

  private async validarEquipe(id: string, membroId: string, usuarioId: string) {
    this.validarId(membroId);
    const comissao = await this.autorizarComissao(id, usuarioId);
    if (!comissao.ativo)
      throw new BadRequestException(
        'Reative a comissão antes de gerenciar sua equipe',
      );
    if (
      !comissao.membros.some(
        (membro) => membro.usuario_id.toString() === membroId,
      )
    ) {
      throw new NotFoundException('Usuário não pertence a esta comissão');
    }
    return comissao;
  }
}
