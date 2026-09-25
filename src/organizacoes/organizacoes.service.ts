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
  Organizacao,
  OrganizacaoDocument,
  PapelOrganizacao,
  StatusMembroOrganizacao,
  StatusOrganizacao,
} from './schemas/organizacao.schema.js';

import {
  TipoUsuario,
  Usuario,
  UsuarioDocument,
} from '../usuarios/schemas/usuario.schema.js';
import {
  Comissao,
  ComissaoDocument,
} from '../comissoes/schemas/comissao.schema.js';

import { CreateOrganizacaoDto } from './dto/create-organizacao.dto.js';
import { UpdateOrganizacaoDto } from './dto/update-organizacao.dto.js';
import { UpdateStatusMembroDto } from './dto/update-status-membro.dto.js';

@Injectable()
export class OrganizacoesService {
  constructor(
    @InjectModel(Organizacao.name)
    private readonly organizacaoModel: Model<OrganizacaoDocument>,

    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,

    @InjectModel(Comissao.name)
    private readonly comissaoModel: Model<ComissaoDocument>,
  ) {}

  async criar(createOrganizacaoDto: CreateOrganizacaoDto, usuarioId: string) {
    const usuario = await this.usuarioModel.findById(usuarioId).exec();

    if (!usuario) {
      throw new NotFoundException('Usuário criador não encontrado');
    }

    const nome = createOrganizacaoDto.nome.trim();
    await this.exigirNomeDisponivel(nome);

    const organizacao = await this.organizacaoModel.create({
      nome,
      descricao: createOrganizacaoDto.descricao?.trim() || undefined,
      criada_por: new Types.ObjectId(usuarioId),
      status: StatusOrganizacao.PENDENTE,

      membros: [
        {
          usuario_id: new Types.ObjectId(usuarioId),
          papel: PapelOrganizacao.ADMIN,
          status: StatusMembroOrganizacao.APROVADO,
          solicitado_em: new Date(),
          aprovado_em: new Date(),
        },
      ],
    });

    return organizacao;
  }

  async listar(tipoUsuario: TipoUsuario, usuarioId: string) {
    if (tipoUsuario === TipoUsuario.ADMIN_SISTEMA) {
      return this.organizacaoModel
        .find()
        .populate('criada_por', 'nome email tipo ativo')
        .sort({ criado_em: -1 })
        .exec();
    }

    // Aprovadas para solicitar acesso, e as do próprio usuário em qualquer situação para acompanhar o cadastro.
    const organizacoes = await this.organizacaoModel
      .find({
        $or: [
          { status: StatusOrganizacao.APROVADA },
          { 'membros.usuario_id': new Types.ObjectId(usuarioId) },
        ],
      })
      .select('nome descricao status membros')
      .sort({ criado_em: -1 })
      .lean()
      .exec();

    return organizacoes.map((organizacao) => {
      const meuVinculo = organizacao.membros.find(
        (membro) => membro.usuario_id.toString() === usuarioId,
      );

      return {
        _id: organizacao._id,
        nome: organizacao.nome,
        descricao: organizacao.descricao,
        status: organizacao.status,
        meu_vinculo: meuVinculo
          ? { papel: meuVinculo.papel, status: meuVinculo.status }
          : null,
      };
    });
  }

  async buscarPorId(id: string, solicitanteId: string) {
    await this.exigirAdministrador(id, solicitanteId);
    return this.detalhes(id);
  }

  private async detalhes(id: string) {
    this.validarId(id);

    const organizacao = await this.organizacaoModel
      .findById(id)
      .populate('criada_por', 'nome email tipo ativo')
      .populate('membros.usuario_id', 'nome email tipo ativo')
      .exec();

    if (!organizacao) {
      throw new NotFoundException('Organização não encontrada');
    }

    return organizacao;
  }

  async atualizar(id: string, updateOrganizacaoDto: UpdateOrganizacaoDto) {
    this.validarId(id);

    const dados = { ...updateOrganizacaoDto };

    if (dados.nome !== undefined) {
      dados.nome = dados.nome.trim();
      await this.exigirNomeDisponivel(dados.nome, id);
    }

    if (dados.descricao !== undefined) {
      dados.descricao = dados.descricao.trim();
    }

    const organizacao = await this.organizacaoModel
      .findByIdAndUpdate(id, dados, { new: true, runValidators: true })
      .populate('criada_por', 'nome email tipo ativo')
      .populate('membros.usuario_id', 'nome email tipo ativo')
      .exec();

    if (!organizacao) {
      throw new NotFoundException('Organização não encontrada');
    }

    return organizacao;
  }

