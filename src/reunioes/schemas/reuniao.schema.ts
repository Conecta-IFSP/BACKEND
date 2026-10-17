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

@Schema({
  collection: 'reunioes',
  timestamps: {
    createdAt: 'criado_em',
    updatedAt: 'atualizado_em',
  },
  versionKey: false,
})
export class Reuniao {
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
    type: [String],
    default: [],
  })
  pauta: string[];

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
