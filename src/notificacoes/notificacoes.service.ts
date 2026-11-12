import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Reuniao, ReuniaoDocument } from '../reunioes/schemas/reuniao.schema.js';
import { Notificacao, NotificacaoDocument } from './notificacao.schema.js';

@Injectable()
export class NotificacoesService {
  constructor(
    @InjectModel(Notificacao.name) private readonly notificacoes: Model<NotificacaoDocument>,
    @InjectModel(Reuniao.name) private readonly reunioes: Model<ReuniaoDocument>,
  ) {}

  async criar(usuarioId: string, dados: Pick<Notificacao, 'chave' | 'titulo' | 'mensagem' | 'destino' | 'tipo'> & { expira_em?: Date }) {
    try {
      await this.notificacoes.updateOne({ usuario_id: new Types.ObjectId(usuarioId), chave: dados.chave },
        { $setOnInsert: { ...dados, usuario_id: new Types.ObjectId(usuarioId) } }, { upsert: true }).exec();
    } catch (erro) {
      if ((erro as { code?: number }).code !== 11000) throw erro;
    }
  }

  async listar(usuarioId: string) {
    const agora = new Date();
    const reunioes = await this.reunioes.find({ 'participantes.usuario_id': { $in: [new Types.ObjectId(usuarioId), usuarioId] } })
      .select('titulo participantes inicio fim situacao horario_alterado_em ata').lean().exec();
    for (const r of reunioes) {
      const p = r.participantes.find(pessoa => pessoa.usuario_id.toString() === usuarioId);
      const destino = `/reunioes/${r._id}`;
      const notificar = (tipo: string, versao: string, mensagem: string) => this.criar(usuarioId, {
        chave: `${tipo}:${r._id}:${versao}`, tipo, titulo: r.titulo, mensagem, destino,
      });
      if (r.situacao === 'CANCELADA') {
        await notificar('CANCELAMENTO', '1', 'Esta reunião foi cancelada.');
        continue;
      }
      if (p?.convite === 'PENDENTE' && r.fim > agora) {
        await notificar('CONVITE', r.horario_alterado_em?.toISOString() ?? '1', 'Você recebeu um convite. Abra a reunião para responder.');
      }
      if (r.horario_alterado_em) await notificar('HORARIO', r.horario_alterado_em.toISOString(), 'O horário desta reunião foi alterado. Confira os dados atuais.');
      if (r.ata?.situacao === 'EM_APROVACAO' && r.ata.aprovadores.some(id => id.toString() === usuarioId) && !r.ata.avaliacoes.some(a => a.usuario_id.toString() === usuarioId)) {
        await this.criar(usuarioId, { chave: `ATA:${r._id}:${r.ata.versao}`, tipo: 'ATA', titulo: r.titulo,
          mensagem: 'Há uma ata para você avaliar.', destino: `/reunioes/registros?id=${r._id}` });
      }
    }
    const itens = await this.notificacoes.find({ usuario_id: new Types.ObjectId(usuarioId),
      $or: [{ expira_em: { $exists: false } }, { expira_em: { $gt: agora } }] })
      .select('titulo mensagem destino tipo lida_em criada_em').sort({ criada_em: -1, _id: -1 }).limit(100).lean().exec();
    return { itens, nao_lidas: itens.filter(n => !n.lida_em).length };
  }

  async ler(id: string, usuarioId: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Notificação não encontrada');
    const n = await this.notificacoes.findOne({ _id: id, usuario_id: new Types.ObjectId(usuarioId) }).exec();
    if (!n) throw new NotFoundException('Notificação não encontrada');
    if (!n.lida_em) await this.notificacoes.updateOne({ _id: n._id, usuario_id: n.usuario_id, lida_em: { $exists: false } }, { $set: { lida_em: new Date() } }).exec();
    return { mensagem: 'Notificação marcada como lida' };
  }

  async invalidarPresenca(reuniaoId: string) {
    await this.notificacoes.updateMany({ tipo: 'PRESENCA', chave: { $regex: `^PRESENCA:${reuniaoId}:` } },
      { $set: { expira_em: new Date() } }).exec();
  }
}