  async remover(id: string) {
    this.validarId(id);

    const organizacao = await this.organizacaoModel.findById(id).exec();

    if (!organizacao) {
      throw new NotFoundException('Organização não encontrada');
    }

    // O filtro repete a condição para não excluir uma organização autorizada novamente no meio do caminho.
    const resultado = await this.organizacaoModel
      .deleteOne({ _id: id, status: StatusOrganizacao.REVOGADA })
      .exec();

    if (resultado.deletedCount !== 1) {
      throw new ConflictException('Revogue a organização antes de excluí-la');
    }

    await this.comissaoModel
      .deleteMany({ organizacao_id: new Types.ObjectId(id) })
      .exec();

    return { mensagem: 'Organização excluída com sucesso' };
  }

  async adicionarMembro(id: string, usuarioId: string) {
    this.validarId(id);
    this.validarId(usuarioId);

    const organizacao = await this.organizacaoModel.findById(id).exec();

    if (!organizacao) {
      throw new NotFoundException('Organização não encontrada');
    }

    this.exigirOrganizacaoAprovada(organizacao);

    const usuario = await this.usuarioModel.findById(usuarioId).exec();

    if (!usuario || !usuario.ativo) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const jaExiste = organizacao.membros.some(
      (membro) => membro.usuario_id.toString() === usuarioId,
    );

    if (jaExiste) {
      throw new ConflictException(
        'Usuário já pertence ou possui solicitação nesta organização',
      );
    }

    const membro = {
      usuario_id: new Types.ObjectId(usuarioId),
      papel: PapelOrganizacao.MEMBRO,
      status: StatusMembroOrganizacao.PENDENTE,
      solicitado_em: new Date(),
    };
    // O filtro evita duplicação mesmo quando duas solicitações chegam juntas.
    const resultado = await this.organizacaoModel
      .updateOne(
        {
          _id: id,
          status: StatusOrganizacao.APROVADA,
          'membros.usuario_id': { $ne: membro.usuario_id },
        },
        { $push: { membros: membro } },
      )
      .exec();
    if (resultado.modifiedCount !== 1) {
      throw new ConflictException(
        'Solicitação já registrada ou organização indisponível',
      );
    }
    return { mensagem: 'Solicitação enviada para análise', membro };
  }

  async atualizarStatusMembro(
    id: string,
    usuarioId: string,
    updateStatusDto: UpdateStatusMembroDto,
    solicitanteId: string,
  ) {
    this.validarId(id);
    this.validarId(usuarioId);

    const organizacao = await this.exigirAdministrador(id, solicitanteId);
    this.exigirOrganizacaoAprovada(organizacao);
    if (
      ![
        StatusMembroOrganizacao.APROVADO,
        StatusMembroOrganizacao.REJEITADO,
      ].includes(updateStatusDto.status)
    ) {
      throw new BadRequestException(
        'Escolha aprovar ou rejeitar a solicitação',
      );
    }

    const membro = organizacao.membros.find(
      (item) => item.usuario_id.toString() === usuarioId,
    );

    if (!membro) {
      throw new NotFoundException('Membro não encontrado nesta organização');
    }

    if (membro.status !== StatusMembroOrganizacao.PENDENTE) {
      throw new ConflictException(
        'Apenas solicitações pendentes podem ser analisadas',
      );
    }

    const resultado = await this.organizacaoModel
      .updateOne(
        {
          _id: id,
          status: StatusOrganizacao.APROVADA,
          $and: [
            {
              membros: {
                $elemMatch: {
                  usuario_id: new Types.ObjectId(solicitanteId),
                  papel: PapelOrganizacao.ADMIN,
                  status: StatusMembroOrganizacao.APROVADO,
                },
              },
            },
            {
              membros: {
                $elemMatch: {
                  usuario_id: new Types.ObjectId(usuarioId),
                  status: StatusMembroOrganizacao.PENDENTE,
                },
              },
            },
          ],
        },
        updateStatusDto.status === StatusMembroOrganizacao.APROVADO
          ? {
              $set: {
                'membros.$[alvo].status': updateStatusDto.status,
                'membros.$[alvo].aprovado_em': new Date(),
              },
            }
          : {
              $set: { 'membros.$[alvo].status': updateStatusDto.status },
              $unset: { 'membros.$[alvo].aprovado_em': '' },
            },
        {
          arrayFilters: [
            {
              'alvo.usuario_id': new Types.ObjectId(usuarioId),
              'alvo.status': StatusMembroOrganizacao.PENDENTE,
            },
          ],
        },
      )
      .exec();
    if (resultado.modifiedCount !== 1) {
      throw new ConflictException(
        'A solicitação ou as permissões foram alteradas. Atualize a lista',
      );
    }
    return {
      mensagem: 'Solicitação analisada',
      usuario_id: usuarioId,
      status: updateStatusDto.status,
    };
  }

