import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

import { TemaUsuario, TipoUsuario } from '../schemas/usuario.schema.js';

export class UpdateUsuarioDto {
  @IsOptional()
  @IsString({ message: 'Informe o nome' })
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres' })
  nome?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Informe um e-mail válido' })
  email?: string;

  @IsOptional()
  @IsString({ message: 'Informe a senha' })
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres' })
  senha?: string;

  @IsOptional()
  @IsEnum(TipoUsuario, { message: 'Tipo deve ser USUARIO ou ADMIN_SISTEMA' })
  tipo?: TipoUsuario;

  @IsOptional()
  @IsEnum(TemaUsuario, { message: 'Tema deve ser claro, escuro ou sistema' })
  tema?: TemaUsuario;

  @IsOptional()
  @IsBoolean({ message: 'Informe se a conta está ativa' })
  ativo?: boolean;
}
