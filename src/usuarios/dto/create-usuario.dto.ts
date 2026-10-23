import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

import { TemaUsuario } from '../schemas/usuario.schema.js';

export class CreateUsuarioDto {
  @IsString({ message: 'Informe o nome' })
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres' })
  nome: string;

  @IsEmail({}, { message: 'Informe um e-mail válido' })
  email: string;

  @IsString({ message: 'Informe a senha' })
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres' })
  senha: string;

  @IsOptional()
  @IsEnum(TemaUsuario, { message: 'Tema deve ser claro, escuro ou sistema' })
  tema?: TemaUsuario;
}
