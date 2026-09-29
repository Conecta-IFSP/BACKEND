import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UsuarioDocument = HydratedDocument<Usuario>;

export enum TipoUsuario {
  USUARIO = 'USUARIO',
  ADMIN_SISTEMA = 'ADMIN_SISTEMA',
}

export enum TemaUsuario {
  CLARO = 'claro',
  ESCURO = 'escuro',
  SISTEMA = 'sistema',
}

@Schema({
  collection: 'usuarios',
  timestamps: {
    createdAt: 'criado_em',
    updatedAt: 'atualizado_em',
  },
})
export class Usuario {
  @Prop({
    required: true,
    trim: true,
  })
  nome: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  email: string;

  @Prop({
    required: true,
    select: false,
  })
  senha_hash: string;

  // Compatibilidade com contas anteriores à padronização dos campos.
  @Prop({ select: false })
  senhaHash?: string;

  @Prop({
    type: String,
    enum: TipoUsuario,
    default: TipoUsuario.USUARIO,
  })
  tipo: TipoUsuario;

  @Prop({
    type: String,
    enum: TemaUsuario,
    default: TemaUsuario.SISTEMA,
  })
  tema: TemaUsuario;

  @Prop({ select: false })
  reset_senha_token_hash?: string;

  @Prop({ select: false })
  reset_senha_expira_em?: Date;

  @Prop({ select: false })
  verificacao_email_codigo_hash?: string;

  @Prop({ select: false })
  verificacao_email_expira_em?: Date;

  // Contas antigas não possuem este campo e devem continuar acessíveis.
  @Prop({ default: true })
  email_verificado: boolean;

  @Prop({
    default: true,
  })
  ativo: boolean;
}

export const UsuarioSchema = SchemaFactory.createForClass(Usuario);
