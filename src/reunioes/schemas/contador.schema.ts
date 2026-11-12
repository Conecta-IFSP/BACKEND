import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ContadorDocument = HydratedDocument<Contador>;

// Numeração sequencial; o _id identifica a série, por exemplo "atas:<comissão>:2026".
@Schema({ collection: 'contadores', versionKey: false })
export class Contador {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ required: true })
  valor: number;
}

export const ContadorSchema = SchemaFactory.createForClass(Contador);
