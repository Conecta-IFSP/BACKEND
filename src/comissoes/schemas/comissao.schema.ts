import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ComissaoDocument = HydratedDocument<Comissao>;

export enum PapelComissao {
  RESPONSAVEL = 'RESPONSAVEL',
  MEMBRO = 'MEMBRO',
}

@Schema({ _id: false })
export class MembroComissao {
  @Prop({
    type: Types.ObjectId,
    ref: 'Usuario',
    required: true,
  })
  usuario_id: Types.ObjectId;

  @Prop({
    type: String,
    enum: PapelComissao,
    required: true,
  })
  papel: PapelComissao;

  @Prop({
    default: Date.now,
  })
  adicionado_em: Date;
}

export const MembroComissaoSchema =
  SchemaFactory.createForClass(MembroComissao);

@Schema({
  collection: 'comissoes',
  timestamps: {
    createdAt: 'criado_em',
    updatedAt: 'atualizado_em',
  },
  versionKey: false,
})
export class Comissao {
  @Prop({
    required: true,
    trim: true,
  })
  nome: string;

  @Prop()
  descricao?: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'Organizacao',
    required: true,
  })
  organizacao_id: Types.ObjectId;

  @Prop({
    type: [MembroComissaoSchema],
    default: [],
  })
  membros: MembroComissao[];

  @Prop({
    default: true,
  })
  ativo: boolean;
}

export const ComissaoSchema = SchemaFactory.createForClass(Comissao);
