import { vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ComissoesService } from './comissoes.service.js';
import { ComissaoDocument, PapelComissao } from './schemas/comissao.schema.js';
import { OrganizacaoDocument } from '../organizacoes/schemas/organizacao.schema.js';
import { UsuarioDocument } from '../usuarios/schemas/usuario.schema.js';
import { CreateComissaoDto } from './dto/create-comissao.dto.js';
import { UpdateComissaoDto } from './dto/update-comissao.dto.js';
import { UpdateMembroComissaoDto } from './dto/update-membro-comissao.dto.js';

const adminId = new Types.ObjectId().toString();
const membroId = new Types.ObjectId().toString();
const organizacaoId = new Types.ObjectId().toString();
const comissaoId = new Types.ObjectId().toString();
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

describe('Regras de comissões', () => {
  function preparar({
    papel = 'ADMIN',
    statusMembro = 'APROVADO',
    statusOrganizacao = 'APROVADA',
    usuarioAtivo = true,
    comissaoAtiva = true,
    elegivel = true,
  } = {}) {
    const organizacao = {
      _id: new Types.ObjectId(organizacaoId),
      status: statusOrganizacao,
      membros: [
        {
          usuario_id: new Types.ObjectId(adminId),
          papel,
          status: statusMembro,
        },
        {
          usuario_id: new Types.ObjectId(membroId),
          papel: 'MEMBRO',
          status: 'APROVADO',
        },
      ],
    };
    const comissao = {
      _id: comissaoId,
      organizacao_id: new Types.ObjectId(organizacaoId),
      ativo: comissaoAtiva,
      membros: [
        {
          usuario_id: new Types.ObjectId(adminId),
          papel: PapelComissao.RESPONSAVEL,
        },
        {
          usuario_id: new Types.ObjectId(membroId),
          papel: PapelComissao.MEMBRO,
        },
      ],
      populate: vi.fn(),
    };
    comissao.populate.mockResolvedValue(comissao);
    const comissoes = {
      findById: vi.fn(() => consulta(comissao)),
      create: vi.fn().mockResolvedValue(comissao),
      find: vi.fn(() => consulta([comissao])),
      findOneAndUpdate: vi.fn(() => consulta(comissao)),
      findByIdAndUpdate: vi.fn(() => consulta(comissao)),
    };
    const organizacoes = {
      findById: vi.fn(() => consulta(organizacao)),
      find: vi.fn(() => consulta([organizacao])),
    };
    const usuarios = {
      findById: vi.fn(() => consulta({ ativo: usuarioAtivo })),
      find: vi.fn(() =>
        consulta(elegivel ? [{ _id: new Types.ObjectId(membroId) }] : []),
      ),
    };
    const service = new ComissoesService(
      comissoes as unknown as Model<ComissaoDocument>,
      organizacoes as unknown as Model<OrganizacaoDocument>,
      usuarios as unknown as Model<UsuarioDocument>,
    );
    return { service, comissoes, organizacoes, usuarios, comissao };
  }

  it('permite ao membro consultar somente suas comissões na organização escolhida', async () => {
    const { service, comissoes } = preparar();
    const resultado = await service.listarMinhas(organizacaoId, membroId);
    expect(comissoes.find).toHaveBeenCalledWith({
      organizacao_id: new Types.ObjectId(organizacaoId),
      'membros.usuario_id': new Types.ObjectId(membroId),
    });
    expect(resultado.comissoes[0].meu_papel).toBe('MEMBRO');
    expect(resultado.comissoes[0]).not.toHaveProperty('membros');
    await expect(
      service.atualizar(comissaoId, { nome: 'Alteração' }, membroId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    { statusMembro: 'PENDENTE' },
    { statusMembro: 'REJEITADO' },
    { statusOrganizacao: 'REVOGADA' },
    { statusOrganizacao: 'PENDENTE' },
    { usuarioAtivo: false },
  ])(
    'bloqueia consulta de participação sem vínculo válido: %j',
    async (opcoes) => {
      const { service, comissoes } = preparar(opcoes);
      await expect(
        service.listarMinhas(organizacaoId, adminId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(comissoes.find).not.toHaveBeenCalled();
    },
  );

  it('bloqueia consulta por usuário externo e aceita ausência de comissões', async () => {
    const { service, comissoes } = preparar();
    await expect(
      service.listarMinhas(organizacaoId, new Types.ObjectId().toString()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    comissoes.find.mockReturnValue(consulta([]));
    expect(
      (await service.listarMinhas(organizacaoId, membroId)).comissoes,
    ).toEqual([]);
  });

  it('permite cadastrar na organização administrada e inicia equipe com exatamente um responsável', async () => {
    const { service, comissoes } = preparar();
    await service.criar(
      {
        nome: 'Eventos',
        organizacao_id: organizacaoId,
        responsavel_id: membroId,
      },
      adminId,
    );
    expect(comissoes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: 'Eventos',
        membros: [
          expect.objectContaining({
            usuario_id: new Types.ObjectId(membroId),
            papel: 'RESPONSAVEL',
          }),
        ],
        ativo: true,
      }),
    );
  });

  it.each([
    { papel: 'MEMBRO' },
    { statusMembro: 'PENDENTE' },
    { statusMembro: 'REJEITADO' },
    { statusOrganizacao: 'REVOGADA' },
    { statusOrganizacao: 'PENDENTE' },
    { usuarioAtivo: false },
  ])('impede cadastro sem autorização: %j', async (opcoes) => {
    const { service, comissoes } = preparar(opcoes);
    await expect(
      service.criar(
        {
          nome: 'Eventos',
          organizacao_id: organizacaoId,
          responsavel_id: membroId,
        },
        adminId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(comissoes.create).not.toHaveBeenCalled();
  });

  it('impede consultar e alterar comissão de outra organização', async () => {
    const { service, comissoes } = preparar();
    const externo = new Types.ObjectId().toString();
    await expect(
      service.buscarPorId(comissaoId, externo),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.atualizar(comissaoId, { nome: 'Outro' }, externo),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remover(comissaoId, externo)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.adicionarMembro(comissaoId, { usuario_id: membroId }, externo),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.removerMembro(comissaoId, membroId, externo),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.atualizarMembro(
        comissaoId,
        membroId,
        PapelComissao.RESPONSAVEL,
        externo,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(comissoes.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(comissoes.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('administrador lista todas as comissões das organizações que administra', async () => {
    const { service, comissoes, organizacoes } = preparar();
    await service.listar(adminId);
    expect(organizacoes.find).toHaveBeenCalledWith({
      status: 'APROVADA',
      membros: {
        $elemMatch: {
          usuario_id: new Types.ObjectId(adminId),
          status: 'APROVADO',
        },
      },
    });
    expect(comissoes.find).toHaveBeenCalledWith({
      $or: [
        { organizacao_id: { $in: [new Types.ObjectId(organizacaoId)] } },
        {
          organizacao_id: { $in: [] },
          'membros.usuario_id': new Types.ObjectId(adminId),
        },
      ],
    });
  });

  it('membro comum lista só as comissões de cuja equipe participa', async () => {
    const { service, comissoes } = preparar();
    await service.listar(membroId);
    expect(comissoes.find).toHaveBeenCalledWith({
      $or: [
        { organizacao_id: { $in: [] } },
        {
          organizacao_id: { $in: [new Types.ObjectId(organizacaoId)] },
          'membros.usuario_id': new Types.ObjectId(membroId),
        },
      ],
    });
  });

  it('filtrando pela organização, o administrador vê todas e o membro só as suas', async () => {
    const { service, comissoes } = preparar();
    await service.listar(adminId, organizacaoId);
    expect(comissoes.find).toHaveBeenLastCalledWith({
      organizacao_id: new Types.ObjectId(organizacaoId),
    });
    await service.listar(membroId, organizacaoId);
    expect(comissoes.find).toHaveBeenLastCalledWith({
      organizacao_id: new Types.ObjectId(organizacaoId),
      'membros.usuario_id': new Types.ObjectId(membroId),
    });
  });

  it.each([
    { statusOrganizacao: 'REVOGADA' },
    { statusOrganizacao: 'PENDENTE' },
    { usuarioAtivo: false },
  ])('não mostra comissões sem vínculo válido: %j', async (opcoes) => {
    const { service, comissoes } = preparar(opcoes);
    await expect(
      service.listar(membroId, organizacaoId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.buscarPorId(comissaoId, membroId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const externo = new Types.ObjectId().toString();
    await expect(service.listar(externo, organizacaoId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(comissoes.find).not.toHaveBeenCalled();
  });

  it('integrante consulta a comissão, mas não a gerencia', async () => {
    const { service, comissoes, comissao } = preparar();
    await expect(service.buscarPorId(comissaoId, membroId)).resolves.toBe(
      comissao,
    );
    await expect(
      service.atualizar(comissaoId, { nome: 'Outro' }, membroId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remover(comissaoId, membroId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.adicionarMembro(comissaoId, { usuario_id: membroId }, membroId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.atualizarMembro(
        comissaoId,
        membroId,
        PapelComissao.RESPONSAVEL,
        membroId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.removerMembro(comissaoId, membroId, membroId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.listarMembrosDisponiveis(organizacaoId, membroId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(comissoes.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(comissoes.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('membro aprovado fora da equipe não consulta a comissão', async () => {
    const { service, comissao } = preparar();
    comissao.membros = [];
    await expect(
      service.buscarPorId(comissaoId, membroId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.buscarPorId(comissaoId, adminId)).resolves.toBe(
      comissao,
    );
  });

  it('desativa sem apagar equipe e permite reativação', async () => {
    const { service, comissoes } = preparar();
    await service.remover(comissaoId, adminId);
    expect(comissoes.findByIdAndUpdate).toHaveBeenLastCalledWith(
      comissaoId,
      { $set: { ativo: false } },
      expect.anything(),
    );
    await service.atualizar(comissaoId, { ativo: true }, adminId);
    expect(comissoes.findByIdAndUpdate).toHaveBeenLastCalledWith(
      comissaoId,
      { $set: { ativo: true } },
      expect.anything(),
    );
  });

  it('rejeita candidato que não é ativo/aprovado na organização', async () => {
    const { service, comissoes } = preparar({ elegivel: false });
    await expect(
      service.adicionarMembro(comissaoId, { usuario_id: membroId }, adminId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(comissoes.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('inclui integrante e detecta escrita concorrente sem perder a equipe', async () => {
    const { service, comissoes, comissao } = preparar();
    comissao.membros = comissao.membros.filter(
      (m) => m.papel === PapelComissao.RESPONSAVEL,
    );
    await service.adicionarMembro(
      comissaoId,
      { usuario_id: membroId },
      adminId,
    );
    expect(comissoes.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ ativo: true, membros: comissao.membros }),
      {
        $set: {
          membros: [
            expect.objectContaining({ papel: 'RESPONSAVEL' }),
            expect.objectContaining({ papel: 'MEMBRO' }),
          ],
        },
      },
      expect.objectContaining({ runValidators: true }),
    );
    comissoes.findOneAndUpdate.mockReturnValue(consulta(null));
    await expect(
      service.adicionarMembro(comissaoId, { usuario_id: membroId }, adminId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('substitui responsável em uma escrita e mantém o anterior como membro', async () => {
    const { service, comissoes } = preparar();
    await service.definirResponsavel(comissaoId, membroId, adminId);
    const membros = comissoes.findOneAndUpdate.mock.calls[0][1].$set.membros;
    expect(membros.filter((m) => m.papel === 'RESPONSAVEL')).toHaveLength(1);
    expect(membros.find((m) => m.usuario_id.toString() === adminId).papel).toBe(
      'MEMBRO',
    );
    expect(
      membros.find((m) => m.usuario_id.toString() === membroId).papel,
    ).toBe('RESPONSAVEL');
  });

  it('remove apenas membro comum e preserva responsável', async () => {
    const { service, comissoes } = preparar();
    await service.removerMembro(comissaoId, membroId, adminId);
    expect(comissoes.findOneAndUpdate.mock.calls[0][1].$set.membros).toEqual([
      expect.objectContaining({
        usuario_id: new Types.ObjectId(adminId),
        papel: 'RESPONSAVEL',
      }),
    ]);
  });

  it('recusa remover ou rebaixar o responsável e adicionar outro responsável', async () => {
    const { service, comissoes } = preparar();
    await expect(
      service.removerMembro(comissaoId, adminId, adminId),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.atualizarMembro(
        comissaoId,
        adminId,
        PapelComissao.MEMBRO,
        adminId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.adicionarMembro(
        comissaoId,
        { usuario_id: membroId, papel: PapelComissao.RESPONSAVEL },
        adminId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(comissoes.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([0, 2])(
    'regulariza legado com %i responsáveis, inclusive inativo',
    async (quantidade) => {
      const { service, comissoes, comissao } = preparar({
        comissaoAtiva: false,
      });
      comissao.membros.forEach((m) => {
        m.papel =
          quantidade === 0 ? PapelComissao.MEMBRO : PapelComissao.RESPONSAVEL;
      });
      await expect(
        service.atualizar(comissaoId, { ativo: true }, adminId),
      ).rejects.toBeInstanceOf(BadRequestException);
      await service.definirResponsavel(comissaoId, membroId, adminId);
      expect(comissoes.findOneAndUpdate.mock.calls[0][0].ativo).toBe(false);
      expect(
        comissoes.findOneAndUpdate.mock.calls[0][1].$set.membros.filter(
          (m) => m.papel === 'RESPONSAVEL',
        ),
      ).toHaveLength(1);
    },
  );

  it('recusa troca para pessoa inelegível e troca concorrente', async () => {
    const inelegivel = preparar({ elegivel: false });
    await expect(
      inelegivel.service.definirResponsavel(comissaoId, membroId, adminId),
    ).rejects.toBeInstanceOf(BadRequestException);
    const { service, comissoes } = preparar();
    comissoes.findOneAndUpdate.mockReturnValue(consulta(null));
    await expect(
      service.definirResponsavel(comissaoId, membroId, adminId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('bloqueia gerenciamento da equipe inativa', async () => {
    const { service, comissoes } = preparar({ comissaoAtiva: false });
    await expect(
      service.adicionarMembro(comissaoId, { usuario_id: membroId }, adminId),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.atualizarMembro(
        comissaoId,
        membroId,
        PapelComissao.RESPONSAVEL,
        adminId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.removerMembro(comissaoId, membroId, adminId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(comissoes.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('trata ID inválido e integrante inexistente', async () => {
    const { service } = preparar();
    await expect(
      service.buscarPorId('invalido', adminId),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.removerMembro(
        comissaoId,
        new Types.ObjectId().toString(),
        adminId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exige responsável no DTO de criação', async () => {
    const erros = await validate(
      plainToInstance(CreateComissaoDto, {
        nome: 'Eventos',
        organizacao_id: organizacaoId,
      }),
    );
    expect(erros.some((e) => e.property === 'responsavel_id')).toBe(true);
  });

  it('valida nome vazio, tamanho máximo, nulos e papel inválido', async () => {
    for (const nome of ['  ', 'a', 'a'.repeat(101), null]) {
      expect(
        await validate(
          plainToInstance(CreateComissaoDto, {
            nome,
            organizacao_id: organizacaoId,
            responsavel_id: membroId,
          }),
        ),
      ).not.toHaveLength(0);
      expect(
        await validate(plainToInstance(UpdateComissaoDto, { nome })),
      ).not.toHaveLength(0);
    }
    expect(
      await validate(plainToInstance(UpdateComissaoDto, { ativo: null })),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(UpdateMembroComissaoDto, { papel: 'ADMIN' }),
      ),
    ).not.toHaveLength(0);
    const dto = plainToInstance(CreateComissaoDto, {
      nome: ' Eventos ',
      organizacao_id: organizacaoId,
      responsavel_id: membroId,
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.nome).toBe('Eventos');
  });
});
