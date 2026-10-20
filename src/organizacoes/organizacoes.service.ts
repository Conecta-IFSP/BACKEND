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
  gerarCodigoAcesso,
  Organizacao,
  OrganizacaoDocument,
  PapelOrganizacao,
  StatusMembroOrganizacao,
  StatusOrganizacao,
  TAMANHO_CODIGO,
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
import {
  ConvidarMembroDto,
  ResponderConviteDto,
  UpdatePapelMembroDto,
  UpdateStatusMembroDto,
} from './dto/update-status-membro.dto.js';

const TENTATIVAS_CODIGO = 5;

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

    const dados = {
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
    };

    for (let tentativa = 1; ; tentativa++) {
      try {
        const criada = await this.organizacaoModel.create(dados);
        const resposta: Partial<Organizacao> = criada.toObject?.() ?? criada;
        delete resposta.codigo_acesso;
        return resposta;
      } catch (erro) {
        if (!this.codigoRepetido(erro) || tentativa >= TENTATIVAS_CODIGO) throw erro;
      }
    }
  }

  async entrarComCodigo(codigo: string, usuarioId: string) {
    const normalizado = codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const organizacao =
      normalizado.length === TAMANHO_CODIGO
        ? await this.organizacaoModel
            .findOne({ codigo_acesso: normalizado, status: StatusOrganizacao.APROVADA })
            .select('nome')
            .exec()
        : null;

    if (!organizacao) {
      throw new NotFoundException('Código inválido');
    }

    const resultado = await this.adicionarMembro(organizacao._id.toString(), usuarioId);
    return {
      ...resultado,
      organizacao: { _id: organizacao._id, nome: organizacao.nome },
    };
  }

  async gerarNovoCodigo(id: string, solicitanteId: string) {
    await this.exigirAdministrador(id, solicitanteId);

    for (let tentativa = 1; ; tentativa++) {
      const codigo = gerarCodigoAcesso();
      try {
        const resultado = await this.organizacaoModel
          .updateOne(
            { _id: id, $and: [this.administradorAprovado(solicitanteId)] },
            { $set: { codigo_acesso: codigo } },
          )
          .exec();
        if (resultado.modifiedCount !== 1) {
          throw new ConflictException('As permissões mudaram. Atualize a tela');
        }
        return { mensagem: 'Novo código gerado', codigo_acesso: codigo };
      } catch (erro) {
        if (!this.codigoRepetido(erro) || tentativa >= TENTATIVAS_CODIGO) throw erro;
      }
    }
  }

  async listar(tipoUsuario: TipoUsuario, usuarioId: string, busca?: string) {
    const termo = busca?.trim().slice(0, 100);
    const porNome = termo ? { nome: new RegExp(this.escaparRegex(termo), 'i') } : {};

    if (tipoUsuario === TipoUsuario.ADMIN_SISTEMA) {
      return this.organizacaoModel
        .find(porNome)
        .populate('criada_por', 'nome email tipo ativo')
        .sort({ criado_em: -1 })
        .exec();
    }

    const organizacoes = await this.organizacaoModel
      .find({
        'membros.usuario_id': new Types.ObjectId(usuarioId),
        ...porNome,
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
      .select('+codigo_acesso')
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

    const existente = this.vinculoDe(organizacao, usuarioId);

    if (existente?.status === StatusMembroOrganizacao.REJEITADO) {
      return this.reabrirSolicitacao(id, usuarioId);
    }

    if (existente?.status === StatusMembroOrganizacao.CONVIDADO) {
      throw new ConflictException(
        'Você já recebeu um convite desta organização',
      );
    }

    if (existente) {
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

    const desfazRecusa =
      membro.status === StatusMembroOrganizacao.REJEITADO &&
      updateStatusDto.status === StatusMembroOrganizacao.APROVADO;

    if (membro.status !== StatusMembroOrganizacao.PENDENTE && !desfazRecusa) {
      throw new ConflictException(
        'Esta solicitação já foi analisada',
      );
    }

    const origem = membro.status;
    const resultado = await this.organizacaoModel
      .updateOne(
        {
          _id: id,
          status: StatusOrganizacao.APROVADA,
          $and: [
            this.administradorAprovado(solicitanteId),
            {
              membros: {
                $elemMatch: {
                  usuario_id: new Types.ObjectId(usuarioId),
                  status: origem,
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
              'alvo.status': origem,
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
      mensagem: desfazRecusa ? 'Acesso aprovado' : 'Solicitação analisada',
      usuario_id: usuarioId,
      status: updateStatusDto.status,
    };
  }

  async removerMembro(id: string, usuarioId: string, solicitanteId: string) {
    this.validarId(usuarioId);
    const organizacao = await this.exigirAdministrador(id, solicitanteId);
    this.exigirOrganizacaoAprovada(organizacao);
    const membro = this.vinculoDe(organizacao, usuarioId);
    if (membro?.papel === PapelOrganizacao.ADMIN) {
      throw new ForbiddenException(
        'Não é possível remover um administrador. Torne a pessoa membro comum antes',
      );
    }
    const removiveis = [
      StatusMembroOrganizacao.APROVADO,
      StatusMembroOrganizacao.REJEITADO,
      StatusMembroOrganizacao.CONVIDADO,
    ];
    if (membro && !removiveis.includes(membro.status)) {
      throw new ConflictException(
        'Aprove ou rejeite a solicitação antes de removê-la',
      );
    }
    if (membro) {
      const resultado = await this.organizacaoModel.updateOne(
        {
          _id: id,
          status: StatusOrganizacao.APROVADA,
          $and: [
            this.administradorAprovado(solicitanteId),
            { membros: { $elemMatch: {
              usuario_id: new Types.ObjectId(usuarioId),
              papel: PapelOrganizacao.MEMBRO,
              status: membro.status,
            } } },
          ],
        },
        { $pull: { membros: { usuario_id: new Types.ObjectId(usuarioId) } } },
      ).exec();
      if (resultado.modifiedCount !== 1) {
        throw new ConflictException('O vínculo ou as permissões mudaram. Atualize a lista');
      }
    }
    await this.comissaoModel.updateMany(
      { organizacao_id: new Types.ObjectId(id) },
      { $pull: { membros: { usuario_id: new Types.ObjectId(usuarioId) } } },
    ).exec();
    const mensagens: Partial<Record<StatusMembroOrganizacao, string>> = {
      [StatusMembroOrganizacao.REJEITADO]: 'Solicitação excluída',
      [StatusMembroOrganizacao.CONVIDADO]: 'Convite cancelado',
    };
    return {
      mensagem:
        (membro && mensagens[membro.status]) ?? 'Acesso à organização removido com sucesso',
    };
  }

  async alterarPapelMembro(
    id: string,
    usuarioId: string,
    updatePapelDto: UpdatePapelMembroDto,
    solicitanteId: string,
  ) {
    this.validarId(usuarioId);
    const organizacao = await this.exigirAdministrador(id, solicitanteId);
    this.exigirOrganizacaoAprovada(organizacao);

    const membro = this.vinculoDe(organizacao, usuarioId);
    if (!membro) {
      throw new NotFoundException('Membro não encontrado nesta organização');
    }
    if (membro.status !== StatusMembroOrganizacao.APROVADO) {
      throw new ConflictException('Apenas membros aprovados podem mudar de papel');
    }
    if (membro.papel === updatePapelDto.papel) {
      throw new ConflictException('O membro já possui esse papel');
    }

    const alvo = new Types.ObjectId(usuarioId);
    const rebaixando = updatePapelDto.papel === PapelOrganizacao.MEMBRO;
    const outrosAdministradores = organizacao.membros.filter(
      (item) =>
        item.papel === PapelOrganizacao.ADMIN &&
        item.status === StatusMembroOrganizacao.APROVADO &&
        item.usuario_id.toString() !== usuarioId,
    ).length;
    if (rebaixando && outrosAdministradores === 0) {
      throw new ConflictException(
        'A organização precisa de pelo menos um administrador. Promova outro membro antes',
      );
    }

    const condicoes: Record<string, unknown>[] = [
      this.administradorAprovado(solicitanteId),
      { membros: { $elemMatch: {
        usuario_id: alvo,
        papel: membro.papel,
        status: StatusMembroOrganizacao.APROVADO,
      } } },
    ];
    if (rebaixando) {
      condicoes.push({ membros: { $elemMatch: {
        usuario_id: { $ne: alvo },
        papel: PapelOrganizacao.ADMIN,
        status: StatusMembroOrganizacao.APROVADO,
      } } });
    }

    const resultado = await this.organizacaoModel.updateOne(
      { _id: id, status: StatusOrganizacao.APROVADA, $and: condicoes },
      { $set: { 'membros.$[alvo].papel': updatePapelDto.papel } },
      { arrayFilters: [{ 'alvo.usuario_id': alvo, 'alvo.status': StatusMembroOrganizacao.APROVADO }] },
    ).exec();
    if (resultado.modifiedCount !== 1) {
      throw new ConflictException('Os papéis ou as permissões mudaram. Atualize a lista');
    }
    return {
      mensagem: rebaixando
        ? 'O administrador passou a ser membro'
        : 'Membro promovido a administrador',
      usuario_id: usuarioId,
      papel: updatePapelDto.papel,
    };
  }

  async convidarMembro(id: string, convidarDto: ConvidarMembroDto, solicitanteId: string) {
    const organizacao = await this.exigirAdministrador(id, solicitanteId);
    this.exigirOrganizacaoAprovada(organizacao);

    const email = convidarDto.email.toLowerCase().trim();
    const convidado = await this.usuarioModel.findOne({ email, ativo: true }).exec();
    if (!convidado || convidado.tipo === TipoUsuario.ADMIN_SISTEMA) {
      throw new NotFoundException('Nenhum usuário ativo encontrado com este e-mail');
    }

    const alvo = convidado._id;
    const existente = this.vinculoDe(organizacao, alvo.toString());
    if (existente?.status === StatusMembroOrganizacao.APROVADO) {
      throw new ConflictException('Esta pessoa já é membro da organização');
    }
    if (existente?.status === StatusMembroOrganizacao.PENDENTE) {
      throw new ConflictException('Esta pessoa já solicitou acesso');
    }
    if (existente?.status === StatusMembroOrganizacao.CONVIDADO) {
      throw new ConflictException('Esta pessoa já foi convidada');
    }

    const convidadoEm = new Date();
    const resultado = existente
      ? await this.organizacaoModel.updateOne(
          {
            _id: id,
            status: StatusOrganizacao.APROVADA,
            $and: [
              this.administradorAprovado(solicitanteId),
              { membros: { $elemMatch: { usuario_id: alvo, status: StatusMembroOrganizacao.REJEITADO } } },
            ],
          },
          {
            $set: {
              'membros.$[alvo].status': StatusMembroOrganizacao.CONVIDADO,
              'membros.$[alvo].solicitado_em': convidadoEm,
            },
            $unset: { 'membros.$[alvo].aprovado_em': '' },
          },
          { arrayFilters: [{ 'alvo.usuario_id': alvo, 'alvo.status': StatusMembroOrganizacao.REJEITADO }] },
        ).exec()
      : await this.organizacaoModel.updateOne(
          {
            _id: id,
            status: StatusOrganizacao.APROVADA,
            'membros.usuario_id': { $ne: alvo },
            $and: [this.administradorAprovado(solicitanteId)],
          },
          {
            $push: {
              membros: {
                usuario_id: alvo,
                papel: PapelOrganizacao.MEMBRO,
                status: StatusMembroOrganizacao.CONVIDADO,
                solicitado_em: convidadoEm,
              },
            },
          },
        ).exec();
    if (resultado.modifiedCount !== 1) {
      throw new ConflictException('O vínculo ou as permissões mudaram. Atualize a lista');
    }
    return {
      mensagem: 'Convite enviado',
      usuario: { _id: alvo, nome: convidado.nome, email: convidado.email },
    };
  }

  async responderConvite(id: string, usuarioId: string, responderDto: ResponderConviteDto) {
    this.validarId(id);
    this.validarId(usuarioId);

    const organizacao = await this.organizacaoModel.findById(id).exec();
    if (!organizacao) {
      throw new NotFoundException('Organização não encontrada');
    }
    if (this.vinculoDe(organizacao, usuarioId)?.status !== StatusMembroOrganizacao.CONVIDADO) {
      throw new NotFoundException('Convite não encontrado');
    }

    const alvo = new Types.ObjectId(usuarioId);
    const convite = {
      membros: { $elemMatch: { usuario_id: alvo, status: StatusMembroOrganizacao.CONVIDADO } },
    };

    if (!responderDto.aceitar) {
      const resultado = await this.organizacaoModel.updateOne(
        { _id: id, ...convite },
        { $pull: { membros: { usuario_id: alvo, status: StatusMembroOrganizacao.CONVIDADO } } },
      ).exec();
      if (resultado.modifiedCount !== 1) {
        throw new ConflictException('Este convite não está mais disponível');
      }
      return { mensagem: 'Convite recusado', aceito: false };
    }

    this.exigirOrganizacaoAprovada(organizacao);
    const resultado = await this.organizacaoModel.updateOne(
      { _id: id, status: StatusOrganizacao.APROVADA, ...convite },
      {
        $set: {
          'membros.$[alvo].status': StatusMembroOrganizacao.APROVADO,
          'membros.$[alvo].aprovado_em': new Date(),
        },
      },
      { arrayFilters: [{ 'alvo.usuario_id': alvo, 'alvo.status': StatusMembroOrganizacao.CONVIDADO }] },
    ).exec();
    if (resultado.modifiedCount !== 1) {
      throw new ConflictException('Este convite não está mais disponível');
    }
    return { mensagem: 'Convite aceito', aceito: true };
  }

  private async reabrirSolicitacao(id: string, usuarioId: string) {
    const alvo = new Types.ObjectId(usuarioId);
    const solicitadoEm = new Date();
    const resultado = await this.organizacaoModel
      .updateOne(
        {
          _id: id,
          status: StatusOrganizacao.APROVADA,
          membros: { $elemMatch: { usuario_id: alvo, status: StatusMembroOrganizacao.REJEITADO } },
        },
        {
          $set: {
            'membros.$[alvo].status': StatusMembroOrganizacao.PENDENTE,
            'membros.$[alvo].solicitado_em': solicitadoEm,
          },
          $unset: { 'membros.$[alvo].aprovado_em': '' },
        },
        { arrayFilters: [{ 'alvo.usuario_id': alvo, 'alvo.status': StatusMembroOrganizacao.REJEITADO }] },
      )
      .exec();
    if (resultado.modifiedCount !== 1) {
      throw new ConflictException('Solicitação já registrada ou organização indisponível');
    }
    return {
      mensagem: 'Solicitação enviada novamente para análise',
      membro: {
        usuario_id: alvo,
        papel: PapelOrganizacao.MEMBRO,
        status: StatusMembroOrganizacao.PENDENTE,
        solicitado_em: solicitadoEm,
      },
    };
  }

  private vinculoDe(organizacao: Organizacao, usuarioId: string) {
    return organizacao.membros.find((membro) => membro.usuario_id.toString() === usuarioId);
  }

  private administradorAprovado(solicitanteId: string) {
    return {
      membros: {
        $elemMatch: {
          usuario_id: new Types.ObjectId(solicitanteId),
          papel: PapelOrganizacao.ADMIN,
          status: StatusMembroOrganizacao.APROVADO,
        },
      },
    };
  }

  private codigoRepetido(erro: unknown) {
    const falha = erro as { code?: number; keyPattern?: Record<string, unknown> };
    return falha?.code === 11000 && Boolean(falha.keyPattern?.codigo_acesso);
  }

  private escaparRegex(texto: string) {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        'Esta organização não está aprovada',
      );
    }
  }

  private async exigirNomeDisponivel(nome: string, ignorarId?: string) {
    const nomeExato = new RegExp(`^${this.escaparRegex(nome)}$`, 'i');
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
