import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

import { TemaUsuario } from '../schemas/usuario.schema.js';

export class AtualizarPerfilDto {
  @IsOptional()
  @IsString({ message: 'Informe o nome' })
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres' })
  nome?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Informe um e-mail válido' })
  email?: string;

  @IsOptional()
  @IsEnum(TemaUsuario, { message: 'Tema deve ser claro, escuro ou sistema' })
  tema?: TemaUsuario;
}
