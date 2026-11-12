import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReuniaoDocument = HydratedDocument<Reuniao>;

export enum SituacaoReuniao {
  AGENDADA = 'AGENDADA',
  CANCELADA = 'CANCELADA',
}

export enum RespostaConvite {
  PENDENTE = 'PENDENTE',
  ACEITO = 'ACEITO',
  RECUSADO = 'RECUSADO',
}

export enum SituacaoPresenca {
  AGUARDANDO = 'AGUARDANDO',
  CONFIRMADA = 'CONFIRMADA',
  RECUSADA = 'RECUSADA',
}

export enum OrigemPresenca {
  LINK = 'LINK',
  PROPRIO = 'PROPRIO',
  RESPONSAVEL = 'RESPONSAVEL',
}

@Schema({ _id: false })
export class Presenca {
  @Prop({ required: true })
  entrada: Date;

  @Prop()
  saida?: Date;

  @Prop({
    type: String,
    enum: SituacaoPresenca,
    required: true,
  })
  situacao: SituacaoPresenca;

  @Prop({
    type: String,
    enum: OrigemPresenca,
    required: true,
  })
  marcada_por: OrigemPresenca;
}

export const PresencaSchema = SchemaFactory.createForClass(Presenca);

@Schema({ _id: false })
export class Participante {
  @Prop({
    type: Types.ObjectId,
    ref: 'Usuario',
    required: true,
  })
  usuario_id: Types.ObjectId;

  @Prop({
    type: String,
    enum: RespostaConvite,
    default: RespostaConvite.PENDENTE,
  })
  convite: RespostaConvite;

  @Prop({ type: PresencaSchema })
  presenca?: Presenca;
}

export const ParticipanteSchema = SchemaFactory.createForClass(Participante);

export enum SituacaoAta {
  RASCUNHO = 'RASCUNHO',
  EM_APROVACAO = 'EM_APROVACAO',
  APROVADA = 'APROVADA',
  REPROVADA = 'REPROVADA',
  CANCELADA = 'CANCELADA',
}

export enum DecisaoAta {
  APROVADA = 'APROVADA',
  REPROVADA = 'REPROVADA',
}

@Schema({ _id: false })
export class AvaliacaoAta {
  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  usuario_id: Types.ObjectId;

  @Prop({ type: String, enum: DecisaoAta, required: true })
  decisao: DecisaoAta;

  // Parágrafo da ata apontado por quem reprovou.
  @Prop({ trim: true, maxlength: 20000 })
  trecho?: string;

  @Prop({ trim: true, maxlength: 500 })
  justificativa?: string;

  @Prop({ required: true })
  em: Date;
}
export const AvaliacaoAtaSchema = SchemaFactory.createForClass(AvaliacaoAta);

@Schema({ _id: false })
export class Ata {
  @Prop({ required: true, minlength: 20, maxlength: 20000 })
  conteudo: string;

  @Prop({ required: true, min: 1 })
  versao: number;

  @Prop({ type: String, required: true, enum: SituacaoAta })
  situacao: SituacaoAta;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  autor_id: Types.ObjectId;

  @Prop({ required: true })
  atualizada_em: Date;

  @Prop()
  enviada_em?: Date;

  @Prop()
  prazo?: Date;

  @Prop({ type: [Types.ObjectId], default: [] })
  aprovadores: Types.ObjectId[];

  @Prop({ type: [AvaliacaoAtaSchema], default: [] })
  avaliacoes: AvaliacaoAta[];

  // Sequencial por comissão e ano, atribuído na aprovação.
  @Prop({ min: 1 })
  numero?: number;

  @Prop()
  ano?: number;

  @Prop()
  aprovada_em?: Date;

  @Prop()
  cancelada_em?: Date;
}
export const AtaSchema = SchemaFactory.createForClass(Ata);

// O _id do anexo é o id do arquivo guardado no GridFS (bucket "anexos").
@Schema({ _id: false })
export class Anexo {
  @Prop({ type: Types.ObjectId, required: true })
  _id: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  nome: string;

  @Prop({ required: true })
  tipo: string;

  @Prop({ required: true, min: 1 })
  tamanho: number;

  @Prop({ required: true })
  enviado_em: Date;
}
export const AnexoSchema = SchemaFactory.createForClass(Anexo);

@Schema({
  collection: 'reunioes',
  timestamps: {
    createdAt: 'criado_em',
    updatedAt: 'atualizado_em',
  },
  versionKey: false,
})
export class Reuniao {
  @Prop({ default: 0 }) presencas_revisao: number;
  @Prop({ type: Object, select: false })
  acesso_presenca?: { hash: string; inicio: Date; fim: Date; responsavel_id: string; criado_em: Date };

  @Prop({ type: [Object], default: [], select: false })
  historico_presencas: Record<string, unknown>[];

  @Prop({ type: AtaSchema })
  ata?: Ata;

  // Atas reprovadas que deram lugar a uma nova; a mais recente fica por último.
  @Prop({ type: [AtaSchema], default: [] })
  atas_canceladas: Ata[];

  @Prop({
    type: Types.ObjectId,
    ref: 'Comissao',
    required: true,
  })
  comissao_id: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
  })
  titulo: string;

  @Prop({
    type: String,
    default: '',
    trim: true,
  })
  local: string;

  @Prop({ required: true })
  inicio: Date;

  @Prop({ required: true })
  fim: Date;

  @Prop({ type: Boolean, default: false })
  dia_inteiro: boolean;

  // Preenchido quando a data ou o horário mudam; o app usa para pedir nova confirmação ao convidado.
  @Prop()
  horario_alterado_em?: Date;

  @Prop({ type: [AnexoSchema], default: [] })
  anexos: Anexo[];

  @Prop({
    type: String,
    default: '',
    trim: true,
  })
  pauta: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'Usuario',
    required: true,
  })
  criada_por: Types.ObjectId;

  @Prop({
    type: String,
    enum: SituacaoReuniao,
    default: SituacaoReuniao.AGENDADA,
  })
  situacao: SituacaoReuniao;

  @Prop({
    type: [ParticipanteSchema],
    default: [],
  })
  participantes: Participante[];
}

export const ReuniaoSchema = SchemaFactory.createForClass(Reuniao);

ReuniaoSchema.index({ comissao_id: 1, inicio: 1 });
ReuniaoSchema.index({ 'participantes.usuario_id': 1, inicio: 1 });
