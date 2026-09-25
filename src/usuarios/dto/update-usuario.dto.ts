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
  @IsString()
  @MinLength(2)
  nome?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  senha?: string;

  @IsOptional()
  @IsEnum(TipoUsuario)
  tipo?: TipoUsuario;

  @IsOptional()
  @IsEnum(TemaUsuario)
  tema?: TemaUsuario;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
