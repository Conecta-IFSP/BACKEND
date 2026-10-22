import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { ReunioesService } from './reunioes.service.js';
import type { ReuniaoDocument } from './schemas/reuniao.schema.js';
import type { ComissaoDocument } from '../comissoes/schemas/comissao.schema.js';
import type { OrganizacaoDocument } from '../organizacoes/schemas/organizacao.schema.js';
import type { UsuarioDocument } from '../usuarios/schemas/usuario.schema.js';

const autor = new Types.ObjectId();
const membro = new Types.ObjectId();
const id = new Types.ObjectId();
const consulta = (valor: unknown) => ({
  exec: vi.fn().mockResolvedValue(valor),
  select: vi.fn().mockReturnThis(),
});
function preparar() {
  const reuniao: any = {
    _id: id,
    titulo: 'Reunião de planejamento',
    comissao_id: new Types.ObjectId(),
    criada_por: autor,
    situacao: 'AGENDADA',
    inicio: new Date('2026-01-01T10:00Z'),
    fim: new Date('2026-01-01T11:00Z'),
    participantes: [autor, membro].map((usuario_id) => ({
      usuario_id,
      convite: 'ACEITO',
      presenca: {
        entrada: new Date('2026-01-01T10:00Z'),
        saida: new Date('2026-01-01T11:00Z'),
        situacao: 'CONFIRMADA',
      },
    })),
    populate: vi.fn().mockImplementation(async () => reuniao),
  };
  const reunioes = {
    findById: vi.fn(() => consulta(reuniao)),
    findOneAndUpdate: vi.fn(() => consulta(reuniao)),
  };
  const comissoes = {
    findById: vi.fn(() =>
      consulta({
        ativo: true,
        organizacao_id: new Types.ObjectId(),
        membros: [{ usuario_id: autor, papel: 'RESPONSAVEL' }],
      }),
    ),
  };
  const organizacoes = {
    findById: vi.fn(() =>
      consulta({
        status: 'APROVADA',
        membros: [{ usuario_id: autor, status: 'APROVADO' }],
      }),
    ),
  };
  const usuarios = {
    findById: vi.fn(() => consulta({ ativo: true })),
    find: vi.fn(() =>
      consulta([
        { _id: autor, nome: 'Ana' },
        { _id: membro, nome: 'Bruno' },
      ]),
    ),
  };
  const service = new ReunioesService(
    reunioes as unknown as Model<ReuniaoDocument>,
    comissoes as unknown as Model<ComissaoDocument>,
    organizacoes as unknown as Model<OrganizacaoDocument>,
    usuarios as unknown as Model<UsuarioDocument>,
  );
  const ata = {
    conteudo: 'Decidimos realizar a atividade em novembro.',
    versao: 1,
    situacao: 'RASCUNHO',
    autor_id: autor,
    atualizada_em: new Date(),
    aprovadores: [],
    aprovacoes: [],
  };
  return { service, reunioes, reuniao, ata, usuarios };
}

describe('Atas e relatório de presença', () => {
  it('salva ata versionada apenas pelo responsável e protege ausência inicial', async () => {
    const { service, reunioes } = preparar();
    await service.salvarAta(
      id.toString(),
      { conteudo: 'Uma decisão com conteúdo suficiente.', versao: 0 },
      autor.toString(),
    );
    expect(reunioes.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ ata: { $exists: false } }),
      {
        $set: {
          ata: expect.objectContaining({
            versao: 1,
            situacao: 'RASCUNHO',
            aprovadores: [],
          }),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
  });
  it('recusa participante comum como autor e pessoa externa como leitora', async () => {
    const { service } = preparar();
    await expect(
      service.salvarAta(
        id.toString(),
        { conteudo: 'Uma decisão com conteúdo suficiente.', versao: 0 },
        membro.toString(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.gerarListaPresenca(
        id.toString(),
        new Types.ObjectId().toString(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('recusa edição antes do fim, cancelamento e versão obsoleta', async () => {
    const { service, reuniao, ata } = preparar();
    reuniao.fim = new Date(Date.now() + 60000);
    await expect(
      service.salvarAta(
        id.toString(),
        { conteudo: ata.conteudo, versao: 0 },
        autor.toString(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    reuniao.fim = new Date(0);
    reuniao.situacao = 'CANCELADA';
    await expect(
      service.salvarAta(
        id.toString(),
        { conteudo: ata.conteudo, versao: 0 },
        autor.toString(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    reuniao.situacao = 'AGENDADA';
    reuniao.ata = ata;
    await expect(
      service.salvarAta(
        id.toString(),
        { conteudo: ata.conteudo, versao: 0 },
        autor.toString(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('publica congelando os aprovadores com presença confirmada', async () => {
    const { service, reuniao, reunioes, ata } = preparar();
    reuniao.ata = ata;
    await service.publicarAta(id.toString(), 1, autor.toString());
    expect(
      reunioes.findOneAndUpdate.mock.calls[0][1].$set.ata.aprovadores,
    ).toEqual([autor, membro]);
    reuniao.participantes.forEach((p: any) => {
      p.presenca.situacao = 'AGUARDANDO';
    });
    await expect(
      service.publicarAta(id.toString(), 1, autor.toString()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('exige todas as aprovações e não altera texto publicado', async () => {
    const { service, reuniao, reunioes, ata } = preparar();
    reuniao.ata = {
      ...ata,
      situacao: 'EM_APROVACAO',
      aprovadores: [autor, membro],
      aprovacoes: [],
    };
    await service.aprovarAta(id.toString(), 1, autor.toString());
    expect(reunioes.findOneAndUpdate.mock.calls[0][1].$set.ata.situacao).toBe(
      'EM_APROVACAO',
    );
    reuniao.ata.aprovacoes = [autor];
    await service.aprovarAta(id.toString(), 1, membro.toString());
    expect(reunioes.findOneAndUpdate.mock.calls[1][1].$set.ata.situacao).toBe(
      'APROVADA',
    );
    await expect(
      service.salvarAta(
        id.toString(),
        { conteudo: ata.conteudo, versao: 1 },
        autor.toString(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('não conta aprovação duplicada e rejeita voto fora do conjunto', async () => {
    const { service, reuniao, reunioes, ata } = preparar();
    reuniao.ata = {
      ...ata,
      situacao: 'EM_APROVACAO',
      aprovadores: [autor],
      aprovacoes: [autor],
    };
    await service.aprovarAta(id.toString(), 1, autor.toString());
    expect(reunioes.findOneAndUpdate).not.toHaveBeenCalled();
    await expect(
      service.aprovarAta(id.toString(), 1, membro.toString()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('informa conflito quando outra escrita alterou a ata', async () => {
    const { service, reunioes } = preparar();
    reunioes.findOneAndUpdate.mockReturnValue(consulta(null));
    await expect(
      service.salvarAta(
        id.toString(),
        { conteudo: 'Uma decisão com conteúdo suficiente.', versao: 0 },
        autor.toString(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('gera lista com nomes, situações, duração e ausência de saída sem inventar presença', async () => {
    const { service, reuniao } = preparar();
    delete reuniao.participantes[1].presenca;
    const lista = await service.gerarListaPresenca(
      id.toString(),
      autor.toString(),
    );
    expect(lista.participantes[0]).toMatchObject({
      nome: 'Ana',
      situacao: 'CONFIRMADA',
      minutos: 60,
    });
    expect(lista.participantes[1]).toMatchObject({
      nome: 'Bruno',
      situacao: 'SEM_REGISTRO',
      minutos: null,
      entrada: null,
      saida: null,
    });
  });
});
