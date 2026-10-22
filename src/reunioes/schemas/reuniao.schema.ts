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

@Schema({ _id: false })
export class Ata {
  @Prop({ required: true, minlength: 20, maxlength: 20000 })
  conteudo: string;

  @Prop({ required: true, min: 1 })
  versao: number;

  @Prop({ required: true, enum: ['RASCUNHO', 'EM_APROVACAO', 'APROVADA'] })
  situacao: string;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  autor_id: Types.ObjectId;

  @Prop({ required: true })
  atualizada_em: Date;

  @Prop({ type: [Types.ObjectId], default: [] })
  aprovadores: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], default: [] })
  aprovacoes: Types.ObjectId[];
}
export const AtaSchema = SchemaFactory.createForClass(Ata);

@Schema({
  collection: 'reunioes',
  timestamps: {
    createdAt: 'criado_em',
    updatedAt: 'atualizado_em',
  },
  versionKey: false,
})
export class Reuniao {
  @Prop({ type: AtaSchema })
  ata?: Ata;
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
    required: true,
    trim: true,
  })
  local: string;

  @Prop({ required: true })
  inicio: Date;

  @Prop({ required: true })
  fim: Date;

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
