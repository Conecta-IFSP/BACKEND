import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

import { TemaUsuario } from '../schemas/usuario.schema.js';

export class CreateUsuarioDto {
  @IsString()
  @MinLength(2)
  nome: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  senha: string;

  @IsOptional()
  @IsEnum(TemaUsuario)
  tema?: TemaUsuario;
}
