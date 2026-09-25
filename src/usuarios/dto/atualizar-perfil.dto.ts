import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

import { TemaUsuario } from '../schemas/usuario.schema.js';

export class AtualizarPerfilDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nome?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(TemaUsuario)
  tema?: TemaUsuario;
}
