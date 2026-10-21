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

export enum ProvedorAutenticacao {
  LOCAL = 'LOCAL',
  GOOGLE = 'GOOGLE',
  AMBOS = 'AMBOS',
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
    required: false,
    select: false,
  })
  senha_hash?: string;

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

  @Prop({ default: true })
  email_verificado: boolean;

  @Prop({
    default: true,
  })
  ativo: boolean;

  @Prop({ select: false, sparse: true, unique: true })
  googleId?: string;

  @Prop({
    type: String,
    enum: ProvedorAutenticacao,
    default: ProvedorAutenticacao.LOCAL,
  })
  provedorAutenticacao: ProvedorAutenticacao;

  @Prop({ select: false })
  avatarUrl?: string;
}

export const UsuarioSchema = SchemaFactory.createForClass(Usuario);
