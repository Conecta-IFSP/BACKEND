import { Readable, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type Connection, Model, Types } from 'mongoose';
import { ReunioesService } from './reunioes.service.js';
import type { ContadorDocument } from './schemas/contador.schema.js';
import {
  RespostaConvite,
  type ReuniaoDocument,
  SituacaoReuniao,
} from './schemas/reuniao.schema.js';
import type { ComissaoDocument } from '../comissoes/schemas/comissao.schema.js';
import type { OrganizacaoDocument } from '../organizacoes/schemas/organizacao.schema.js';
import type { UsuarioDocument } from '../usuarios/schemas/usuario.schema.js';
import { MAXIMO_ANEXOS } from './anexos.js';

const responsavelId = new Types.ObjectId().toString();
const membroId = new Types.ObjectId().toString();
const externoId = new Types.ObjectId().toString();
const reuniaoId = new Types.ObjectId().toString();
const AGORA = new Date('2026-11-09T12:00:00.000Z');

const consulta = (valor: unknown) => {
  const query = { exec: vi.fn().mockResolvedValue(valor) };
  return query;
};

function documento(dados: Record<string, unknown>) {
  const doc = { ...dados, populate: vi.fn(), toObject: vi.fn(() => dados) };
  doc.populate.mockResolvedValue(doc);
  return doc;
}

function anexo(nome = 'pauta.pdf') {
  return {
    _id: new Types.ObjectId(),
    nome,
    tipo: 'application/pdf',
    tamanho: 1200,
    enviado_em: AGORA,
  };
}

function preparar({
  anexos = [] as ReturnType<typeof anexo>[],
  situacao = SituacaoReuniao.AGENDADA,
  fim = new Date('2026-11-09T15:00:00.000Z'),
  atualizar = true,
} = {}) {
  const reuniao = documento({
    _id: new Types.ObjectId(reuniaoId),
    titulo: 'Fechamento do orçamento',
    inicio: new Date('2026-11-09T14:00:00.000Z'),
    fim,
    situacao,
    criada_por: new Types.ObjectId(responsavelId),
    participantes: [
      { usuario_id: new Types.ObjectId(responsavelId), convite: RespostaConvite.ACEITO },
      { usuario_id: new Types.ObjectId(membroId), convite: RespostaConvite.PENDENTE },
    ],
    anexos,
  });
  const reunioes = {
    findById: vi.fn(() => consulta(reuniao)),
    findOneAndUpdate: vi.fn(() => consulta(atualizar ? reuniao : null)),
  };
  const usuarios = { findById: vi.fn(() => consulta({ ativo: true })) };
  const service = new ReunioesService(
    reunioes as unknown as Model<ReuniaoDocument>,
    {} as Model<ComissaoDocument>,
    {} as Model<OrganizacaoDocument>,
    usuarios as unknown as Model<UsuarioDocument>,
    {} as Connection,
    {} as Model<ContadorDocument>,
  );
  const idArquivo = new Types.ObjectId();
  const arquivos = {
    openUploadStream: vi.fn(() =>
      Object.assign(new Writable({ write: (_parte, _codificacao, pronto) => pronto() }), {
        id: idArquivo,
      }),
    ),
    openDownloadStream: vi.fn(() => Readable.from(['conteúdo'])),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  vi.spyOn(service as unknown as { arquivos: () => unknown }, 'arquivos').mockReturnValue(arquivos);
  return { service, reunioes, arquivos, idArquivo };
}

const pdf = {
  // O multer entrega o nome em latin1; o service converte de volta para UTF-8.
  originalname: Buffer.from('Relatório de gastos.pdf', 'utf8').toString('latin1'),
  mimetype: 'application/pdf',
  size: 2048,
  buffer: Buffer.from('%PDF-1.7'),
};

describe('Anexos da reunião', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AGORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('quem agendou anexa um PDF, com o nome acentuado preservado', async () => {
    const { service, reunioes, arquivos, idArquivo } = preparar();
    await service.adicionarAnexo(reuniaoId, pdf, responsavelId);
    expect(arquivos.openUploadStream).toHaveBeenCalledWith(
      'Relatório de gastos.pdf',
      expect.anything(),
    );
    expect(reunioes.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ situacao: SituacaoReuniao.AGENDADA }),
      {
        $push: {
          anexos: expect.objectContaining({
            _id: idArquivo,
            nome: 'Relatório de gastos.pdf',
            tipo: 'application/pdf',
            tamanho: 2048,
          }),
        },
      },
      expect.anything(),
    );
    expect(arquivos.delete).not.toHaveBeenCalled();
  });

  it('só quem agendou pode anexar', async () => {
    const { service, arquivos } = preparar();
    await expect(service.adicionarAnexo(reuniaoId, pdf, membroId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(arquivos.openUploadStream).not.toHaveBeenCalled();
  });

  it('recusa tipo de arquivo fora da lista, arquivo ausente e mais de 10 anexos', async () => {
    const { service, arquivos } = preparar();
    await expect(
      service.adicionarAnexo(reuniaoId, { ...pdf, mimetype: 'application/x-msdownload' }, responsavelId),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.adicionarAnexo(reuniaoId, undefined, responsavelId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const cheia = preparar({ anexos: Array.from({ length: MAXIMO_ANEXOS }, () => anexo()) });
    await expect(cheia.service.adicionarAnexo(reuniaoId, pdf, responsavelId)).rejects.toThrow(
      'A reunião já tem 10 anexos',
    );
    expect(arquivos.openUploadStream).not.toHaveBeenCalled();
  });

  it('não anexa em reunião cancelada ou que já terminou', async () => {
    const cancelada = preparar({ situacao: SituacaoReuniao.CANCELADA });
    await expect(cancelada.service.adicionarAnexo(reuniaoId, pdf, responsavelId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const terminada = preparar({ fim: new Date('2026-11-09T11:00:00.000Z') });
    await expect(terminada.service.adicionarAnexo(reuniaoId, pdf, responsavelId)).rejects.toThrow(
      'Esta reunião já terminou',
    );
  });

  it('apaga o arquivo quando a reunião muda durante o envio', async () => {
    const { service, arquivos, idArquivo } = preparar({ atualizar: false });
    await expect(service.adicionarAnexo(reuniaoId, pdf, responsavelId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(arquivos.delete).toHaveBeenCalledWith(idArquivo);
  });

  it('qualquer participante abre o anexo; quem não participa, não', async () => {
    const existente = anexo();
    const { service, arquivos } = preparar({ anexos: [existente] });
    const { anexo: aberto } = await service.abrirAnexo(reuniaoId, existente._id.toString(), membroId);
    expect(aberto.nome).toBe('pauta.pdf');
    expect(arquivos.openDownloadStream).toHaveBeenCalledWith(existente._id);
    await expect(
      service.abrirAnexo(reuniaoId, existente._id.toString(), externoId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.abrirAnexo(reuniaoId, new Types.ObjectId().toString(), membroId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('quem agendou remove o anexo e o arquivo é apagado', async () => {
    const existente = anexo();
    const { service, reunioes, arquivos } = preparar({ anexos: [existente] });
    await service.removerAnexo(reuniaoId, existente._id.toString(), responsavelId);
    expect(reunioes.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ 'anexos._id': existente._id }),
      { $pull: { anexos: { _id: existente._id } } },
      expect.anything(),
    );
    expect(arquivos.delete).toHaveBeenCalledWith(existente._id);
    await expect(
      service.removerAnexo(reuniaoId, existente._id.toString(), membroId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
