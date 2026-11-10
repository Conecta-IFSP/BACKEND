import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { type Connection, Model, Types } from 'mongoose';
import { ReunioesService } from './reunioes.service.js';
import { EnviarAtaDto, ReprovarAtaDto } from './dto/ata.dto.js';
import type { ContadorDocument } from './schemas/contador.schema.js';
import type { ReuniaoDocument } from './schemas/reuniao.schema.js';
import type { ComissaoDocument } from '../comissoes/schemas/comissao.schema.js';
import type { OrganizacaoDocument } from '../organizacoes/schemas/organizacao.schema.js';
import type { UsuarioDocument } from '../usuarios/schemas/usuario.schema.js';

const autor = new Types.ObjectId();
const membro = new Types.ObjectId();
const id = new Types.ObjectId();
const comissaoId = new Types.ObjectId();
const TEXTO = 'Decidimos realizar a atividade em novembro.';
const consulta = (valor: unknown) => ({
  exec: vi.fn().mockResolvedValue(valor),
  select: vi.fn().mockReturnThis(),
  populate: vi.fn().mockReturnThis(),
  sort: vi.fn().mockReturnThis(),
});
function preparar() {
  const reuniao: any = {
    _id: id,
    titulo: 'Reunião de planejamento',
    comissao_id: comissaoId,
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
    find: vi.fn(() => consulta([])),
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
  const contadores = {
    findOneAndUpdate: vi.fn(() => consulta({ valor: 7 })),
  };
  const service = new ReunioesService(
    reunioes as unknown as Model<ReuniaoDocument>,
    comissoes as unknown as Model<ComissaoDocument>,
    organizacoes as unknown as Model<OrganizacaoDocument>,
    usuarios as unknown as Model<UsuarioDocument>,
    {} as Connection,
    contadores as unknown as Model<ContadorDocument>,
  );
  const ata = {
    conteudo: TEXTO,
    versao: 1,
    situacao: 'RASCUNHO',
    autor_id: autor,
    atualizada_em: new Date(),
    aprovadores: [] as Types.ObjectId[],
    avaliacoes: [] as Record<string, unknown>[],
  };
  const emAprovacao = (avaliacoes: Record<string, unknown>[] = []) => ({
    ...ata,
    situacao: 'EM_APROVACAO',
    aprovadores: [autor, membro],
    avaliacoes,
  });
  const gravacao = () =>
    (reunioes.findOneAndUpdate.mock.calls.at(-1) as unknown[])[1] as {
      $set: { ata: Record<string, any> };
      $push?: { atas_canceladas: Record<string, any> };
    };
  return {
    service,
    reunioes,
    reuniao,
    ata,
    emAprovacao,
    gravacao,
    contadores,
  };
}

const aprovacao = (usuario_id: Types.ObjectId) => ({
  usuario_id,
  decisao: 'APROVADA',
  em: new Date(),
});

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
            avaliacoes: [],
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
  it('envia com prazo, congela os presentes e já conta a aprovação de quem envia', async () => {
    const { service, reuniao, ata, gravacao } = preparar();
    reuniao.ata = ata;
    await service.publicarAta(
      id.toString(),
      { versao: 1, prazo_horas: 72 },
      autor.toString(),
    );
    const enviada = gravacao().$set.ata;
    expect(enviada.situacao).toBe('EM_APROVACAO');
    expect(enviada.aprovadores).toEqual([autor, membro]);
    expect(enviada.avaliacoes).toEqual([
      expect.objectContaining({ usuario_id: autor, decisao: 'APROVADA' }),
    ]);
    expect(enviada.prazo.getTime() - enviada.enviada_em.getTime()).toBe(
      72 * 3600000,
    );
    reuniao.participantes.forEach((p: any) => {
      p.presenca.situacao = 'AGUARDANDO';
    });
    await expect(
      service.publicarAta(
        id.toString(),
        { versao: 1, prazo_horas: 72 },
        autor.toString(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('só aprova com todos e então numera a ata na comissão e no ano', async () => {
    const { service, reuniao, emAprovacao, gravacao, contadores } = preparar();
    reuniao.ata = emAprovacao();
    await service.aprovarAta(id.toString(), 1, autor.toString());
    expect(gravacao().$set.ata.situacao).toBe('EM_APROVACAO');
    expect(contadores.findOneAndUpdate).not.toHaveBeenCalled();

    reuniao.ata = emAprovacao([aprovacao(autor)]);
    await service.aprovarAta(id.toString(), 1, membro.toString());
    const aprovada = gravacao().$set.ata;
    const ano = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
      }).format(aprovada.aprovada_em),
    );
    expect(aprovada).toMatchObject({ situacao: 'APROVADA', numero: 7, ano });
    expect(contadores.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: `atas:${comissaoId.toString()}:${ano}` },
      { $inc: { valor: 1 } },
      { upsert: true, returnDocument: 'after' },
    );
  });
  it('reprova com justificativa opcional apontando um trecho da própria ata', async () => {
    const { service, reuniao, emAprovacao, gravacao } = preparar();
    reuniao.ata = emAprovacao([aprovacao(autor)]);
    await service.reprovarAta(
      id.toString(),
      { versao: 1, trecho: TEXTO },
      membro.toString(),
    );
    const reprovada = gravacao().$set.ata;
    expect(reprovada.situacao).toBe('REPROVADA');
    expect(reprovada.avaliacoes[1]).toMatchObject({
      usuario_id: membro,
      decisao: 'REPROVADA',
      trecho: TEXTO,
      justificativa: undefined,
    });
    await expect(
      service.reprovarAta(
        id.toString(),
        { versao: 1, trecho: 'Texto que não está na ata.' },
        membro.toString(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('não deixa trocar a decisão nem avaliar quem não esteve presente', async () => {
    const { service, reuniao, reunioes, emAprovacao } = preparar();
    reuniao.ata = emAprovacao([aprovacao(membro)]);
    await service.aprovarAta(id.toString(), 1, membro.toString());
    expect(reunioes.findOneAndUpdate).not.toHaveBeenCalled();
    await expect(
      service.reprovarAta(id.toString(), { versao: 1 }, membro.toString()),
    ).rejects.toBeInstanceOf(BadRequestException);
    reuniao.ata.aprovadores = [autor];
    await expect(
      service.reprovarAta(id.toString(), { versao: 1 }, membro.toString()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('cancela a ata reprovada e abre uma nova com o mesmo texto', async () => {
    const { service, reuniao, emAprovacao, gravacao } = preparar();
    reuniao.ata = {
      ...emAprovacao([aprovacao(autor)]),
      situacao: 'REPROVADA',
    };
    await expect(
      service.salvarAta(
        id.toString(),
        { conteudo: TEXTO, versao: 1 },
        autor.toString(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.refazerAta(id.toString(), membro.toString()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await service.refazerAta(id.toString(), autor.toString());
    const { $set, $push } = gravacao();
    expect($push?.atas_canceladas).toMatchObject({
      situacao: 'CANCELADA',
      cancelada_em: expect.any(Date),
      avaliacoes: [expect.objectContaining({ usuario_id: autor })],
    });
    expect($set.ata).toMatchObject({
      conteudo: TEXTO,
      versao: 2,
      situacao: 'RASCUNHO',
      avaliacoes: [],
    });

    reuniao.ata = emAprovacao();
    await expect(
      service.refazerAta(id.toString(), autor.toString()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('lista como pendente a ata a avaliar e a ata reprovada de quem escreveu', async () => {
    const { service, reunioes } = preparar();
    await service.atasPendentes(membro.toString());
    expect(reunioes.find).toHaveBeenCalledWith({
      situacao: 'AGENDADA',
      $or: [
        {
          'ata.situacao': 'EM_APROVACAO',
          'ata.aprovadores': membro,
          'ata.avaliacoes.usuario_id': { $ne: membro },
        },
        { 'ata.situacao': 'REPROVADA', 'ata.autor_id': membro },
      ],
    });
  });
  it('valida o prazo de envio e deixa a justificativa opcional', async () => {
    const prazo = plainToInstance(EnviarAtaDto, { versao: 1, prazo_horas: 5 });
    expect(await validate(prazo)).toHaveLength(1);
    const vazia = plainToInstance(ReprovarAtaDto, {
      versao: 1,
      justificativa: '   ',
    });
    expect(await validate(vazia)).toHaveLength(0);
    expect(vazia.justificativa).toBeUndefined();
    const longa = plainToInstance(ReprovarAtaDto, {
      versao: 1,
      justificativa: 'x'.repeat(501),
    });
    expect(await validate(longa)).toHaveLength(1);
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
