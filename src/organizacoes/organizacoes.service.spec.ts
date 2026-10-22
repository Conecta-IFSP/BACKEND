import {
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { OrganizacoesService } from './organizacoes.service.js';
import {
  OrganizacaoDocument,
  PapelOrganizacao,
  StatusMembroOrganizacao,
  StatusOrganizacao,
} from './schemas/organizacao.schema.js';
import { TipoUsuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema.js';
import { ComissaoDocument } from '../comissoes/schemas/comissao.schema.js';

const admin = new Types.ObjectId().toString();
const usuario = new Types.ObjectId().toString();
const orgId = new Types.ObjectId().toString();
const consulta = (valor: unknown) => ({
  exec: vi.fn().mockResolvedValue(valor),
});

describe('Permissões e solicitações de organizações', () => {
  let service: OrganizacoesService;
  let organizacao: {
    status: StatusOrganizacao;
    membros: {
      usuario_id: Types.ObjectId;
      papel: PapelOrganizacao;
      status: StatusMembroOrganizacao;
    }[];
  };
  let model: {
    findById: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
    deleteOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
  };
  let comissoes: { deleteMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
  let usuarios: { findById: ReturnType<typeof vi.fn>; findOne: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    organizacao = {
      status: StatusOrganizacao.APROVADA,
      membros: [
        {
          usuario_id: new Types.ObjectId(admin),
          papel: PapelOrganizacao.ADMIN,
          status: StatusMembroOrganizacao.APROVADO,
        },
      ],
    };
    model = {
      findById: vi.fn(() => consulta(organizacao)),
      updateOne: vi.fn(() => consulta({ modifiedCount: 1 })),
      deleteOne: vi.fn(() => consulta({ deletedCount: 1 })),
      create: vi.fn().mockResolvedValue({}),
      find: vi.fn(),
      exists: vi.fn(() => consulta(null)),
    };
    comissoes = {
      deleteMany: vi.fn(() => consulta({ deletedCount: 2 })),
      updateMany: vi.fn(() => consulta({ modifiedCount: 2 })),
    };
    usuarios = {
      findById: vi.fn(() => consulta({ ativo: true })),
      findOne: vi.fn(() =>
        consulta({
          _id: new Types.ObjectId(usuario),
          nome: 'Pessoa convidada',
          email: 'convidada@teste.com',
          tipo: TipoUsuario.USUARIO,
          ativo: true,
        }),
      ),
    };
    service = new OrganizacoesService(
      model as unknown as Model<OrganizacaoDocument>,
      usuarios as unknown as Model<UsuarioDocument>,
      comissoes as unknown as Model<ComissaoDocument>,
    );
  });

  function vincular(status: StatusMembroOrganizacao, papel = PapelOrganizacao.MEMBRO) {
    organizacao.membros.push({ usuario_id: new Types.ObjectId(usuario), papel, status });
  }

  it('remove vínculo e limpa somente comissões da organização escolhida', async () => {
    organizacao.membros.push({ usuario_id: new Types.ObjectId(usuario), papel: PapelOrganizacao.MEMBRO, status: StatusMembroOrganizacao.APROVADO });
    await service.removerMembro(orgId, usuario, admin);
    expect(model.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: orgId, status: StatusOrganizacao.APROVADA, $and: expect.any(Array) }),
      { $pull: { membros: { usuario_id: new Types.ObjectId(usuario) } } },
    );
    expect(comissoes.updateMany).toHaveBeenCalledWith(
      { organizacao_id: new Types.ObjectId(orgId) },
      { $pull: { membros: { usuario_id: new Types.ObjectId(usuario) } } },
    );
  });

  it('bloqueia remoção por usuário externo e remoção de administrador', async () => {
    await expect(service.removerMembro(orgId, admin, usuario)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.removerMembro(orgId, admin, admin)).rejects.toBeInstanceOf(ForbiddenException);
    expect(model.updateOne).not.toHaveBeenCalled();
    expect(comissoes.updateMany).not.toHaveBeenCalled();
  });

  it('não remove solicitação pendente: ela deve ser aprovada ou recusada', async () => {
    vincular(StatusMembroOrganizacao.PENDENTE);
    await expect(service.removerMembro(orgId, usuario, admin)).rejects.toBeInstanceOf(ConflictException);
    expect(comissoes.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    [StatusMembroOrganizacao.REJEITADO, 'Solicitação excluída'],
    [StatusMembroOrganizacao.CONVIDADO, 'Convite cancelado'],
  ])('remove o vínculo %s conferindo a situação na gravação', async (status, mensagem) => {
    vincular(status);
    await expect(service.removerMembro(orgId, usuario, admin)).resolves.toEqual({ mensagem });
    const [filtro] = model.updateOne.mock.calls[0];
    expect(filtro.$and).toContainEqual({
      membros: {
        $elemMatch: {
          usuario_id: new Types.ObjectId(usuario),
          papel: PapelOrganizacao.MEMBRO,
          status,
        },
      },
    });
  });

  it('bloqueia remoção em organização revogada', async () => {
    organizacao.status = StatusOrganizacao.REVOGADA;
    await expect(service.removerMembro(orgId, usuario, admin)).rejects.toBeInstanceOf(ForbiddenException);
    expect(comissoes.updateMany).not.toHaveBeenCalled();
  });

  it('não limpa comissões se as permissões mudarem durante a remoção', async () => {
    organizacao.membros.push({ usuario_id: new Types.ObjectId(usuario), papel: PapelOrganizacao.MEMBRO, status: StatusMembroOrganizacao.APROVADO });
    model.updateOne.mockReturnValue(consulta({ modifiedCount: 0 }));
    await expect(service.removerMembro(orgId, usuario, admin)).rejects.toBeInstanceOf(ConflictException);
    expect(comissoes.updateMany).not.toHaveBeenCalled();
  });

  it('permite repetir a limpeza quando o vínculo já foi removido', async () => {
    comissoes.updateMany.mockReturnValueOnce({ exec: vi.fn().mockRejectedValue(new Error('indisponível')) });
    await expect(service.removerMembro(orgId, usuario, admin)).rejects.toThrow('indisponível');
    await expect(service.removerMembro(orgId, usuario, admin)).resolves.toHaveProperty('mensagem');
    expect(model.updateOne).not.toHaveBeenCalled();
    expect(comissoes.updateMany).toHaveBeenCalledTimes(2);
  });

  it('cria organização pendente com o administrador identificado pela sessão', async () => {
    await service.criar({ nome: 'Organização A', cidade: 'São Paulo' }, admin);
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: StatusOrganizacao.PENDENTE,
        criada_por: new Types.ObjectId(admin),
        membros: [
          expect.objectContaining({
            usuario_id: new Types.ObjectId(admin),
            papel: PapelOrganizacao.ADMIN,
          }),
        ],
      }),
    );
  });

  it('cria com outro código quando o sorteado já existe', async () => {
    const repetido = Object.assign(new Error('duplicado'), { code: 11000, keyPattern: { codigo_acesso: 1 } });
    model.create.mockRejectedValueOnce(repetido).mockResolvedValueOnce({ nome: 'Organização A' });
    await expect(service.criar({ nome: 'Organização A', cidade: 'São Paulo' }, admin)).resolves.toEqual({ nome: 'Organização A' });
    expect(model.create).toHaveBeenCalledTimes(2);

    const nomeRepetido = Object.assign(new Error('duplicado'), { code: 11000, keyPattern: { nome: 1 } });
    model.create.mockRejectedValueOnce(nomeRepetido);
    await expect(service.criar({ nome: 'Organização B', cidade: 'São Paulo' }, admin)).rejects.toBe(nomeRepetido);
  });

  describe('código de acesso', () => {
    const buscar = (valor: unknown) => ({
      select: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(valor),
    });

    beforeEach(() => {
      Object.assign(model, { findOne: vi.fn(() => buscar({ _id: new Types.ObjectId(orgId), nome: 'Organização A' })) });
    });

    it('normaliza o código, busca só organização aprovada e cria o pedido pendente', async () => {
      const resposta = await service.entrarComCodigo(' k7qx4-m9p2a ', usuario);
      expect((model as unknown as { findOne: ReturnType<typeof vi.fn> }).findOne).toHaveBeenCalledWith({
        codigo_acesso: 'K7QX4M9P2A',
        status: StatusOrganizacao.APROVADA,
      });
      expect(resposta).toMatchObject({
        mensagem: 'Solicitação enviada para análise',
        organizacao: { nome: 'Organização A' },
        membro: { status: StatusMembroOrganizacao.PENDENTE },
      });
    });

    it('responde o mesmo erro para código curto, inexistente ou de organização não aprovada', async () => {
      const findOne = (model as unknown as { findOne: ReturnType<typeof vi.fn> }).findOne;
      await expect(service.entrarComCodigo('K7QX4', usuario)).rejects.toThrow('Código inválido');
      expect(findOne).not.toHaveBeenCalled();
      findOne.mockReturnValue(buscar(null));
      await expect(service.entrarComCodigo('K7QX4M9P2A', usuario)).rejects.toThrow('Código inválido');
      expect(model.updateOne).not.toHaveBeenCalled();
    });

    it('segue as regras de vínculo ao entrar com código', async () => {
      vincular(StatusMembroOrganizacao.CONVIDADO);
      await expect(service.entrarComCodigo('K7QX4M9P2A', usuario)).rejects.toThrow(
        'Você já recebeu um convite desta organização',
      );
    });

    it('só administrador gera novo código, e a gravação confere o administrador', async () => {
      await expect(service.gerarNovoCodigo(orgId, usuario)).rejects.toBeInstanceOf(ForbiddenException);
      expect(model.updateOne).not.toHaveBeenCalled();

      const resposta = await service.gerarNovoCodigo(orgId, admin);
      expect(resposta.codigo_acesso).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
      const [filtro, alteracao] = model.updateOne.mock.calls[0];
      expect(filtro.$and[0].membros.$elemMatch.papel).toBe(PapelOrganizacao.ADMIN);
      expect(alteracao).toEqual({ $set: { codigo_acesso: resposta.codigo_acesso } });

      model.updateOne.mockReturnValue(consulta({ modifiedCount: 0 }));
      await expect(service.gerarNovoCodigo(orgId, admin)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('lista só as organizações com vínculo do usuário, sem divulgar membros', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        {
          _id: orgId,
          nome: 'Organização pendente',
          status: StatusOrganizacao.PENDENTE,
          membros: [
            {
              usuario_id: new Types.ObjectId(usuario),
              papel: PapelOrganizacao.ADMIN,
              status: StatusMembroOrganizacao.APROVADO,
            },
          ],
        },
      ]),
    };
    model.find.mockReturnValue(query);
    const lista = await service.listar(TipoUsuario.USUARIO, usuario);
    expect(model.find).toHaveBeenCalledWith({
      'membros.usuario_id': new Types.ObjectId(usuario),
    });
    expect(query.select).toHaveBeenCalledWith(
      'nome cidade descricao status membros',
    );
    expect(lista[0]).toEqual({
      _id: orgId,
      nome: 'Organização pendente',
      descricao: undefined,
      status: StatusOrganizacao.PENDENTE,
      meu_vinculo: {
        papel: PapelOrganizacao.ADMIN,
        status: StatusMembroOrganizacao.APROVADO,
      },
    });
  });

  it('exclui organização revogada junto com suas comissões', async () => {
    organizacao.status = StatusOrganizacao.REVOGADA;

    await expect(service.remover(orgId)).resolves.toEqual({
      mensagem: 'Organização excluída com sucesso',
    });
    expect(model.deleteOne).toHaveBeenCalledWith({
      _id: orgId,
      status: StatusOrganizacao.REVOGADA,
    });
    expect(comissoes.deleteMany).toHaveBeenCalledWith({
      organizacao_id: new Types.ObjectId(orgId),
    });
  });

  it('não exclui organização que não está revogada nem uma inexistente', async () => {
    model.deleteOne.mockReturnValue(consulta({ deletedCount: 0 }));
    await expect(service.remover(orgId)).rejects.toBeInstanceOf(
      ConflictException,
    );

    model.findById.mockReturnValue(consulta(null));
    await expect(service.remover(orgId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(comissoes.deleteMany).not.toHaveBeenCalled();
  });

  it('administrador do sistema lista inclusive organizações pendentes e revogadas', async () => {
    const query = {
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    };
    model.find.mockReturnValue(query);

    await service.listar(TipoUsuario.ADMIN_SISTEMA, admin);

    expect(model.find).toHaveBeenCalledWith({});
    expect(query.populate).toHaveBeenCalledWith(
      'criada_por',
      'nome email tipo ativo',
    );
  });

  it('busca pelo nome escapando caracteres especiais e sem distinguir maiúsculas', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    };
    model.find.mockReturnValue(query);

    await service.listar(TipoUsuario.USUARIO, usuario, '  Conselho (A).  ');

    const [filtro] = model.find.mock.calls[0];
    expect(filtro['membros.usuario_id']).toEqual(new Types.ObjectId(usuario));
    expect(filtro.nome).toEqual(/Conselho \(A\)\./i);
    expect(filtro.nome.test('conselho (a). municipal')).toBe(true);
    expect(filtro.nome.test('Conselho AA')).toBe(false);
  });

  it('recusa nome de organização repetido sem diferenciar maiúsculas', async () => {
    model.exists.mockReturnValue(consulta({ _id: orgId }));

    await expect(
      service.criar({ nome: '  Organização A  ', cidade: 'São Paulo' }, admin),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(model.create).not.toHaveBeenCalled();
  });

  it('registra membro pendente e protege contra duplicação concorrente', async () => {
    const resposta = await service.adicionarMembro(orgId, usuario);
    expect(resposta.membro).toMatchObject({
      papel: PapelOrganizacao.MEMBRO,
      status: StatusMembroOrganizacao.PENDENTE,
    });
    expect(resposta).not.toHaveProperty('membros');
    expect(model.updateOne).toHaveBeenCalledWith(
      {
        _id: orgId,
        status: StatusOrganizacao.APROVADA,
        'membros.usuario_id': { $ne: new Types.ObjectId(usuario) },
      },
      {
        $push: {
          membros: expect.objectContaining({
            usuario_id: new Types.ObjectId(usuario),
            papel: PapelOrganizacao.MEMBRO,
          }),
        },
      },
    );
    model.updateOne.mockReturnValue(consulta({ modifiedCount: 0 }));
    await expect(
      service.adicionarMembro(orgId, usuario),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('permite solicitar entrada em organizações diferentes', async () => {
    await service.adicionarMembro(orgId, usuario);
    await service.adicionarMembro(new Types.ObjectId().toString(), usuario);
    expect(model.updateOne).toHaveBeenCalledTimes(2);
  });

  it.each(
    Object.values(StatusMembroOrganizacao).filter(
      (status) => status !== StatusMembroOrganizacao.REJEITADO,
    ),
  )('não repete vínculo com situação %s', async (status) => {
    vincular(status);
    await expect(
      service.adicionarMembro(orgId, usuario),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(model.updateOne).not.toHaveBeenCalled();
  });

  it('reabre como pendente o pedido de quem foi recusado', async () => {
    vincular(StatusMembroOrganizacao.REJEITADO);
    const resposta = await service.adicionarMembro(orgId, usuario);
    expect(resposta.membro.status).toBe(StatusMembroOrganizacao.PENDENTE);
    const [filtro, alteracao, opcoes] = model.updateOne.mock.calls[0];
    expect(filtro.membros.$elemMatch.status).toBe(StatusMembroOrganizacao.REJEITADO);
    expect(alteracao.$set['membros.$[alvo].status']).toBe(StatusMembroOrganizacao.PENDENTE);
    expect(alteracao.$unset).toHaveProperty('membros.$[alvo].aprovado_em');
    expect(opcoes.arrayFilters[0]['alvo.status']).toBe(StatusMembroOrganizacao.REJEITADO);

    model.updateOne.mockReturnValue(consulta({ modifiedCount: 0 }));
    await expect(service.adicionarMembro(orgId, usuario)).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([StatusOrganizacao.PENDENTE, StatusOrganizacao.REVOGADA])(
    'bloqueia solicitação e decisão em organização %s',
    async (status) => {
      organizacao.status = status;
      await expect(
        service.adicionarMembro(orgId, usuario),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.atualizarStatusMembro(
          orgId,
          usuario,
          { status: StatusMembroOrganizacao.APROVADO },
          admin,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(model.updateOne).not.toHaveBeenCalled();
    },
  );

  it('impede que usuário externo consulte membros ou decida solicitações', async () => {
    await expect(service.buscarPorId(orgId, usuario)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.atualizarStatusMembro(
        orgId,
        usuario,
        { status: StatusMembroOrganizacao.APROVADO },
        usuario,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    [PapelOrganizacao.MEMBRO, StatusMembroOrganizacao.APROVADO],
    [PapelOrganizacao.ADMIN, StatusMembroOrganizacao.PENDENTE],
    [PapelOrganizacao.ADMIN, StatusMembroOrganizacao.REJEITADO],
  ])('não autoriza papel %s com status %s', async (papel, status) => {
    organizacao.membros[0].papel = papel;
    organizacao.membros[0].status = status;
    await expect(
      service.atualizarStatusMembro(
        orgId,
        usuario,
        { status: StatusMembroOrganizacao.APROVADO },
        admin,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    StatusMembroOrganizacao.APROVADO,
    StatusMembroOrganizacao.REJEITADO,
  ])('administrador decide como %s', async (status) => {
    organizacao.membros.push({
      usuario_id: new Types.ObjectId(usuario),
      papel: PapelOrganizacao.MEMBRO,
      status: StatusMembroOrganizacao.PENDENTE,
    });
    await expect(
      service.atualizarStatusMembro(orgId, usuario, { status }, admin),
    ).resolves.toMatchObject({ usuario_id: usuario, status });
    const [filtro, alteracao, opcoes] = model.updateOne.mock.calls[0];
    expect(filtro.$and).toContainEqual({
      membros: {
        $elemMatch: {
          usuario_id: new Types.ObjectId(admin),
          papel: PapelOrganizacao.ADMIN,
          status: StatusMembroOrganizacao.APROVADO,
        },
      },
    });
    expect(opcoes.arrayFilters[0]['alvo.status']).toBe(
      StatusMembroOrganizacao.PENDENTE,
    );
    expect(alteracao.$set['membros.$[alvo].status']).toBe(status);
  });

  it('desfaz a recusa aprovando, conferindo na gravação que ela continua recusada', async () => {
    vincular(StatusMembroOrganizacao.REJEITADO);
    await expect(
      service.atualizarStatusMembro(
        orgId,
        usuario,
        { status: StatusMembroOrganizacao.APROVADO },
        admin,
      ),
    ).resolves.toMatchObject({ mensagem: 'Acesso aprovado' });
    const [filtro, alteracao, opcoes] = model.updateOne.mock.calls[0];
    expect(filtro.$and).toContainEqual({
      membros: {
        $elemMatch: {
          usuario_id: new Types.ObjectId(usuario),
          status: StatusMembroOrganizacao.REJEITADO,
        },
      },
    });
    expect(alteracao.$set['membros.$[alvo].status']).toBe(StatusMembroOrganizacao.APROVADO);
    expect(opcoes.arrayFilters[0]['alvo.status']).toBe(StatusMembroOrganizacao.REJEITADO);
  });

  it('não recusa de novo uma recusa nem modifica o administrador aprovado', async () => {
    vincular(StatusMembroOrganizacao.REJEITADO);
    await expect(
      service.atualizarStatusMembro(
        orgId,
        usuario,
        { status: StatusMembroOrganizacao.REJEITADO },
        admin,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.atualizarStatusMembro(
        orgId,
        admin,
        { status: StatusMembroOrganizacao.REJEITADO },
        admin,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(model.updateOne).not.toHaveBeenCalled();
  });

  it('detecta decisão concorrente ou perda de permissão', async () => {
    organizacao.membros.push({
      usuario_id: new Types.ObjectId(usuario),
      papel: PapelOrganizacao.MEMBRO,
      status: StatusMembroOrganizacao.PENDENTE,
    });
    model.updateOne.mockReturnValue(consulta({ modifiedCount: 0 }));
    await expect(
      service.atualizarStatusMembro(
        orgId,
        usuario,
        { status: StatusMembroOrganizacao.APROVADO },
        admin,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  describe('troca de administrador', () => {
    it('promove um membro aprovado a administrador', async () => {
      vincular(StatusMembroOrganizacao.APROVADO);
      await expect(
        service.alterarPapelMembro(orgId, usuario, { papel: PapelOrganizacao.ADMIN }, admin),
      ).resolves.toMatchObject({ papel: PapelOrganizacao.ADMIN });
      const [filtro, alteracao, opcoes] = model.updateOne.mock.calls[0];
      expect(filtro.$and).toHaveLength(2);
      expect(filtro.$and).toContainEqual({
        membros: {
          $elemMatch: {
            usuario_id: new Types.ObjectId(usuario),
            papel: PapelOrganizacao.MEMBRO,
            status: StatusMembroOrganizacao.APROVADO,
          },
        },
      });
      expect(alteracao).toEqual({ $set: { 'membros.$[alvo].papel': PapelOrganizacao.ADMIN } });
      expect(opcoes.arrayFilters[0]['alvo.usuario_id']).toEqual(new Types.ObjectId(usuario));
    });

    it('devolve um administrador ao papel de membro quando existe outro administrador', async () => {
      vincular(StatusMembroOrganizacao.APROVADO, PapelOrganizacao.ADMIN);
      await service.alterarPapelMembro(orgId, usuario, { papel: PapelOrganizacao.MEMBRO }, admin);
      const [filtro] = model.updateOne.mock.calls[0];
      expect(filtro.$and).toContainEqual({
        membros: {
          $elemMatch: {
            usuario_id: { $ne: new Types.ObjectId(usuario) },
            papel: PapelOrganizacao.ADMIN,
            status: StatusMembroOrganizacao.APROVADO,
          },
        },
      });
    });

    it('permite ao administrador deixar o papel quando há outro, completando a transferência', async () => {
      vincular(StatusMembroOrganizacao.APROVADO, PapelOrganizacao.ADMIN);
      await expect(
        service.alterarPapelMembro(orgId, admin, { papel: PapelOrganizacao.MEMBRO }, admin),
      ).resolves.toMatchObject({ papel: PapelOrganizacao.MEMBRO });
    });

    it('impede que a organização fique sem administrador', async () => {
      await expect(
        service.alterarPapelMembro(orgId, admin, { papel: PapelOrganizacao.MEMBRO }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(model.updateOne).not.toHaveBeenCalled();
    });

    it.each([
      StatusMembroOrganizacao.PENDENTE,
      StatusMembroOrganizacao.REJEITADO,
      StatusMembroOrganizacao.CONVIDADO,
    ])('não muda o papel de vínculo %s', async (status) => {
      vincular(status);
      await expect(
        service.alterarPapelMembro(orgId, usuario, { papel: PapelOrganizacao.ADMIN }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(model.updateOne).not.toHaveBeenCalled();
    });

    it('recusa papel repetido, membro inexistente e solicitante que não administra', async () => {
      vincular(StatusMembroOrganizacao.APROVADO);
      await expect(
        service.alterarPapelMembro(orgId, usuario, { papel: PapelOrganizacao.MEMBRO }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.alterarPapelMembro(orgId, new Types.ObjectId().toString(), { papel: PapelOrganizacao.ADMIN }, admin),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.alterarPapelMembro(orgId, admin, { papel: PapelOrganizacao.MEMBRO }, usuario),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(model.updateOne).not.toHaveBeenCalled();
    });

    it('detecta troca simultânea que deixaria a organização sem administrador', async () => {
      vincular(StatusMembroOrganizacao.APROVADO, PapelOrganizacao.ADMIN);
      model.updateOne.mockReturnValue(consulta({ modifiedCount: 0 }));
      await expect(
        service.alterarPapelMembro(orgId, usuario, { papel: PapelOrganizacao.MEMBRO }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('convite', () => {
    it('convida um usuário ativo sem vínculo, identificado pelo e-mail', async () => {
      await expect(
        service.convidarMembro(orgId, { email: '  Convidada@Teste.com ' }, admin),
      ).resolves.toMatchObject({ mensagem: 'Convite enviado', usuario: { nome: 'Pessoa convidada' } });
      expect(usuarios.findOne).toHaveBeenCalledWith({ email: 'convidada@teste.com', ativo: true });
      const [filtro, alteracao] = model.updateOne.mock.calls[0];
      expect(filtro['membros.usuario_id']).toEqual({ $ne: new Types.ObjectId(usuario) });
      expect(alteracao.$push.membros).toMatchObject({
        usuario_id: new Types.ObjectId(usuario),
        papel: PapelOrganizacao.MEMBRO,
        status: StatusMembroOrganizacao.CONVIDADO,
      });
    });

    it('transforma uma recusa anterior em convite', async () => {
      vincular(StatusMembroOrganizacao.REJEITADO);
      await service.convidarMembro(orgId, { email: 'convidada@teste.com' }, admin);
      const [filtro, alteracao, opcoes] = model.updateOne.mock.calls[0];
      expect(filtro.$and).toHaveLength(2);
      expect(alteracao.$set['membros.$[alvo].status']).toBe(StatusMembroOrganizacao.CONVIDADO);
      expect(opcoes.arrayFilters[0]['alvo.status']).toBe(StatusMembroOrganizacao.REJEITADO);
    });

    it.each([
      StatusMembroOrganizacao.APROVADO,
      StatusMembroOrganizacao.PENDENTE,
      StatusMembroOrganizacao.CONVIDADO,
    ])('não convida quem já tem vínculo %s', async (status) => {
      vincular(status);
      await expect(
        service.convidarMembro(orgId, { email: 'convidada@teste.com' }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(model.updateOne).not.toHaveBeenCalled();
    });

    it('não convida e-mail sem conta ativa nem o administrador do sistema', async () => {
      usuarios.findOne.mockReturnValueOnce(consulta(null));
      await expect(
        service.convidarMembro(orgId, { email: 'ninguem@teste.com' }, admin),
      ).rejects.toBeInstanceOf(NotFoundException);
      usuarios.findOne.mockReturnValueOnce(
        consulta({ _id: new Types.ObjectId(usuario), tipo: TipoUsuario.ADMIN_SISTEMA, ativo: true }),
      );
      await expect(
        service.convidarMembro(orgId, { email: 'admin@teste.com' }, admin),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(model.updateOne).not.toHaveBeenCalled();
    });

    it('só o administrador da organização aprovada convida', async () => {
      await expect(
        service.convidarMembro(orgId, { email: 'convidada@teste.com' }, usuario),
      ).rejects.toBeInstanceOf(ForbiddenException);
      organizacao.status = StatusOrganizacao.PENDENTE;
      await expect(
        service.convidarMembro(orgId, { email: 'convidada@teste.com' }, admin),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(usuarios.findOne).not.toHaveBeenCalled();
    });

    it('aceitar torna a pessoa membro aprovado', async () => {
      vincular(StatusMembroOrganizacao.CONVIDADO);
      await expect(service.responderConvite(orgId, usuario, { aceitar: true })).resolves.toEqual({
        mensagem: 'Convite aceito',
        aceito: true,
      });
      const [filtro, alteracao, opcoes] = model.updateOne.mock.calls[0];
      expect(filtro.status).toBe(StatusOrganizacao.APROVADA);
      expect(alteracao.$set['membros.$[alvo].status']).toBe(StatusMembroOrganizacao.APROVADO);
      expect(opcoes.arrayFilters[0]['alvo.status']).toBe(StatusMembroOrganizacao.CONVIDADO);
    });

    it('recusar apaga o convite, mesmo com a organização revogada', async () => {
      vincular(StatusMembroOrganizacao.CONVIDADO);
      organizacao.status = StatusOrganizacao.REVOGADA;
      await expect(service.responderConvite(orgId, usuario, { aceitar: false })).resolves.toEqual({
        mensagem: 'Convite recusado',
        aceito: false,
      });
      expect(model.updateOne).toHaveBeenCalledWith(
        expect.not.objectContaining({ status: StatusOrganizacao.APROVADA }),
        {
          $pull: {
            membros: {
              usuario_id: new Types.ObjectId(usuario),
              status: StatusMembroOrganizacao.CONVIDADO,
            },
          },
        },
      );
    });

    it('não aceita convite em organização revogada nem responde sem convite', async () => {
      vincular(StatusMembroOrganizacao.CONVIDADO);
      organizacao.status = StatusOrganizacao.REVOGADA;
      await expect(
        service.responderConvite(orgId, usuario, { aceitar: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.responderConvite(orgId, admin, { aceitar: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(model.updateOne).not.toHaveBeenCalled();
    });

    it('detecta convite alterado durante a resposta', async () => {
      vincular(StatusMembroOrganizacao.CONVIDADO);
      model.updateOne.mockReturnValue(consulta({ modifiedCount: 0 }));
      await expect(
        service.responderConvite(orgId, usuario, { aceitar: true }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
