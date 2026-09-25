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
        { usuario_id: new Types.ObjectId(adminId), papel, status: statusMembro },
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

  it('permite cadastrar na organização administrada e inicia equipe vazia', async () => {
    const { service, comissoes } = preparar();
    await service.criar({ nome: 'Eventos', organizacao_id: organizacaoId }, adminId);
    expect(comissoes.create).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Eventos', membros: [], ativo: true }),
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
      service.criar({ nome: 'Eventos', organizacao_id: organizacaoId }, adminId),
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

  it('lista somente comissões das organizações administradas', async () => {
    const { service, comissoes, organizacoes } = preparar();
    await service.listar(adminId);
    expect(organizacoes.find).toHaveBeenCalledWith(
      expect.objectContaining({
        membros: {
          $elemMatch: {
            usuario_id: new Types.ObjectId(adminId),
            papel: 'ADMIN',
            status: 'APROVADO',
          },
        },
      }),
    );
    expect(comissoes.find).toHaveBeenCalledWith({
      organizacao_id: { $in: [new Types.ObjectId(organizacaoId)] },
    });
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

  it('inclui integrante com filtro atômico contra duplicação', async () => {
    const { service, comissoes } = preparar();
    await service.adicionarMembro(comissaoId, { usuario_id: membroId }, adminId);
    expect(comissoes.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        ativo: true,
        'membros.usuario_id': { $ne: new Types.ObjectId(membroId) },
      }),
      expect.objectContaining({
        $push: {
          membros: expect.objectContaining({ papel: PapelComissao.MEMBRO }),
        },
      }),
      expect.anything(),
    );
    comissoes.findOneAndUpdate.mockReturnValue(consulta(null));
    await expect(
      service.adicionarMembro(comissaoId, { usuario_id: membroId }, adminId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('altera papel e remove apenas integrante da comissão', async () => {
    const { service, comissoes } = preparar();
    await service.atualizarMembro(
      comissaoId,
      membroId,
      PapelComissao.RESPONSAVEL,
      adminId,
    );
    expect(comissoes.findOneAndUpdate).toHaveBeenLastCalledWith(
      expect.anything(),
      { $set: { 'membros.$.papel': 'RESPONSAVEL' } },
      expect.anything(),
    );
    await service.removerMembro(comissaoId, membroId, adminId);
    expect(comissoes.findOneAndUpdate).toHaveBeenLastCalledWith(
      expect.anything(),
      { $pull: { membros: { usuario_id: new Types.ObjectId(membroId) } } },
      expect.anything(),
    );
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

  it('valida nome vazio, tamanho máximo, nulos e papel inválido', async () => {
    for (const nome of ['  ', 'a', 'a'.repeat(101), null]) {
      expect(
        await validate(
          plainToInstance(CreateComissaoDto, { nome, organizacao_id: organizacaoId }),
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
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.nome).toBe('Eventos');
  });
});
