import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrganizacaoDocument = HydratedDocument<Organizacao>;

export enum StatusOrganizacao {
  PENDENTE = 'PENDENTE',
  APROVADA = 'APROVADA',
  REVOGADA = 'REVOGADA',
}

export enum PapelOrganizacao {
  ADMIN = 'ADMIN',
  MEMBRO = 'MEMBRO',
}

export enum StatusMembroOrganizacao {
  PENDENTE = 'PENDENTE',
  APROVADO = 'APROVADO',
  REJEITADO = 'REJEITADO',
}

@Schema({ _id: false })
export class MembroOrganizacao {
  @Prop({
    type: Types.ObjectId,
    ref: 'Usuario',
    required: true,
  })
  usuario_id: Types.ObjectId;

  @Prop({
    type: String,
    enum: PapelOrganizacao,
    required: true,
  })
  papel: PapelOrganizacao;

  @Prop({
    type: String,
    enum: StatusMembroOrganizacao,
    default: StatusMembroOrganizacao.PENDENTE,
  })
  status: StatusMembroOrganizacao;

  @Prop({ default: Date.now })
  solicitado_em: Date;

  @Prop()
  aprovado_em?: Date;
}

export const MembroOrganizacaoSchema =
  SchemaFactory.createForClass(MembroOrganizacao);

@Schema({
  collection: 'organizacoes',
  timestamps: {
    createdAt: 'criado_em',
    updatedAt: 'atualizado_em',
  },
})
export class Organizacao {
  @Prop({
    required: true,
    trim: true,
  })
  nome: string;

  @Prop()
  descricao?: string;

  @Prop({
    type: String,
    enum: StatusOrganizacao,
    default: StatusOrganizacao.PENDENTE,
  })
  status: StatusOrganizacao;

  @Prop({
    type: Types.ObjectId,
    ref: 'Usuario',
    required: true,
  })
  criada_por: Types.ObjectId;

  @Prop({
    type: [MembroOrganizacaoSchema],
    default: [],
  })
  membros: MembroOrganizacao[];
}

export const OrganizacaoSchema = SchemaFactory.createForClass(Organizacao);
