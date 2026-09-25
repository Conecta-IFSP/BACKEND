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

  private async autorizarOrganizacao(organizacaoId: string, usuarioId: string) {
    this.validarId(organizacaoId);
    await this.validarUsuario(usuarioId);
    const organizacao = await this.organizacaoModel
      .findById(organizacaoId)
      .exec();
    if (!organizacao) throw new NotFoundException('Organização não encontrada');
    const administrador = organizacao.membros.some(
      (membro) =>
        membro.usuario_id.toString() === usuarioId &&
        membro.papel === PapelOrganizacao.ADMIN &&
        membro.status === StatusMembroOrganizacao.APROVADO,
    );
    if (!administrador || organizacao.status !== StatusOrganizacao.APROVADA) {
      throw new ForbiddenException(
        'Apenas administradores aprovados de uma organização autorizada podem gerenciar comissões',
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
    const comissao = await this.comissaoModel.create({
      nome: dto.nome,
      descricao: dto.descricao,
      organizacao_id: new Types.ObjectId(dto.organizacao_id),
      membros: [],
      ativo: true,
    });
    return this.popular(comissao);
  }

  async listar(usuarioId: string, organizacaoId?: string) {
    let ids: Types.ObjectId[];
    if (organizacaoId !== undefined) {
      const organizacao = await this.autorizarOrganizacao(
        organizacaoId,
        usuarioId,
      );
      ids = [organizacao._id];
    } else {
      ids = (await this.listarOrganizacoes(usuarioId)).map(
        (organizacao) => organizacao._id,
      );
    }
    return this.comissaoModel
      .find({ organizacao_id: { $in: ids } })
      .populate('organizacao_id', 'nome status')
      .populate('membros.usuario_id', 'nome email ativo')
      .sort({ criado_em: -1 })
      .exec();
  }

  async buscarPorId(id: string, usuarioId: string) {
    return this.popular(await this.autorizarComissao(id, usuarioId));
  }

  async atualizar(id: string, dto: UpdateComissaoDto, usuarioId: string) {
    await this.autorizarComissao(id, usuarioId);
    const dados: UpdateComissaoDto = {};
    if (dto.nome !== undefined) dados.nome = dto.nome;
    if (dto.descricao !== undefined) dados.descricao = dto.descricao;
    if (dto.ativo !== undefined) dados.ativo = dto.ativo;
    const comissao = await this.comissaoModel
      .findByIdAndUpdate(
        id,
        { $set: dados },
        { new: true, runValidators: true },
      )
      .exec();
    if (!comissao) throw new NotFoundException('Comissão não encontrada');
    return this.popular(comissao);
  }

  async remover(id: string, usuarioId: string) {
    const comissao = await this.atualizar(id, { ativo: false }, usuarioId);
    return { mensagem: 'Comissão desativada com sucesso', comissao };
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
    this.validarId(dto.usuario_id);
    const elegiveis = await this.listarMembrosDisponiveis(
      comissao.organizacao_id.toString(),
      usuarioId,
    );
    if (!elegiveis.some((membro) => membro._id.toString() === dto.usuario_id)) {
      throw new BadRequestException(
        'O usuário precisa estar ativo e ser membro aprovado da organização',
      );
    }
    // O filtro impede integrantes duplicados mesmo em solicitações simultâneas.
    const atualizado = await this.comissaoModel
      .findOneAndUpdate(
        {
          _id: id,
          ativo: true,
          'membros.usuario_id': { $ne: new Types.ObjectId(dto.usuario_id) },
        },
        {
          $push: {
            membros: {
              usuario_id: new Types.ObjectId(dto.usuario_id),
              papel: dto.papel ?? PapelComissao.MEMBRO,
              adicionado_em: new Date(),
            },
          },
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (!atualizado)
      throw new ConflictException(
        'Usuário já pertence à comissão ou a comissão foi desativada. Atualize a tela.',
      );
    return this.popular(atualizado);
  }

  async atualizarMembro(
    id: string,
    membroId: string,
    papel: PapelComissao,
    usuarioId: string,
  ) {
    await this.validarEquipe(id, membroId, usuarioId);
    const comissao = await this.comissaoModel
      .findOneAndUpdate(
        {
          _id: id,
          ativo: true,
          'membros.usuario_id': new Types.ObjectId(membroId),
        },
        {
          $set: { 'membros.$.papel': papel },
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (!comissao)
      throw new ConflictException(
        'A equipe mudou. Atualize a tela e tente novamente.',
      );
    return this.popular(comissao);
  }

  async removerMembro(id: string, membroId: string, usuarioId: string) {
    await this.validarEquipe(id, membroId, usuarioId);
    const comissao = await this.comissaoModel
      .findOneAndUpdate(
        {
          _id: id,
          ativo: true,
          'membros.usuario_id': new Types.ObjectId(membroId),
        },
        {
          $pull: { membros: { usuario_id: new Types.ObjectId(membroId) } },
        },
        { new: true },
      )
      .exec();
    if (!comissao)
      throw new ConflictException(
        'A equipe mudou. Atualize a tela e tente novamente.',
      );
    return this.popular(comissao);
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
  }
}
