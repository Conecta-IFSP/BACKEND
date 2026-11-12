import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Reuniao, ReuniaoDocument, SituacaoPresenca, SituacaoReuniao } from '../reunioes/schemas/reuniao.schema.js';
import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema.js';
import type { RelatorioIndividualDto } from './relatorio-individual.dto.js';

type ComissaoRelatorio = { nome: string; organizacao_id?: { nome: string } | null };

@Injectable()
export class RelatoriosService {
  constructor(
    @InjectModel(Reuniao.name) private readonly reunioes: Model<ReuniaoDocument>,
    @InjectModel(Usuario.name) private readonly usuarios: Model<UsuarioDocument>,
  ) {}

  async individual(usuarioId: string, filtros: RelatorioIndividualDto) {
    const de = filtros.de ? new Date(filtros.de) : null;
    const ate = filtros.ate ? new Date(filtros.ate) : null;
    if ((de && !Number.isFinite(de.getTime())) || (ate && !Number.isFinite(ate.getTime())) || (de && ate && de >= ate)) {
      throw new BadRequestException('O fim do período deve ser posterior ao início');
    }
    if (!Types.ObjectId.isValid(usuarioId)) throw new UnauthorizedException();
    const usuario = await this.usuarios.findById(usuarioId).select('nome email ativo').lean().exec();
    if (!usuario || !usuario.ativo) throw new UnauthorizedException();
    const geradaEm = new Date();
    const registros = await this.reunioes.find({
      situacao: SituacaoReuniao.AGENDADA,
      inicio: { $lte: geradaEm, ...(de ? { $gte: de } : {}), ...(ate ? { $lt: ate } : {}) },
      participantes: { $elemMatch: {
        // Compatibilidade com referências antigas salvas como string no schema existente.
        usuario_id: { $in: [new Types.ObjectId(usuarioId), usuarioId] },
        'presenca.situacao': SituacaoPresenca.CONFIRMADA,
        'presenca.entrada': { $lte: geradaEm },
      } },
    })
      .select('titulo local inicio fim dia_inteiro comissao_id participantes')
      .populate<{ comissao_id: ComissaoRelatorio | null }>({
        path: 'comissao_id', select: 'nome organizacao_id',
        populate: { path: 'organizacao_id', select: 'nome' },
      })
      .sort({ inicio: -1, _id: -1 }).lean().exec();

    const reunioes = registros.flatMap(reuniao => {
      const presenca = reuniao.participantes.find(p => p.usuario_id?.toString() === usuarioId)?.presenca;
      if (!presenca || presenca.situacao !== SituacaoPresenca.CONFIRMADA) return [];
      const entrada = new Date(presenca.entrada);
      const saida = presenca.saida ? new Date(presenca.saida) : null;
      const intervaloValido = saida && Number.isFinite(saida.getTime()) && saida >= entrada && saida <= geradaEm;
      const minutos = intervaloValido ? Math.floor((saida.getTime() - entrada.getTime()) / 60000) : null;
      return [{
        reuniao_id: reuniao._id.toString(), titulo: reuniao.titulo,
        comissao: reuniao.comissao_id?.nome ?? 'Comissão indisponível',
        organizacao: reuniao.comissao_id?.organizacao_id?.nome ?? 'Organização indisponível',
        local: reuniao.local || null, inicio: reuniao.inicio, fim: reuniao.fim,
        dia_inteiro: Boolean(reuniao.dia_inteiro), entrada, saida, minutos,
      }];
    });
    return {
      usuario: { nome: usuario.nome, email: usuario.email },
      gerada_em: geradaEm, periodo: { de, ate },
      resumo: {
        reunioes: reunioes.length,
        minutos_registrados: reunioes.reduce((soma, r) => soma + (r.minutos ?? 0), 0),
        registros_sem_duracao: reunioes.filter(r => r.minutos === null).length,
      },
      reunioes,
    };
  }
}
