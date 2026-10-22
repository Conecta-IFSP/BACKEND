import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { StatusOrganizacao } from '../schemas/organizacao.schema.js';

export class UpdateOrganizacaoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nome?: string;

  @IsOptional()
  @IsString({ message: 'Informe a cidade' })
  @MinLength(2, { message: 'Informe a cidade' })
  @MaxLength(60, { message: 'A cidade deve ter no máximo 60 caracteres' })
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  descricao?: string;

  @IsOptional()
  @IsEnum(StatusOrganizacao)
  status?: StatusOrganizacao;
}