  async removerMembro(id: string, usuarioId: string, solicitanteId: string) {
    this.validarId(usuarioId);
    const organizacao = await this.exigirAdministrador(id, solicitanteId);
    this.exigirOrganizacaoAprovada(organizacao);
    const membro = organizacao.membros.find((item) => item.usuario_id.toString() === usuarioId);
    if (membro?.papel === PapelOrganizacao.ADMIN) {
      throw new ForbiddenException('Não é permitido remover administradores da organização');
    }
    if (membro && membro.status !== StatusMembroOrganizacao.APROVADO) {
      throw new ConflictException('Apenas membros aprovados podem ser removidos');
    }
    if (membro) {
      const resultado = await this.organizacaoModel.updateOne(
        {
          _id: id,
          status: StatusOrganizacao.APROVADA,
          $and: [
            { membros: { $elemMatch: {
              usuario_id: new Types.ObjectId(solicitanteId),
              papel: PapelOrganizacao.ADMIN,
              status: StatusMembroOrganizacao.APROVADO,
            } } },
            { membros: { $elemMatch: {
              usuario_id: new Types.ObjectId(usuarioId),
              papel: PapelOrganizacao.MEMBRO,
              status: StatusMembroOrganizacao.APROVADO,
            } } },
          ],
        },
        { $pull: { membros: { usuario_id: new Types.ObjectId(usuarioId) } } },
      ).exec();
      if (resultado.modifiedCount !== 1) {
        throw new ConflictException('O vínculo ou as permissões mudaram. Atualize a lista');
      }
    }
    // Revoga primeiro o acesso. Uma repetição pode concluir a limpeza se ela falhar.
    await this.comissaoModel.updateMany(
      { organizacao_id: new Types.ObjectId(id) },
      { $pull: { membros: { usuario_id: new Types.ObjectId(usuarioId) } } },
    ).exec();
    return { mensagem: 'Acesso à organização removido com sucesso' };
  }

  private async exigirAdministrador(id: string, usuarioId: string) {
    this.validarId(id);
    this.validarId(usuarioId);
    const organizacao = await this.organizacaoModel.findById(id).exec();
    if (!organizacao) throw new NotFoundException('Organização não encontrada');
    const administrador = organizacao.membros.some(
      (membro) =>
        membro.usuario_id.toString() === usuarioId &&
        membro.papel === PapelOrganizacao.ADMIN &&
        membro.status === StatusMembroOrganizacao.APROVADO,
    );
    if (!administrador)
      throw new ForbiddenException(
        'Apenas administradores desta organização podem realizar esta operação',
      );
    return organizacao;
  }

  private exigirOrganizacaoAprovada(organizacao: Organizacao) {
    if (organizacao.status !== StatusOrganizacao.APROVADA) {
      throw new ForbiddenException(
        'A organização não está aprovada para receber ou analisar solicitações',
      );
    }
  }

  private async exigirNomeDisponivel(nome: string, ignorarId?: string) {
    const nomeExato = new RegExp(
      `^${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      'i',
    );
    const filtro: Record<string, unknown> = { nome: nomeExato };

    if (ignorarId) {
      filtro._id = { $ne: new Types.ObjectId(ignorarId) };
    }

    const existente = await this.organizacaoModel.exists(filtro).exec();

    if (existente) {
      throw new ConflictException('Já existe uma organização com este nome');
    }
  }

  private validarId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID inválido');
    }
  }
}
