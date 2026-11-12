import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'notificacoes', timestamps: { createdAt: 'criada_em', updatedAt: 'atualizada_em' } })
export class Notificacao {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) usuario_id: Types.ObjectId;
  @Prop({ required: true }) chave: string;
  @Prop({ required: true }) titulo: string;
  @Prop({ required: true }) mensagem: string;
  @Prop({ required: true }) destino: string;
  @Prop({ required: true }) tipo: string;
  @Prop() lida_em?: Date;
  @Prop() expira_em?: Date;
  criada_em: Date;
}
export type NotificacaoDocument = HydratedDocument<Notificacao>;
export const NotificacaoSchema = SchemaFactory.createForClass(Notificacao);
NotificacaoSchema.index({ usuario_id: 1, chave: 1 }, { unique: true });
